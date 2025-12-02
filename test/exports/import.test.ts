import assert from 'assert';
import * as keyvRegistry from 'keyv-registry';
import createStore, { clearAdapterCache, getRegistry, registerAdapter } from 'keyv-registry';

describe('exports .ts', () => {
  it('default export', () => {
    assert.equal(typeof keyvRegistry.default, 'function');
  });

  it('named exports', () => {
    assert.equal(typeof createStore, 'function');
    assert.equal(typeof registerAdapter, 'function');
    assert.equal(typeof getRegistry, 'function');
    assert.equal(typeof clearAdapterCache, 'function');
  });

  it('registry exports', () => {
    assert.equal(typeof keyvRegistry.registerAdapter, 'function');
    assert.equal(typeof keyvRegistry.getRegistry, 'function');
    assert.equal(typeof keyvRegistry.clearAdapterCache, 'function');
  });
});
