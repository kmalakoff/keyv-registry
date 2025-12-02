import assert from 'assert';
import { getRegistry, registerAdapter } from '../../src/registry.ts';

describe('registry', () => {
  it('getRegistry returns pre-configured protocols', () => {
    const registry = getRegistry();

    // Official adapters
    assert.ok(registry['redis:']);
    assert.equal(registry['redis:'].package, '@keyv/redis');

    assert.ok(registry['postgresql:']);
    assert.equal(registry['postgresql:'].package, '@keyv/postgres');

    assert.ok(registry['mysql:']);
    assert.equal(registry['mysql:'].package, '@keyv/mysql');

    assert.ok(registry['sqlite:']);
    assert.equal(registry['sqlite:'].package, '@keyv/sqlite');

    assert.ok(registry['mongodb:']);
    assert.equal(registry['mongodb:'].package, '@keyv/mongo');

    // Memory (built-in)
    assert.ok(registry['memory:']);
    assert.equal(registry['memory:'].package, null);

    // File
    assert.ok(registry['file:']);
    assert.equal(registry['file:'].package, 'keyv-file');
    assert.equal(registry['file:'].exportName, 'KeyvFile');
  });

  it('registerAdapter adds new protocol', () => {
    registerAdapter('custom:', { package: 'keyv-custom' });

    const registry = getRegistry();
    assert.ok(registry['custom:']);
    assert.equal(registry['custom:'].package, 'keyv-custom');
  });

  it('registerAdapter normalizes protocol without colon', () => {
    registerAdapter('myprotocol', { package: 'keyv-myprotocol' });

    const registry = getRegistry();
    assert.ok(registry['myprotocol:']);
    assert.equal(registry['myprotocol:'].package, 'keyv-myprotocol');
  });

  it('registerAdapter can override existing protocol', () => {
    const originalRegistry = getRegistry();
    const originalPackage = originalRegistry['redis:'].package;

    registerAdapter('redis:', { package: 'custom-redis-adapter' });

    const newRegistry = getRegistry();
    assert.equal(newRegistry['redis:'].package, 'custom-redis-adapter');

    // Restore original
    registerAdapter('redis:', { package: originalPackage });
  });

  it('getRegistry returns a copy (not the original)', () => {
    const registry1 = getRegistry();
    const registry2 = getRegistry();

    assert.notStrictEqual(registry1, registry2);
    assert.deepEqual(registry1, registry2);
  });
});
