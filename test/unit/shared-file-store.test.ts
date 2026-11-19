import assert from 'assert';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'fs';
import { safeRmSync } from 'fs-remove-compat';
import { Keyv } from 'keyv';
import { KeyvFile } from 'keyv-file';
import createStore, { clearAdapterCache, KeyvSharedFile } from 'keyv-registry';
import * as path from 'path';
import { TRANSIENT_CODES } from '../../src/constants.ts';
import { storeHooks } from '../../src/lib/store-hooks.ts';
import SourceStore, { requireSharedFilePackages } from '../../src/shared-file-store.ts';
import { entry, sharedUrl } from '../lib/shared-file.ts';
import waitFor from '../lib/wait-for.ts';

const dir = path.resolve('.tmp', `shared-file-store-${process.pid}`);
const TWO_ACCOUNTS = JSON.stringify({
  cache: [
    ['alice', entry('a')],
    ['bob', entry('b')],
  ],
  lastExpire: 0,
});
const posixIt = process.platform === 'win32' ? it.skip : it; // POSIX file modes do not exist on Windows

type StoreError = Error & { code?: string; cause?: NodeJS.ErrnoException };
type ReleaseError = Error & { releaseError?: Error };
type CleanupError = Error & { tempFile?: string; cleanupError?: Error };

function storeFile(name: string, content?: string): string {
  const filename = path.join(dir, name);
  mkdirSync(path.dirname(filename), { recursive: true });
  if (content !== undefined) writeFileSync(filename, content);
  return filename;
}

// The store's internal seam makes real filesystem conditions at the right moment; it only exists on the source module's class.
const sabotaged = (filename: string, hooks: { afterRead?: () => void; tempFile?: () => string }) => {
  const store = new SourceStore({ filename });
  storeHooks.set(store, hooks);
  return store;
};

const open = (filename: string) => new Keyv({ store: new KeyvSharedFile({ filename }) });
const keysOnDisk = (filename: string): string[] => JSON.parse(readFileSync(filename, 'utf8')).cache.map((e: [string]) => e[0]);

async function assertDamaged(filename: string, cause: RegExp) {
  const before = readFileSync(filename);
  await assert.rejects(createStore(sharedUrl(filename)), (err: StoreError) => {
    assert.ok(err.message.startsWith(`Cannot open the store file ${filename}: `), err.message);
    assert.ok(err.message.includes('The file was not changed. Repair it, restore it from a backup, or move it aside to start an empty store.'), err.message);
    assert.ok(err.cause instanceof Error, 'cause is the original error');
    assert.match(String(err.cause), cause);
    return true;
  });
  assert.ok(readFileSync(filename).equals(before), 'damaged file left untouched');
}

describe('file+shared: store', () => {
  beforeEach(() => clearAdapterCache());
  after(() => safeRmSync(dir));

  describe('lock packages', () => {
    it("are loaded from the consumer's install", () => {
      const packages = requireSharedFilePackages();
      assert.equal(typeof packages.lockfile.lock, 'function');
      assert.equal(typeof packages.serialize.defaultSerialize, 'function');
      assert.equal(typeof packages.tempSuffix(), 'string');
    });

    it('a missing one is named with the command that installs all three', () => {
      assert.throws(
        () => requireSharedFilePackages(['proper-lockfile', 'not-a-real-package', 'temp-suffix']),
        (err: Error & { cause?: unknown }) => {
          assert.ok(err.message.startsWith('The file+shared: store needs proper-lockfile, not-a-real-package, temp-suffix installed alongside keyv-registry.'), err.message);
          assert.ok(err.message.includes('"not-a-real-package" is not installed'), err.message);
          assert.ok(err.message.endsWith('npm install proper-lockfile not-a-real-package temp-suffix'), err.message);
          assert.ok(err.cause instanceof Error);
          return true;
        }
      );
    });
  });

  describe('file format', () => {
    it('opens a file written by keyv-file and keyv-file reads ours back', async () => {
      const filename = storeFile('format/tokens.json');
      const kf = new Keyv({ store: new KeyvFile({ filename, writeDelay: 0 }) });
      await kf.set('alice:token', { accessToken: 'a' });
      await kf.set('pending', { s: 1 }, 600000);

      const shared = open(filename);
      assert.deepEqual(await shared.get('alice:token'), { accessToken: 'a' });
      assert.deepEqual(await shared.get('pending'), { s: 1 });
      await shared.set('bob:token', { accessToken: 'b' });

      const back = new Keyv({ store: new KeyvFile({ filename }) });
      assert.deepEqual(await back.get('alice:token'), { accessToken: 'a' });
      assert.deepEqual(await back.get('bob:token'), { accessToken: 'b' });
    });

    it('opens a missing file as an empty store and creates it on the first write', async () => {
      const filename = storeFile('missing/store.json');
      const store = await createStore<string>(sharedUrl(filename));
      assert.equal(await store.get('alice'), undefined);
      assert.equal(existsSync(filename), false);
      await store.set('carol', 'c');
      assert.deepEqual(keysOnDisk(filename), ['carol']);
    });

    it('supports get, has, getMany, delete, deleteMany, clear and iteration', async () => {
      const store = open(storeFile('api/store.json'));
      await store.set('a', 1);
      await store.set('b', 2);
      await store.set('c', 3);
      assert.equal(await store.has('a'), true);
      assert.deepEqual(await store.get(['a', 'b', 'zzz']), [1, 2, undefined]);
      const seen: string[] = [];
      for await (const [key] of store.iterator()) seen.push(key);
      assert.deepEqual(seen.sort(), ['a', 'b', 'c']);
      assert.equal(await store.delete('a'), true);
      assert.equal(await store.delete('a'), false);
      assert.deepEqual(await store.delete(['b', 'c']), [true, true]);
      await store.set('d', 4);
      await store.clear();
      assert.equal(await store.get('d'), undefined);
    });

    it('ignores query parameters and code options other than the path', async () => {
      const filename = storeFile('format/options.json', TWO_ACCOUNTS);
      for (const query of ['?serialize=x', '?deserialize=x', '?filename=other.json']) {
        const store = await createStore<string>(sharedUrl(filename) + query);
        assert.equal(await store.get('alice'), 'a', query);
      }
      const store = await createStore<string>(sharedUrl(filename), { serialize: 'x', deserialize: 'x' });
      assert.equal(await store.get('bob'), 'b');
    });

    posixIt('writes the file with mode 0600 (POSIX)', async () => {
      const filename = storeFile('mode/store.json');
      await open(filename).set('alice', 'a');
      assert.equal(statSync(filename).mode & 0o777, 0o600);
    });
  });

  describe('opening an existing file', () => {
    it('rejects a truncated file and leaves it unchanged', async () => {
      await assertDamaged(storeFile('damaged/truncated.json', TWO_ACCOUNTS.slice(0, TWO_ACCOUNTS.length - 10)), /JSON|Unterminated|Expected/);
    });

    it('rejects a zero-length file and leaves it unchanged', async () => {
      await assertDamaged(storeFile('damaged/empty.json', ''), /JSON|Unexpected end/);
    });

    it('rejects JSON that is not a store and leaves it unchanged', async () => {
      await assertDamaged(storeFile('damaged/not-a-store.json', JSON.stringify({ hello: 'world' })), /not a keyv-file store/);
    });

    it('rejects a folder at the path with EISDIR', async () => {
      const filename = storeFile('damaged/folder.json');
      mkdirSync(filename);
      await assert.rejects(createStore(sharedUrl(filename)), (err: StoreError) => {
        assert.ok(err.message.startsWith(`Cannot open the store file ${filename}: `), err.message);
        assert.equal(err.cause?.code, 'EISDIR');
        return true;
      });
    });

    it('rejects a damaged file when the class is constructed directly', () => {
      const filename = storeFile('damaged/direct.json', '{');
      assert.throws(() => new KeyvSharedFile({ filename }), /Cannot open the store file/);
    });
  });

  describe('instances sharing one file', () => {
    it("keep each other's sign-in, refresh and sign-out", async () => {
      const filename = storeFile('shared/interleave.json');
      const a = open(filename);
      const b = open(filename);
      await a.set('alice:token', { accessToken: 'v1' });
      await a.set('alice:token', { accessToken: 'v2' }); // a refresh
      assert.deepEqual(await b.get('alice:token'), { accessToken: 'v2' }, 'b sees a without reopening');
      await b.set('bob:token', { accessToken: 'b1' });
      assert.deepEqual(await a.get('bob:token'), { accessToken: 'b1' });
      await a.delete('alice:token'); // a sign-out
      await b.set('carol:token', { accessToken: 'c1' }); // an unrelated write by the other instance
      assert.deepEqual(keysOnDisk(filename).sort(), ['bob:token', 'carol:token']);
    });

    it('keep all of 2 x 50 concurrent sets in one process', async () => {
      const filename = storeFile('shared/hammer.json');
      const a = open(filename);
      const b = open(filename);
      await Promise.all([...Array.from({ length: 50 }, (_, i) => a.set(`a${i}`, i)), ...Array.from({ length: 50 }, (_, i) => b.set(`b${i}`, i))]);
      assert.equal(keysOnDisk(filename).length, 100);
    });
  });

  describe('expiry', () => {
    it('does not return an expired entry and drops it from the file on the next write', async () => {
      const filename = storeFile('ttl/store.json');
      const store = open(filename);
      await store.set('short', 'x', 30);
      await store.set('long', 'y');
      await waitFor('the entry to expire', async () => (await store.get('short')) === undefined);
      assert.equal(await store.get('long'), 'y');
      await store.set('other', 'z');
      assert.deepEqual(keysOnDisk(filename).sort(), ['long', 'other']);
    });
  });

  describe('the lock', () => {
    it('a stale lock folder does not block a write and is removed', async () => {
      const filename = storeFile('lock/stale.json');
      const lock = `${filename}.lock`;
      mkdirSync(lock);
      const old = new Date(Date.now() - 60000);
      utimesSync(lock, old, old);
      await open(filename).set('alice', 'a');
      assert.equal(existsSync(lock), false);
      assert.deepEqual(keysOnDisk(filename), ['alice']);
    });

    it('leaves no lock folder or temp file after writes and reads', async () => {
      const filename = storeFile('lock/clean/store.json');
      const store = open(filename);
      await store.set('alice', 'a');
      await store.get('alice');
      await store.delete('alice');
      assert.deepEqual(readdirSync(path.dirname(filename)), ['store.json']);
    });
  });

  describe('a failed write', () => {
    // A rename onto a non-empty folder: EISDIR on POSIX. On Windows it is one of the codes the store retries, then surfaces unchanged.
    const assertRenameFailure = (err: StoreError) => {
      if (process.platform === 'win32') assert.ok(TRANSIENT_CODES.has(err.code as string), `unexpected code ${err.code}`);
      else assert.equal(err.code, 'EISDIR');
    };
    const replaceWithFolder = (filename: string) => () => {
      rmSync(filename);
      mkdirSync(path.join(filename, 'inside'), { recursive: true });
    };

    it('rejects, removes its temp file, releases the lock and leaves the path alone', async () => {
      const filename = storeFile('failed/write/store.json', TWO_ACCOUNTS);
      // Replaces the file with a folder once the write has read it, so the rename onto it cannot succeed.
      const store = new SourceStore({ filename });
      storeHooks.set(store, { afterRead: replaceWithFolder(filename) });
      await assert.rejects(store.set('carol', 'c'), (err: StoreError) => {
        assertRenameFailure(err);
        assert.equal((err as ReleaseError).releaseError, undefined);
        return true;
      });
      assert.deepEqual(readdirSync(path.dirname(filename)), ['store.json']);
      assert.ok(statSync(filename).isDirectory(), 'the path was not replaced');
    });

    it('keeps its own error and attaches the release error when the lock cannot be released', async () => {
      const filename = storeFile('failed/release/store.json', TWO_ACCOUNTS);
      const replace = replaceWithFolder(filename);
      const store = sabotaged(filename, {
        afterRead: () => {
          writeFileSync(path.join(`${filename}.lock`, 'foreign'), ''); // a file in the lock folder, so removing the lock fails
          replace();
        },
      });
      await assert.rejects(store.set('carol', 'c'), (err: StoreError) => {
        assertRenameFailure(err);
        const releaseError = (err as ReleaseError).releaseError;
        assert.ok(releaseError instanceof Error, 'the release error is attached');
        assert.equal((releaseError as StoreError).code, 'ENOTEMPTY');
        return true;
      });
    });

    it('keeps its own error and reports the temp file when that cannot be removed', async () => {
      const filename = storeFile('failed/cleanup/store.json', TWO_ACCOUNTS);
      const blocker = path.join(dir, 'failed', 'cleanup', 'temp-is-a-folder');
      mkdirSync(path.join(blocker, 'inside'), { recursive: true }); // writing the temp file fails, and so does removing a non-empty folder
      const store = sabotaged(filename, { tempFile: () => blocker });
      await assert.rejects(store.set('carol', 'c'), (err: StoreError) => {
        assert.equal(err.code, 'EISDIR');
        const failure = err as CleanupError;
        assert.equal(failure.tempFile, blocker);
        assert.ok(failure.cleanupError instanceof Error, 'the removal error is attached');
        assert.equal((failure.cleanupError as StoreError).code, 'ERR_FS_EISDIR');
        return true;
      });
      assert.ok(statSync(blocker).isDirectory());
    });

    it('releases the lock when the temp file name cannot be made', async () => {
      const filename = storeFile('failed/temp-name/store.json', TWO_ACCOUNTS);
      const store = sabotaged(filename, {
        tempFile: () => {
          throw new Error('no temp name');
        },
      });
      await assert.rejects(store.set('carol', 'c'), /no temp name/);
      assert.deepEqual(readdirSync(path.dirname(filename)), ['store.json']);
    });
  });
});
