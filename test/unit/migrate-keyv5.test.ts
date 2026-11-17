import assert from 'assert';
import { copyFileSync, mkdirSync, readFileSync } from 'fs';
import { safeRmSync } from 'fs-remove-compat';
import createStore, { KEYV5_NAMESPACE, migrateKeyv5Keys } from 'keyv-registry';
import * as path from 'path';
import { pathToFileURL } from 'url';

// Fixtures in test/data were written by keyv 5.6.0 with keyv-file 5.3.3 and @keyv/sqlite 4 (dummy values only).
// Only the refresh-token expiry was moved to the year 2100 so it never expires, and one expired row was added to the sqlite file.
const data = path.resolve('test', 'data');
const dir = path.resolve('.tmp', `migrate-keyv5-${process.pid}`);
const FAR_FUTURE = 4102444800000;

const uri = (protocol: string, file: string) => pathToFileURL(file).href.replace(/^file:/, `${protocol}:`);
const copy = (name: string, as: string) => {
  const to = path.join(dir, as);
  mkdirSync(dir, { recursive: true });
  copyFileSync(path.join(data, name), to);
  return to;
};

describe('migrateKeyv5Keys', () => {
  before(() => safeRmSync(dir));
  after(() => safeRmSync(dir));

  it('exports the keyv 5 namespace', () => {
    assert.equal(KEYV5_NAMESPACE, 'keyv');
  });

  describe('file (keyv:<key>, no namespace)', () => {
    it('is unreadable before and readable after, keeps the expiry, skips the expired entry and is idempotent', async () => {
      const file = copy('keyv5-dcr.json', 'dcr-1.json');
      const store = await createStore<unknown>(uri('file', file));
      assert.equal(await store.get('dcr:client:dcr_dummy'), undefined);

      assert.equal(await migrateKeyv5Keys(store), 2); // client + refresh; the access and provider entries expired
      assert.deepEqual(((await store.get('dcr:client:dcr_dummy')) as { client_id: string }).client_id, 'dcr_dummy');
      const raw = (await store.getRaw('dcr:refresh:dummyRT')) as { expires: number };
      assert.equal(raw.expires, FAR_FUTURE);
      assert.equal(await store.get('dcr:access:dummyAT'), undefined);

      assert.equal(await migrateKeyv5Keys(store), 0);
      await store.disconnect();
      assert.ok(!readFileSync(file, 'utf8').includes('"keyv:'), 'no keyv: keys left on disk');
    });

    it('restores the namespace the caller set and writes plain keys', async () => {
      const file = copy('keyv5-tokens.json', 'tokens-1.json');
      const store = await createStore<unknown>(uri('file', file), { namespace: 'app' });
      assert.equal(await migrateKeyv5Keys(store), 4);
      assert.equal(store.namespace, 'app');
      store.namespace = undefined;
      assert.equal(await store.get('drive:active'), 'user@example.com');
      await store.disconnect();
    });

    it('moves every entry of the token file', async () => {
      const file = copy('keyv5-tokens.json', 'tokens-2.json');
      const store = await createStore<unknown>(uri('file', file));
      assert.equal(await migrateKeyv5Keys(store), 4);
      assert.equal(await store.get('drive:active'), 'user@example.com');
      assert.deepEqual(await store.get('drive:linked'), ['user@example.com']);
      assert.equal(store.namespace, undefined);
      await store.disconnect();
    });

    it('keeps the plain key when both exist and deletes the old one', async () => {
      const file = copy('keyv5-tokens.json', 'tokens-3.json');
      const store = await createStore<unknown>(uri('file', file));
      await store.set('drive:active', 'new@example.com');
      assert.equal(await migrateKeyv5Keys(store), 3);
      assert.equal(await store.get('drive:active'), 'new@example.com');
      assert.equal(await migrateKeyv5Keys(store), 0);
      await store.disconnect();
      assert.ok(!readFileSync(file, 'utf8').includes('"keyv:'));
    });

    it('rejects when the write is refused', async () => {
      const file = copy('keyv5-tokens.json', 'tokens-4.json');
      const store = await createStore<unknown>(uri('file', file));
      store.setRaw = async () => false;
      await assert.rejects(migrateKeyv5Keys(store), /could not write migrated key/);
      assert.equal(store.namespace, undefined);
      await store.disconnect();
    });

    it('keeps the old key and rejects when a read fails behind an app error listener, and a rerun moves it', async () => {
      const file = copy('keyv5-tokens.json', 'tokens-5.json');
      const store = await createStore<unknown>(uri('file', file));
      const appErrors: Error[] = [];
      store.on('error', (err: Error) => appErrors.push(err)); // keyv then hides store errors: getRaw returns undefined
      // biome-ignore lint/suspicious/noExplicitAny: reaching the adapter to inject one failure
      const adapter = store.store as any;
      const originalGet = adapter.get.bind(adapter);
      let failed = false;
      adapter.get = async (key: string, ...rest: unknown[]) => {
        if (!failed && key.endsWith('drive:active')) {
          failed = true;
          throw new Error('injected read failure');
        }
        return originalGet(key, ...rest);
      };

      await assert.rejects(migrateKeyv5Keys(store), (err: Error & { cause?: Error }) => /drive:active/.test(err.message) && err.cause?.message === 'injected read failure');
      assert.ok(failed, 'the failure was injected');
      assert.ok(appErrors.length > 0, 'the app listener still saw the error');
      assert.equal(store.listenerCount('error'), 1, 'the temporary listener was removed');
      await store.disconnect();
      assert.ok(readFileSync(file, 'utf8').includes('keyv:drive:active'), 'the old key is still on disk');

      const again = await createStore<unknown>(uri('file', file));
      const moved = await migrateKeyv5Keys(again);
      assert.equal(await again.get('drive:active'), 'user@example.com');
      assert.ok(moved >= 1);
      await again.disconnect();
      assert.ok(!readFileSync(file, 'utf8').includes('"keyv:'));
    });
  });

  describe('sqlite (namespace keyv)', () => {
    it('is unreadable before and readable after, keeps the expiry, skips the expired entry and is idempotent', async () => {
      const file = copy('keyv5-tokens.sqlite', 'tokens-1.sqlite');
      const store = await createStore<unknown>(uri('sqlite', file));
      assert.equal(await store.get('drive:active'), undefined);

      assert.equal(await migrateKeyv5Keys(store), 4); // token, linked, active, refresh; the access row expired
      assert.equal(await store.get('drive:active'), 'user@example.com');
      const raw = (await store.getRaw('dcr:refresh:dummyRT')) as { expires: number };
      assert.equal(raw.expires, FAR_FUTURE);
      assert.equal(await store.get('dcr:access:dummyAT'), undefined);
      assert.equal(await migrateKeyv5Keys(store), 0);

      store.namespace = KEYV5_NAMESPACE;
      const left: string[] = [];
      for await (const [key] of store.iterator()) left.push(key as string);
      assert.deepEqual(left, [], 'nothing left under namespace keyv');
      await store.disconnect();
    });

    it('keeps the plain key when both exist', async () => {
      const file = copy('keyv5-tokens.sqlite', 'tokens-2.sqlite');
      const store = await createStore<unknown>(uri('sqlite', file));
      await store.set('drive:active', 'new@example.com');
      await migrateKeyv5Keys(store);
      assert.equal(await store.get('drive:active'), 'new@example.com');
      await store.disconnect();
    });
  });
});
