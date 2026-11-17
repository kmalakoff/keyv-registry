import assert from 'assert';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { safeRmSync } from 'fs-remove-compat';
import createStore, { clearAdapterCache } from 'keyv-registry';
import * as path from 'path';
import { pathToFileURL } from 'url';

describe('createStore', () => {
  beforeEach(() => {
    clearAdapterCache();
  });

  describe('memory protocol', () => {
    it('creates memory store with Promise API', async () => {
      const store = await createStore('memory://');

      assert.ok(store);
      assert.equal(typeof store.get, 'function');
      assert.equal(typeof store.set, 'function');
      assert.equal(typeof store.delete, 'function');
      assert.equal(typeof store.clear, 'function');
    });

    it('creates memory store with callback API', (done) => {
      createStore('memory://', (err, store) => {
        assert.ifError(err);
        assert.ok(store);
        assert.equal(typeof store.get, 'function');
        assert.equal(typeof store.set, 'function');
        done();
      });
    });

    it('memory store can set and get values', async () => {
      const store = await createStore<string>('memory://');

      await store.set('key1', 'value1');
      const result = await store.get('key1');

      assert.equal(result, 'value1');
    });

    it('memory store respects namespace option', async () => {
      const store1 = await createStore<string>('memory://', { namespace: 'ns1' });
      const store2 = await createStore<string>('memory://', { namespace: 'ns2' });

      await store1.set('key', 'value1');
      await store2.set('key', 'value2');

      assert.equal(await store1.get('key'), 'value1');
      assert.equal(await store2.get('key'), 'value2');
    });

    it('parses URI query params as options', async () => {
      const store = await createStore<string>('memory://?namespace=fromUri');

      // The namespace should be set from the URI
      await store.set('testKey', 'testValue');
      const result = await store.get('testKey');
      assert.equal(result, 'testValue');
    });
  });

  describe('error handling', () => {
    it('rejects invalid URI with Promise API', async () => {
      try {
        await createStore('not-a-valid-uri');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.ok((err as Error).message.includes('Invalid URI'));
      }
    });

    it('calls callback with error for invalid URI', (done) => {
      createStore('not-a-valid-uri', (err, store) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Invalid URI'));
        assert.equal(store, undefined);
        done();
      });
    });

    it('rejects unknown protocol with Promise API', async () => {
      try {
        await createStore('unknownprotocol://localhost');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.ok((err as Error).message.includes('Unknown protocol'));
        assert.ok((err as Error).message.includes('registerAdapter'));
      }
    });

    it('calls callback with error for unknown protocol', (done) => {
      createStore('unknownprotocol://localhost', (err, store) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Unknown protocol'));
        assert.equal(store, undefined);
        done();
      });
    });
  });

  describe('store passthrough', () => {
    it('uses pre-instantiated store when provided', async () => {
      // Create a mock store
      const mockStore = new Map();
      const store = await createStore('memory://ignored', { store: mockStore });

      assert.ok(store);
      // The store should be using our mock
    });
  });

  describe('dual-boot API', () => {
    it('returns Promise when no callback', () => {
      const result = createStore('memory://');
      assert.ok(result instanceof Promise);
    });

    it('returns undefined when callback provided', () => {
      const result = createStore('memory://', () => {});
      assert.equal(result, undefined);
    });

    it('accepts options as second arg with callback as third', (done) => {
      createStore('memory://', { namespace: 'test' }, (err, store) => {
        assert.ifError(err);
        assert.ok(store);
        done();
      });
    });

    it('accepts callback as second arg (no options)', (done) => {
      createStore('memory://', (err, store) => {
        assert.ifError(err);
        assert.ok(store);
        done();
      });
    });
  });

  describe('file protocol', () => {
    const dir = `.tmp/createStore-file-${process.pid}`;

    after(() => {
      safeRmSync(dir);
    });

    it('creates a file store that round-trips values', async () => {
      const store = await createStore(`file://./${dir}/store.json`);

      assert.ok(store);
      await store.set('key', 'value');
      assert.equal(await store.get('key'), 'value');
    });
  });

  describe('file-backed stores', () => {
    const dir = path.resolve('.tmp', `createStore-files-${process.pid}`);
    after(() => safeRmSync(dir));

    for (const [protocol, ext] of [
      ['sqlite', 'sqlite'],
      ['file', 'json'],
    ]) {
      it(`${protocol}: creates a missing parent folder and round-trips`, async () => {
        const filename = path.join(dir, protocol, 'missing', 'nested', `store.${ext}`);
        const store = await createStore<string>(pathToFileURL(filename).href.replace(/^file:/, `${protocol}:`));
        await store.set('key', 'value');
        assert.equal(await store.get('key'), 'value');
        await store.disconnect();
        assert.ok(existsSync(path.dirname(filename)));
      });
    }

    it('sqlite: rejects at createStore when the folder cannot be created', async () => {
      const blocker = path.join(dir, 'blocker');
      mkdirSync(dir, { recursive: true });
      writeFileSync(blocker, '');
      await assert.rejects(createStore(pathToFileURL(path.join(blocker, 'sub', 'store.sqlite')).href.replace(/^file:/, 'sqlite:')));
    });

    describe('adapter errors (keyv 6)', () => {
      // A directory where the database file should be: createStore resolves, the adapter then fails.
      const asDir = () => {
        const target = path.join(dir, `is-a-dir-${Math.random().toString(36).slice(2)}`);
        mkdirSync(target, { recursive: true });
        return pathToFileURL(target).href.replace(/^file:/, 'sqlite:');
      };

      it('rejects the operation when no error listener is attached', async () => {
        const store = await createStore<string>(asDir());
        await assert.rejects(store.set('key', 'value'));
      });

      it('returns fallbacks and reports to an error listener', async () => {
        const store = await createStore<string>(asDir());
        const errors: Error[] = [];
        store.on('error', (err: Error) => errors.push(err));
        assert.equal(await store.set('key', 'value'), false);
        assert.equal(await store.get('key'), undefined);
        assert.ok(errors.length > 0);
      });
    });
  });

  describe('adapter options mapping', () => {
    it('should work with protocols that accept direct URL', async () => {
      // redis takes the URI string directly rather than an options object
      const store = await createStore('redis://localhost:6379');

      assert.ok(store);
      assert.equal(typeof store.get, 'function');
      assert.equal(typeof store.set, 'function');
    });

    it('should parse query parameters correctly', async () => {
      const store = await createStore('memory://?namespace=testns&ttl=3600');
      assert.ok(store);

      // Verify the store works
      await store.set('test', 'value');
      const result = await store.get('test');
      assert.equal(result, 'value');
    });

    it('should merge query parameters with options correctly', async () => {
      const store = await createStore('memory://?namespace=uriname', { namespace: 'optionname' });
      assert.ok(store);

      // User options should override URI parameters
      await store.set('test', 'value');
      const result = await store.get('test');
      assert.equal(result, 'value');
    });
  });
});
