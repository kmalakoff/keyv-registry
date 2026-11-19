import type { Keyv, KeyvOptions } from 'keyv';

/**
 * Configuration for a protocol adapter
 */
export interface AdapterConfig {
  /** npm package name, or null for built-in adapters (the `file+shared:` entry names the store this package ships) */
  package: string | null;
  /** Named export from the package (default: 'default') */
  exportName?: string;
  /** How to instantiate the adapter */
  mode?: 'string' | 'options';
  /** Custom function to map URL to adapter options */
  optionsMapper?: (url: URL) => Record<string, unknown>;
}

/**
 * Options for createStore
 */
export interface CreateStoreOptions extends Partial<KeyvOptions> {
  /** Pre-instantiated adapter (bypasses URI loading) */
  store?: KeyvOptions['store'];
  /** Options passed through to the adapter constructor */
  [key: string]: unknown;
}

/**
 * Callback type for createStore
 */
export type CreateStoreCallback<T> = (err: Error | null, store?: Keyv<T>) => void;

/**
 * Internal callback type for loadAdapter
 */
export type LoadAdapterCallback = (err: Error | null, Adapter?: unknown) => void;
