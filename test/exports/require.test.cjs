const assert = require('assert');
const keyvRegistry = require('keyv-registry');
const createStore = require('keyv-registry');
const { registerAdapter, getRegistry, clearAdapterCache } = require('keyv-registry');

describe('exports .cjs', () => {
  it('default export', () => {
    assert.equal(typeof keyvRegistry, 'function');
  });

  it('named exports', () => {
    assert.equal(typeof createStore, 'function');
    assert.equal(typeof registerAdapter, 'function');
    assert.equal(typeof getRegistry, 'function');
    assert.equal(typeof clearAdapterCache, 'function');
  });

  it('registry exports from default', () => {
    assert.equal(typeof keyvRegistry.registerAdapter, 'function');
    assert.equal(typeof keyvRegistry.getRegistry, 'function');
    assert.equal(typeof keyvRegistry.clearAdapterCache, 'function');
  });
});
