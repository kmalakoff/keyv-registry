import Keyv from 'keyv';
import loadAdapter from './loadAdapter.ts';
import { getAdapterConfig } from './registry.ts';
import type { CreateStoreCallback, CreateStoreOptions } from './types.ts';
import { parseUriOptions } from './utils.ts';

/**
 * Core worker function that creates a Keyv store
 */
export default function worker<T>(uri: string, options: CreateStoreOptions, callback: CreateStoreCallback<T>): void {
  // Passthrough: pre-instantiated adapter provided
  if (options.store) {
    try {
      const keyv = new Keyv<T>({ ...options });
      callback(null, keyv);
    } catch (err) {
      callback(err as Error);
    }
    return;
  }

  // Parse URI
  let url: URL;
  try {
    url = new URL(uri);
  } catch (_err) {
    callback(new Error(`Invalid URI: ${uri}`));
    return;
  }

  const config = getAdapterConfig(url.protocol);

  if (!config) {
    callback(new Error(`Unknown protocol: ${url.protocol}. Use registerAdapter() to add support.`));
    return;
  }

  // Memory store - no package needed
  if (config.package === null) {
    try {
      const keyv = new Keyv<T>({ ...parseUriOptions(url), ...options });
      callback(null, keyv);
    } catch (err) {
      callback(err as Error);
    }
    return;
  }

  // Load adapter (install if needed)
  loadAdapter(config.package, config.exportName, (err, AdapterClass) => {
    if (err) return callback(err);

    try {
      // Build adapter options: URI params + custom mapper + user options
      const adapterOptions = {
        ...parseUriOptions(url),
        ...(config.optionsMapper?.(url) ?? {}),
        ...options,
      };

      // Remove store from adapter options to avoid confusion
      const { store: _, ...cleanAdapterOptions } = adapterOptions;

      if (config.mode === 'string') {
        const storeInstance = new (AdapterClass as new (uri: string, options: Record<string, unknown>) => unknown)(uri, cleanAdapterOptions);
        const keyv = new Keyv<T>({ store: storeInstance, ...options });
        callback(null, keyv);
        return;
      }

      const storeInstance = new (AdapterClass as new (options: Record<string, unknown>) => unknown)(cleanAdapterOptions);
      const keyv = new Keyv<T>({ store: storeInstance, ...options });

      callback(null, keyv);
    } catch (createErr) {
      callback(createErr as Error);
    }
  });
}
