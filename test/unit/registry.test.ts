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
    const originalConfig = { ...originalRegistry['redis:'] };

    registerAdapter('redis:', { package: 'custom-redis-adapter' });

    const newRegistry = getRegistry();
    assert.equal(newRegistry['redis:'].package, 'custom-redis-adapter');

    // Restore original
    registerAdapter('redis:', originalConfig);
  });

  it('getRegistry returns a copy (not the original)', () => {
    const registry1 = getRegistry();
    const registry2 = getRegistry();

    assert.notStrictEqual(registry1, registry2);
    assert.deepEqual(registry1, registry2);
  });

  describe('optionsMapper behavior', () => {
    it('should have correct optionsMapper for postgresql protocol', () => {
      const registry = getRegistry();
      const config = registry['postgresql:'];

      assert.ok(config.optionsMapper);
      const result = config.optionsMapper?.(new URL('postgresql://user:pass@localhost:5432/db'));
      assert.deepEqual(result, { uri: 'postgresql://user:pass@localhost:5432/db' });
    });

    it('should have correct optionsMapper for postgres protocol', () => {
      const registry = getRegistry();
      const config = registry['postgres:'];

      assert.ok(config.optionsMapper);
      const result = config.optionsMapper?.(new URL('postgres://user:pass@localhost:5432/db'));
      assert.deepEqual(result, { uri: 'postgres://user:pass@localhost:5432/db' });
    });

    it('should have correct optionsMapper for mysql protocol', () => {
      const registry = getRegistry();
      const config = registry['mysql:'];

      assert.ok(config.optionsMapper);
      const result = config.optionsMapper?.(new URL('mysql://user:pass@localhost:3306/db'));
      assert.deepEqual(result, { uri: 'mysql://user:pass@localhost:3306/db' });
    });

    it('should have correct optionsMapper for sqlite protocol', () => {
      const registry = getRegistry();
      const config = registry['sqlite:'];

      assert.ok(config.optionsMapper);
      const result = config.optionsMapper?.(new URL('sqlite:///path/to/db.sqlite'));
      assert.deepEqual(result, { uri: 'sqlite:///path/to/db.sqlite' });
    });

    it('should have correct optionsMapper for mongodb protocol', () => {
      const registry = getRegistry();
      const config = registry['mongodb:'];

      assert.ok(config.optionsMapper);
      const result = config.optionsMapper?.(new URL('mongodb://user:pass@localhost:27017/db'));
      assert.deepEqual(result, { url: 'mongodb://user:pass@localhost:27017/db' });
    });

    it('should have correct optionsMapper for mongodb+srv protocol', () => {
      const registry = getRegistry();
      const config = registry['mongodb+srv:'];

      assert.ok(config.optionsMapper);
      const result = config.optionsMapper?.(new URL('mongodb+srv://user:pass@cluster.mongodb.net/db'));
      assert.deepEqual(result, { url: 'mongodb+srv://user:pass@cluster.mongodb.net/db' });
    });

    it('should have correct optionsMapper for etcd protocol', () => {
      const registry = getRegistry();
      const config = registry['etcd:'];

      assert.ok(config.optionsMapper);
      const result = config.optionsMapper?.(new URL('etcd://localhost:2379'));
      assert.deepEqual(result, { url: 'etcd://localhost:2379' });
    });

    it('should use string mode for redis protocol', () => {
      const registry = getRegistry();
      const config = registry['redis:'];

      assert.equal(config.optionsMapper, undefined);
      assert.equal(config.mode, 'string');
    });

    it('should use string mode for rediss protocol', () => {
      const registry = getRegistry();
      const config = registry['rediss:'];

      assert.equal(config.optionsMapper, undefined);
      assert.equal(config.mode, 'string');
    });

    it('should use string mode for memcache protocol', () => {
      const registry = getRegistry();
      const config = registry['memcache:'];

      assert.equal(config.optionsMapper, undefined);
      assert.equal(config.mode, 'string');
    });

    it('should have correct optionsMapper for file protocol', () => {
      const registry = getRegistry();
      const config = registry['file:'];

      assert.ok(config.optionsMapper);
      const result = config.optionsMapper?.(new URL('file://./data.json')) as { filename: string };
      // The resolveFilePath function converts relative paths to absolute paths
      assert.ok(result.filename.endsWith('data.json'));
      assert.ok(result.filename.includes('keyv-registry'));
    });

    it('should preserve query parameters in URL when mapping', () => {
      const registry = getRegistry();
      const config = registry['postgresql:'];

      assert.ok(config.optionsMapper);
      const url = new URL('postgresql://user:pass@localhost:5432/db?ssl=true&timeout=5000');
      const result = config.optionsMapper?.(url);
      assert.deepEqual(result, { uri: 'postgresql://user:pass@localhost:5432/db?ssl=true&timeout=5000' });
    });
  });
});
