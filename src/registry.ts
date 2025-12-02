import type { AdapterConfig } from './types.ts';
import { resolveFilePath } from './utils.ts';

/**
 * Protocol registry mapping URI protocols to adapter configurations
 */
const PROTOCOL_REGISTRY: Record<string, AdapterConfig> = {
  // Official @keyv adapters
  'redis:': { package: '@keyv/redis' },
  'rediss:': { package: '@keyv/redis' },
  'postgresql:': { package: '@keyv/postgres' },
  'postgres:': { package: '@keyv/postgres' },
  'mysql:': { package: '@keyv/mysql' },
  'sqlite:': { package: '@keyv/sqlite' },
  'mongodb:': { package: '@keyv/mongo' },
  'mongodb+srv:': { package: '@keyv/mongo' },
  'memcache:': { package: '@keyv/memcache' },
  'etcd:': { package: '@keyv/etcd' },

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
