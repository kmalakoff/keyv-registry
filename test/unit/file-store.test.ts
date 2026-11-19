import assert from 'assert';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { safeRmSync } from 'fs-remove-compat';
import { KeyvFile } from 'keyv-file';
import createStore, { clearAdapterCache } from 'keyv-registry';
import * as path from 'path';
import { pathToFileURL } from 'url';

const dir = path.resolve('.tmp', `file-store-${process.pid}`);
// The shape keyv 6 and keyv-file write: each value is Keyv's serialized `{ value }`.
const entry = (value: string) => ({ value: JSON.stringify({ value }) });
const TWO_ACCOUNTS = JSON.stringify({
  cache: [
    ['alice', entry('a')],
    ['bob', entry('b')],
  ],
  lastExpire: 0,
});

type StoreError = Error & { code?: string; cause?: NodeJS.ErrnoException };

function storeFile(name: string, content?: string): string {
  const filename = path.join(dir, name);
  mkdirSync(path.dirname(filename), { recursive: true });
  if (content !== undefined) writeFileSync(filename, content);
  return filename;
}

function assertErrorShape(err: StoreError, filename: string): void {
  assert.ok(err.message.startsWith(`Cannot open the store file ${filename}: `), err.message);
  assert.ok(err.message.includes('The file was not changed.'), err.message);
  assert.ok(err.cause instanceof Error, 'cause is the original error');
  assert.ok(err.message.includes(err.cause.message), 'message carries the cause message');
}

async function assertDamaged(filename: string, cause: RegExp, options: Record<string, unknown> = {}) {
  const before = readFileSync(filename);
  await assert.rejects(createStore(pathToFileURL(filename).href, options), (err: StoreError) => {
    assertErrorShape(err, filename);
    assert.match(String(err.cause), cause);
    return true;
  });
  assert.ok(readFileSync(filename).equals(before), 'damaged file left untouched');
}

describe('file:// store opening an existing file', () => {
  beforeEach(() => clearAdapterCache());
  after(() => safeRmSync(dir));

  describe('opens', () => {
    it('a missing file as an empty store and creates it on the first write', async () => {
      const filename = storeFile('missing/store.json');
      const store = await createStore<string>(pathToFileURL(filename).href);
      assert.equal(await store.get('alice'), undefined);
      await store.set('carol', 'c');
      assert.deepEqual(
        JSON.parse(readFileSync(filename, 'utf8')).cache.map((e: [string]) => e[0]),
        ['carol']
      );
    });

    it('a valid file with its entries', async () => {
      const store = await createStore<string>(pathToFileURL(storeFile('valid.json', TWO_ACCOUNTS)).href);
      assert.equal(await store.get('alice'), 'a');
      assert.equal(await store.get('bob'), 'b');
    });

    it('a valid empty store', async () => {
      const store = await createStore<string>(pathToFileURL(storeFile('empty-store.json', '{"cache":[],"lastExpire":0}')).href);
      assert.equal(await store.get('alice'), undefined);
    });

    it('a file in keyv-file object form', async () => {
      const store = await createStore<string>(pathToFileURL(storeFile('object-form.json', JSON.stringify({ cache: { alice: entry('a') } }))).href);
      assert.equal(await store.get('alice'), 'a');
    });

    it('a file written with a custom format when the matching deserialize is passed', async () => {
      const filename = storeFile('custom.json', `!${TWO_ACCOUNTS}`);
      const store = await createStore<string>(pathToFileURL(filename).href, { deserialize: (raw: Buffer) => JSON.parse(raw.toString().slice(1)) });
      assert.equal(await store.get('bob'), 'b');
    });
  });

  describe('rejects and leaves the file untouched when it is', () => {
    it('truncated JSON', () => assertDamaged(storeFile('truncated.json', TWO_ACCOUNTS.slice(0, -15)), /SyntaxError/));
    it('not JSON', () => assertDamaged(storeFile('text.json', 'not a store'), /SyntaxError/));
    it('zero-length', () => assertDamaged(storeFile('zero.json', ''), /SyntaxError/));
    it('JSON without a cache', () => assertDamaged(storeFile('no-cache.json', '{"accounts":["alice"]}'), /not a keyv-file store/));
    it('JSON null', () => assertDamaged(storeFile('null.json', 'null'), /not a keyv-file store/));
    it('a cache with an entry that is not a pair', () => assertDamaged(storeFile('bad-entry.json', '{"cache":[1]}'), /TypeError/));
    it('not readable by the custom deserialize', () =>
      assertDamaged(storeFile('custom-bad.json', TWO_ACCOUNTS), /not the custom format/, {
        deserialize: () => {
          throw new Error('not the custom format');
        },
      }));

    it('a directory', async () => {
      const filename = path.join(dir, 'is-a-dir.json');
      mkdirSync(filename, { recursive: true });
      await assert.rejects(createStore(pathToFileURL(filename).href), (err: StoreError) => {
        assertErrorShape(err, filename);
        assert.equal(err.cause?.code, 'EISDIR');
        return true;
      });
      assert.deepEqual(readdirSync(filename), []);
    });

    // Windows file modes control only the read-only flag, and root reads any file: neither can make a file unreadable.
    const canDenyRead = process.platform !== 'win32' && process.getuid?.() !== 0;
    (canDenyRead ? it : it.skip)('unreadable but writable', async () => {
      const filename = storeFile('write-only.json', TWO_ACCOUNTS);
      chmodSync(filename, 0o200);
      try {
        await assert.rejects(createStore(pathToFileURL(filename).href), (err: StoreError) => {
          assertErrorShape(err, filename);
          assert.equal(err.cause?.code, 'EACCES');
          return true;
        });
      } finally {
        chmodSync(filename, 0o600);
      }
      assert.equal(readFileSync(filename, 'utf8'), TWO_ACCOUNTS);
    });
  });

  describe('with checkFileLock', () => {
    it('a damaged file rejects, releases its lock and leaves no exit or SIGINT listener behind', async () => {
      const filename = storeFile('lock-damaged.json', TWO_ACCOUNTS.slice(0, -15));
      const before = readFileSync(filename);
      const exitListeners = process.listenerCount('exit');
      const sigintListeners = process.listenerCount('SIGINT');
      await assert.rejects(createStore(pathToFileURL(filename).href, { checkFileLock: true }), (err: StoreError) => {
        assertErrorShape(err, filename);
        return true;
      });
      assert.equal(existsSync(`${filename}.lock`), false, 'lock released');
      assert.equal(process.listenerCount('exit'), exitListeners);
      assert.equal(process.listenerCount('SIGINT'), sigintListeners);
      assert.ok(readFileSync(filename).equals(before));
    });

    it('a lock held by another owner on a damaged file rejects with EEXIST and is left in place', async () => {
      const filename = storeFile('lock-held.json', TWO_ACCOUNTS.slice(0, -15));
      const before = readFileSync(filename);
      writeFileSync(`${filename}.lock`, 'other owner');
      await assert.rejects(createStore(pathToFileURL(filename).href, { checkFileLock: true }), (err: StoreError) => {
        assert.equal(err.code, 'EEXIST');
        return true;
      });
      assert.equal(readFileSync(`${filename}.lock`, 'utf8'), 'other owner');
      assert.ok(readFileSync(filename).equals(before));
    });
  });

  it('separatedFile stores open without a check: each key is its own file, read on access', async () => {
    const folder = path.join(dir, 'separated');
    const store = await createStore<string>(`${pathToFileURL(folder).href}?separatedFile=true`);
    await store.set('alice', 'a');
    await store.set('bob', 'b');
    for (const name of readdirSync(folder).filter((n) => n.includes('alice'))) writeFileSync(path.join(folder, name), '{"trunc');
    const reopened = await createStore<string>(`${pathToFileURL(folder).href}?separatedFile=true`);
    assert.equal(await reopened.get('bob'), 'b');
  });

  it('a store passed in is not checked', async () => {
    const filename = storeFile('passthrough.json', 'not a store');
    const before = readFileSync(filename);
    const store = await createStore<string>('file://ignored', { store: new KeyvFile({ filename }) });
    assert.ok(store);
    assert.ok(readFileSync(filename).equals(before));
  });
});
