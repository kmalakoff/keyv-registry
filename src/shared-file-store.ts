import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { LOCK_STALE_MS, SHARED_FILE_PACKAGES } from './constants.ts';
import { assertStoreShape, damagedStoreError } from './file-store.ts';
import { storeHooks } from './lib/store-hooks.ts';
import { retryingFs, retryTransient } from './lib/win-retry.ts';
import { isMissingModule, requirePackage } from './loadAdapter.ts';

interface Entry {
  value: unknown;
  expire?: number;
}

type Release = () => Promise<void>;
interface LockModule {
  lock(file: string, options: { fs: unknown; realpath: boolean; stale: number; onCompromised: (err: Error) => void }): Promise<Release>;
}
interface SerializeModule {
  defaultSerialize(data: unknown): string;
  defaultDeserialize(raw: string): unknown;
}
interface Packages {
  lockfile: LockModule;
  serialize: SerializeModule;
  tempSuffix: () => string;
}
interface Held {
  release: Release;
  state: { compromised: Error | null };
  acquiredAt: number;
}

export interface KeyvSharedFileOptions {
  /** The store file, in keyv-file's format */
  filename: string;
}

let loaded: Packages | undefined;

/**
 * Require the packages the store needs from the consumer's install. A failure names the package and the command that installs all of them.
 */
export function requireSharedFilePackages(names: readonly string[] = SHARED_FILE_PACKAGES): Packages {
  if (loaded && names === SHARED_FILE_PACKAGES) return loaded;
  for (const name of names) {
    try {
      requirePackage(name);
    } catch (err) {
      const cause = (err as Error & { cause?: unknown }).cause;
      const what = isMissingModule(cause, name) ? `"${name}" is not installed` : `"${name}" failed to load: ${(cause as Error)?.message}`;
      const error = new Error(`The file+shared: store needs ${names.join(', ')} installed alongside keyv-registry. ${what}. Install them: npm install ${names.join(' ')}`);
      (error as Error & { cause?: unknown }).cause = cause;
      throw error;
    }
  }
  const [lockfile, serialize, tempSuffix] = SHARED_FILE_PACKAGES.map((name) => requirePackage(name)) as [LockModule, SerializeModule, { default?: () => string } & (() => string)];
  loaded = { lockfile, serialize, tempSuffix: tempSuffix.default ?? tempSuffix };
  return loaded;
}

const live = (entry: Entry | undefined): entry is Entry => entry !== undefined && !(typeof entry.expire === 'number' && entry.expire <= Date.now());

function compromisedError(filename: string, cause: Error): Error {
  const error = new Error(`The lock on ${filename} was taken over while this write held it (the process was paused past the stale time). This write was not saved; the file holds the other writer's change.`) as Error & { code: string; cause: Error };
  error.code = 'ECOMPROMISED';
  error.cause = cause;
  return error;
}

/**
 * keyv-file's on-disk format, safe for several processes. Every write takes a cross-process lock, re-reads the file,
 * applies only its own change and renames a complete file into place; reads always see the current file.
 * Failures reject the call that caused them; no `error` event is emitted.
 */
export default class KeyvSharedFile extends EventEmitter {
  readonly opts: KeyvSharedFileOptions;
  private readonly serialize: SerializeModule['defaultSerialize'];
  private readonly deserialize: SerializeModule['defaultDeserialize'];
  readonly ttlSupport = true;
  namespace: string | undefined;
  private readonly packages: Packages;

  constructor(options: KeyvSharedFileOptions) {
    super();
    if (typeof options?.filename !== 'string') throw new TypeError('KeyvSharedFile: filename is required');
    this.packages = requireSharedFilePackages();
    this.serialize = this.packages.serialize.defaultSerialize;
    this.deserialize = this.packages.serialize.defaultDeserialize;
    this.opts = { filename: options.filename };
    this.read(); // a damaged file fails at open, not at the first write
  }

  private read(): Map<string, Entry> {
    const data = this.load();
    storeHooks.get(this)?.afterRead?.();
    return data;
  }

  private load(): Map<string, Entry> {
    const { filename } = this.opts;
    let raw: Buffer;
    try {
      raw = fs.readFileSync(filename);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
      throw damagedStoreError(filename, err);
    }
    try {
      const data = this.deserialize(raw.toString());
      assertStoreShape(data);
      const cache = (data as { cache: [string, Entry][] | Record<string, Entry> }).cache;
      return new Map(Array.isArray(cache) ? cache : Object.entries(cache));
    } catch (err) {
      throw damagedStoreError(filename, err);
    }
  }

  // The compromise is recorded, never thrown or emitted from proper-lockfile's heartbeat timer, where an
  // `error` event with no listener would be an uncaught exception in the server.
  private async lock(): Promise<Held> {
    const { filename } = this.opts;
    await fs.promises.mkdir(path.dirname(filename), { recursive: true });
    for (;;) {
      const state: Held['state'] = { compromised: null };
      try {
        const release = await this.packages.lockfile.lock(filename, {
          fs: retryingFs,
          realpath: false,
          stale: LOCK_STALE_MS,
          onCompromised: (err) => {
            state.compromised = err;
          },
        });
        return { release, state, acquiredAt: Date.now() };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ELOCKED') throw err; // held by another process: wait for it; any other failure surfaces
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  // After a compromise the lock is already gone and its write already rejected, so ERELEASED is expected then.
  // Any other release error surfaces; after a failed call it is attached to that call's own error.
  private async unlock(held: Held, failure?: Error): Promise<void> {
    try {
      await held.release();
    } catch (err) {
      if (held.state.compromised && (err as NodeJS.ErrnoException).code === 'ERELEASED') return;
      if (!failure) throw err;
      (failure as Error & { releaseError?: unknown }).releaseError = err;
    }
  }

  private tempFile(): string {
    return storeHooks.get(this)?.tempFile?.() ?? `${this.opts.filename}.${this.packages.tempSuffix()}`;
  }

  private async update<T>(change: (data: Map<string, Entry>) => T): Promise<T> {
    const { filename } = this.opts;
    const held = await this.lock();
    let temp: string | undefined;
    let failure: Error | undefined;
    try {
      const file = this.tempFile();
      temp = file;
      const data = this.read();
      const result = change(data);
      for (const [key, entry] of data) if (!live(entry)) data.delete(key);
      await fs.promises.writeFile(file, this.serialize({ cache: Array.from(data), lastExpire: Date.now() }), { mode: 0o600 });
      // The heartbeat may not have run after a pause, so a write also refuses once half the stale time has passed since the lock was
      // taken. The check and the rename are one synchronous step, repeated on every retry; Windows refuses the rename while a foreign reader has the file open.
      await retryTransient(() => {
        if (held.state.compromised || Date.now() - held.acquiredAt >= LOCK_STALE_MS / 2) throw compromisedError(filename, held.state.compromised ?? new Error(`held ${Date.now() - held.acquiredAt} ms`));
        fs.renameSync(file, filename);
      });
      return result;
    } catch (err) {
      failure = err as Error;
      if (temp !== undefined) {
        const tempFile = temp;
        try {
          await retryTransient(() => fs.promises.rm(tempFile, { force: true }));
        } catch (cleanupError) {
          Object.assign(failure, { tempFile, cleanupError }); // the write's own error stays the rejection
        }
      }
      throw failure;
    } finally {
      await this.unlock(held, failure);
    }
  }

  // Reads take the lock too, so no reader of ours holds the file open while another of ours renames over it (Windows refuses that).
  private async snapshot(): Promise<Map<string, Entry>> {
    const held = await this.lock();
    let failure: Error | undefined;
    try {
      return this.read();
    } catch (err) {
      failure = err as Error;
      throw err;
    } finally {
      await this.unlock(held, failure);
    }
  }

  async get(key: string): Promise<unknown> {
    const entry = (await this.snapshot()).get(key);
    return live(entry) ? entry.value : undefined;
  }

  async getMany(keys: string[]): Promise<unknown[]> {
    const data = await this.snapshot();
    return keys.map((key) => {
      const entry = data.get(key);
      return live(entry) ? entry.value : undefined;
    });
  }

  async has(key: string): Promise<boolean> {
    return live((await this.snapshot()).get(key));
  }

  async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    await this.update((data) => data.set(key, { value, expire: typeof ttl === 'number' && ttl > 0 ? Date.now() + ttl : undefined }));
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.update((data) => data.delete(key));
  }

  async deleteMany(keys: string[]): Promise<boolean> {
    return this.update((data) => keys.map((key) => data.delete(key)).every(Boolean));
  }

  async clear(): Promise<void> {
    await this.update((data) => data.clear());
  }

  async *iterator(namespace?: string): AsyncGenerator<[string, unknown]> {
    for (const [key, entry] of await this.snapshot()) if (live(entry) && (!namespace || key.startsWith(namespace))) yield [key, entry.value];
  }

  async disconnect(): Promise<void> {}
}
