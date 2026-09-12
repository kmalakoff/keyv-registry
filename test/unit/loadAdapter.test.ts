import assert from 'assert';
import createStore, { clearAdapterCache, registerAdapter } from 'keyv-registry';

describe('loadAdapter', () => {
  beforeEach(() => {
    clearAdapterCache();
  });

  describe('missing adapter', () => {
    before(() => {
      registerAdapter('missingadapter:', { package: '@keyv/not-a-real-adapter' });
    });

    it('rejects naming the package to install with Promise API', async () => {
      try {
        await createStore('missingadapter://localhost');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.ok((err as Error).message.includes('@keyv/not-a-real-adapter'));
        assert.ok((err as Error).message.includes('npm install'));
      }
    });

    it('calls back naming the package to install with callback API', (done) => {
      createStore('missingadapter://localhost', (err, store) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('@keyv/not-a-real-adapter'));
        assert.ok(err.message.includes('npm install'));
        assert.equal(store, undefined);
        done();
      });
    });
  });
});
