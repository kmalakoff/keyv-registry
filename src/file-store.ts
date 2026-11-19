import fs from 'node:fs';

type Deserialize = (raw: unknown) => unknown;
type KeyvFileStore = { opts: { checkFileLock?: boolean }; releaseFileLock?: () => void };
type KeyvFileClass = new (options: Record<string, unknown>) => KeyvFileStore;

// The shape keyv-file's load accepts: `cache` as [key, value] pairs, or an object keyed by key.
export function assertStoreShape(data: unknown): void {
  const cache = (data as { cache?: unknown } | null)?.cache;
  if (cache === null || typeof cache !== 'object') throw new TypeError('not a keyv-file store: expected an object with a "cache" field');
  if (Array.isArray(cache)) new Map(cache as [unknown, unknown][]);
}

// Keep the original error as `cause` (the `ErrorOptions` argument is not in this project's lib target)
export function damagedStoreError(filename: string, cause: unknown, advice = 'Repair it, restore it from a backup, or move it aside to start an empty store.'): Error {
  const error = new Error(`Cannot open the store file ${filename}: ${(cause as Error)?.message ?? cause}. The file was not changed. ${advice}`);
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

/**
 * Construct a keyv-file store and throw if its file exists but could not be loaded.
 * keyv-file reads the whole file in its constructor and starts empty on any error but ENOENT; its next write would replace the file.
 */
export default function openKeyvFile(KeyvFile: KeyvFileClass, defaultDeserialize: Deserialize, options: Record<string, unknown>): KeyvFileStore {
  if (options.separatedFile) return new KeyvFile(options);

  const deserialize = (options.deserialize as Deserialize | undefined) ?? defaultDeserialize;
  let loaded = false;
  let failure: unknown;
  let advice: string | undefined;
  const exitListeners = process.listeners('exit');
  const sigintListeners = process.listeners('SIGINT');
  const store = new KeyvFile({
    ...options,
    deserialize: (raw: unknown) => {
      try {
        const data = deserialize(raw);
        assertStoreShape(data);
        loaded = true;
        return data;
      } catch (err) {
        failure = err;
        throw err;
      }
    },
  });
  if (loaded) return store;

  const filename = options.filename as string;
  // deserialize was never called: the read failed. Read again for its cause; a file that is still missing is a new store.
  if (failure === undefined) {
    try {
      fs.readFileSync(filename);
      failure = new Error('it could not be read when the store opened it');
      advice = 'It is readable now, so try again.';
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return store;
      failure = err;
    }
  }
  if (store.opts.checkFileLock) {
    store.releaseFileLock?.();
    // The discarded instance's exit and SIGINT hooks would later delete a lock another process may hold.
    for (const listener of process.listeners('exit')) if (!exitListeners.includes(listener)) process.removeListener('exit', listener);
    for (const listener of process.listeners('SIGINT')) if (!sigintListeners.includes(listener)) process.removeListener('SIGINT', listener);
  }
  throw damagedStoreError(filename, failure, advice);
}
