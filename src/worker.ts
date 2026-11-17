import Keyv from 'keyv';
import { KEYV_OPTION_KEYS } from './constants.ts';
import loadAdapter from './loadAdapter.ts';
import { getAdapterConfig } from './registry.ts';
import type { CreateStoreCallback, CreateStoreOptions } from './types.ts';
import { parseUri, parseUriOptions } from './utils.ts';

/**
 * Split code options: Keyv's own keys go to `new Keyv`, the rest to the adapter constructor
 */
export function splitOptions(merged: Record<string, unknown>): { keyvOptions: Record<string, unknown>; adapterOptions: Record<string, unknown> } {
  const keyvOptions: Record<string, unknown> = {};
  const adapterOptions: Record<string, unknown> = {};
  for (const key of Object.keys(merged)) {
    if (key === 'store') continue;
    (KEYV_OPTION_KEYS.has(key) ? keyvOptions : adapterOptions)[key] = merged[key];
  }
  return { keyvOptions, adapterOptions };
}

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
    url = parseUri(uri);
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
      // Code options split between Keyv and the adapter; query parameters and the URI path mapper go to the adapter only. Code wins.
      const { keyvOptions, adapterOptions: codeAdapterOptions } = splitOptions(options);
      const adapterOptions = {
        ...parseUriOptions(url),
        ...(config.optionsMapper?.(url) ?? {}),
        ...codeAdapterOptions,
      };

      const storeInstance = config.mode === 'string' ? new (AdapterClass as new (uri: string, options: Record<string, unknown>) => unknown)(uri, adapterOptions) : new (AdapterClass as new (options: Record<string, unknown>) => unknown)(adapterOptions);
      callback(null, new Keyv<T>({ ...keyvOptions, store: storeInstance }));
    } catch (createErr) {
      callback(createErr as Error);
    }
  });
}
