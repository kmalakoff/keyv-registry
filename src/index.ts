import type Keyv from 'keyv';
import type { CreateStoreCallback, CreateStoreOptions } from './types.ts';
import worker from './worker.ts';

export { clearAdapterCache } from './loadAdapter.ts';
export { getRegistry, registerAdapter } from './registry.ts';
export type { AdapterConfig, CreateStoreCallback, CreateStoreOptions } from './types.ts';

/**
 * Create a Keyv store from a URI string
 *
 * Supports dual-boot API (callback or Promise):
 *
 * @example
 * // Promise API
 * const store = await createStore('redis://localhost:6379');
 * const file = await createStore('file://~/.cache/app/data.json');
 * const memory = await createStore('memory://');
 *
 * @example
 * // Callback API
 * createStore('redis://localhost:6379', (err, store) => {
 *   if (err) throw err;
 *   // use store
 * });
 *
 * @example
 * // With options
 * const store = await createStore('redis://localhost:6379', {
 *   namespace: 'myapp',
 *   ttl: 60000
 * });
 *
 * @example
 * // Pre-instantiated adapter passthrough
 * import KeyvRedis from '@keyv/redis';
 * const redis = new KeyvRedis('redis://localhost:6379');
 * const store = await createStore('redis://ignored', { store: redis });
 */
export default function createStore<T>(uri: string, options?: CreateStoreOptions | CreateStoreCallback<T>, callback?: CreateStoreCallback<T>): undefined | Promise<Keyv<T>> {
  // Normalize arguments
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};

  // Callback mode
  if (typeof callback === 'function') {
    worker(uri, options, callback);
    return undefined;
  }

  // Promise mode
  return new Promise((resolve, reject) => {
    worker(uri, options as CreateStoreOptions, (err, store) => (err ? reject(err) : resolve(store as Keyv<T>)));
  });
}
