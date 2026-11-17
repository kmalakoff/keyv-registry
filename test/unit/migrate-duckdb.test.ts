import assert from 'assert';
import { copyFileSync, mkdirSync } from 'fs';
import { safeRmSync } from 'fs-remove-compat';
import createStore, { migrateKeyv5Keys } from 'keyv-registry';
import * as path from 'path';

// Full upgrade sequence on files written by keyv-duckdb 0.1.13 with keyv 5 (test/data/keyv-duckdb-0.1.13):
// createStore opens the file (keyv-duckdb 0.2.0 converts the table), then migrateKeyv5Keys moves the default-namespace entries.
const data = path.resolve('test', 'data', 'keyv-duckdb-0.1.13');
const dir = path.resolve('.tmp', `migrate-duckdb-${process.pid}`);
const ENCRYPTION_KEY = 'dummy-fixture-key-0.1.13-32chars!';

describe('migrateKeyv5Keys on keyv-duckdb 0.1.13 files', () => {
  before(() => safeRmSync(dir));
  after(() => safeRmSync(dir));

  for (const [name, options] of [
    ['plain.duckdb', {}],
    ['enc.duckdb', { encryptionKey: ENCRYPTION_KEY }],
  ] as const) {
    it(`${name}: converts, then migrates, keeps expiry, drops the expired entry, leaves app: alone and is idempotent`, async () => {
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, name);
      copyFileSync(path.join(data, name), file);

      const store = await createStore<unknown>(`duckdb://${file.startsWith('/') ? '' : '/'}${file.split(path.sep).join('/')}`, options);
      assert.equal(await store.get('num'), undefined, 'keys sit under namespace keyv until migrated');

      assert.equal(await migrateKeyv5Keys(store), 4); // token, dcr client, num, ttl; `expired` is skipped
      assert.deepEqual(await store.get('user@example.com:google:token'), { access_token: 'dummy-at', refresh_token: 'dummy-rt' });
      assert.deepEqual(await store.get('dcr:client:abc'), { client_id: 'abc' });
      assert.equal(await store.get('num'), 42);
      assert.equal(await store.get('expired'), undefined);

      // The expiry column is NULL after conversion, so the expiry must come from the stored value.
      const raw = (await store.getRaw('ttl')) as { value: string; expires?: number };
      assert.equal(raw.value, 'expiring');
      assert.ok(typeof raw.expires === 'number' && raw.expires > Date.now() + 50 * 365 * 24 * 3600 * 1000, 'expiry kept (about a century ahead)');

      assert.equal(await migrateKeyv5Keys(store), 0);
      await store.disconnect();

      const app = await createStore<unknown>(`duckdb://${file.startsWith('/') ? '' : '/'}${file.split(path.sep).join('/')}`, { ...options, namespace: 'app' });
      assert.equal(await app.get('k1'), 'nsval', 'app namespace untouched');
      await app.disconnect();
    });
  }
});
