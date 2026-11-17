import assert from 'assert';
import createStore, { clearAdapterCache, registerAdapter } from 'keyv-registry';
import { createRequire } from 'module';
import * as path from 'path';
import { KEYV_OPTION_KEYS } from '../../src/constants.ts';
import { splitOptions } from '../../src/worker.ts';

// biome-ignore lint/suspicious/noExplicitAny: the spy adapter is plain CommonJS
const Spy = createRequire(import.meta.url)(path.resolve('test', 'data', 'spy-adapter.cjs')) as any;

describe('options split', () => {
  before(() => {
    registerAdapter('spy:', { package: path.resolve('test', 'data', 'spy-adapter.cjs'), optionsMapper: (url) => ({ path: `mapped${url.pathname}` }) });
  });
  beforeEach(() => {
    clearAdapterCache();
    Spy.options = undefined;
  });

  it('lists exactly the keys of keyv 6 KeyvOptions', () => {
    assert.deepEqual([...KEYV_OPTION_KEYS].sort(), ['checkExpired', 'compression', 'encryption', 'namespace', 'sanitize', 'serialization', 'stats', 'store', 'ttl']);
  });

  describe('splitOptions', () => {
    it('sends Keyv keys to Keyv and the rest to the adapter, and drops store', () => {
      const result = splitOptions({ namespace: 'n', ttl: 5, writeDelay: 100, store: {}, pretty: true });
      assert.deepEqual(result.keyvOptions, { namespace: 'n', ttl: 5 });
      assert.deepEqual(result.adapterOptions, { writeDelay: 100, pretty: true });
    });
  });

  describe('createStore', () => {
    it('splits only code options: Keyv options from code go to Keyv, query parameters go to the adapter', async () => {
      const store = await createStore<string>('spy://host/x?table=t&namespace=fromUri', { ttl: 1000, namespace: 'fromCode' });
      assert.deepEqual(Spy.options, { table: 't', namespace: 'fromUri', path: 'mapped/x' });
      assert.equal(store.namespace, 'fromCode');
    });

    it('does not apply a Keyv option named in a query parameter to Keyv', async () => {
      const store = await createStore<string>('spy://host/x?namespace=fromUri&ttl=5');
      assert.notEqual(store.namespace, 'fromUri');
      assert.equal(store.ttl, undefined);
      assert.deepEqual(Spy.options, { namespace: 'fromUri', ttl: 5, path: 'mapped/x' });
    });

    it('query parameters are adapter options and code options win over them and the mapper', async () => {
      await createStore('spy://host/x?table=fromUri&path=fromUri', { table: 'fromCode', path: 'fromCode' });
      assert.deepEqual(Spy.options, { table: 'fromCode', path: 'fromCode' });
    });

    it('still round-trips values through the Map-backed adapter', async () => {
      const store = await createStore<string>('spy://host/x', { namespace: 'ns' });
      await store.set('k', 'v');
      assert.equal(await store.get('k'), 'v');
    });

    it('reaches keyv-duckdb as an adapter option, which rejects it as unknown', async () => {
      await assert.rejects(createStore<string>(`duckdb://./.tmp/options-${process.pid}/store.duckdb?ttl=1000`), /unrecognised option 'ttl'/);
    });
  });
});
