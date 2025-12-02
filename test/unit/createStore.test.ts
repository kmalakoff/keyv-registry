import assert from 'assert';
import createStore from '../../src/index.ts';
import { clearAdapterCache } from '../../src/loadAdapter.ts';

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
});
