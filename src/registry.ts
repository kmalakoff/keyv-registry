import type { AdapterConfig } from './types.ts';
import { resolveFilePath } from './utils.ts';

/**
 * Protocol registry mapping URI protocols to adapter configurations
 */
const PROTOCOL_REGISTRY: Record<string, AdapterConfig> = {
  // Official @keyv adapters
  'redis:': { package: '@keyv/redis', mode: 'string' },
  'rediss:': { package: '@keyv/redis', mode: 'string' },
  'postgresql:': { package: '@keyv/postgres', mode: 'options', optionsMapper: (url) => ({ uri: url.toString() }) },
  'postgres:': { package: '@keyv/postgres', mode: 'options', optionsMapper: (url) => ({ uri: url.toString() }) },
  'mysql:': { package: '@keyv/mysql', mode: 'options', optionsMapper: (url) => ({ uri: url.toString() }) },
  'sqlite:': { package: '@keyv/sqlite', mode: 'options', optionsMapper: (url) => ({ uri: url.toString() }) },
  'mongodb:': { package: '@keyv/mongo', mode: 'options', optionsMapper: (url) => ({ url: url.toString() }) },
  'mongodb+srv:': { package: '@keyv/mongo', mode: 'options', optionsMapper: (url) => ({ url: url.toString() }) },
  'memcache:': { package: '@keyv/memcache', mode: 'string' },
  'etcd:': { package: '@keyv/etcd', mode: 'options', optionsMapper: (url) => ({ url: url.toString() }) },

  // Third-party adapters
  'file:': {
    package: 'keyv-file',
    exportName: 'KeyvFile',
    optionsMapper: (url: URL) => ({ filename: resolveFilePath(url) }),
  },

  // Built-in (no package needed)
  'memory:': { package: null },

  // Future/custom adapters
  'duckdb:': {
    package: 'keyv-duckdb',
    optionsMapper: (url: URL) => ({ filename: resolveFilePath(url) }),
  },
};

/**
 * Register or override a protocol adapter
 */
export function registerAdapter(protocol: string, config: AdapterConfig): void {
  const normalizedProtocol = protocol.endsWith(':') ? protocol : `${protocol}:`;
  PROTOCOL_REGISTRY[normalizedProtocol] = config;
}

/**
 * Get the current registry (read-only copy)
 */
export function getRegistry(): Readonly<Record<string, AdapterConfig>> {
  return { ...PROTOCOL_REGISTRY };
}

/**
 * Get adapter config for a protocol
 */
export function getAdapterConfig(protocol: string): AdapterConfig | undefined {
  return PROTOCOL_REGISTRY[protocol];
}
