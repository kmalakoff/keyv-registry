import Module from 'node:module';
import type { LoadAdapterCallback } from './types.ts';

// Create require function for ESM compatibility
const _require = typeof require === 'undefined' ? Module.createRequire(import.meta.url) : require;

// Cache loaded adapters
const adapterCache = new Map<string, unknown>();

/**
 * Load an adapter from the modules installed alongside the consumer
 */
export default function loadAdapter(packageName: string, exportName: string | undefined, callback: LoadAdapterCallback): void {
  const cacheKey = `${packageName}:${exportName ?? 'default'}`;

  // Return cached adapter if available
  if (adapterCache.has(cacheKey)) {
    callback(null, adapterCache.get(cacheKey));
    return;
  }

  let Adapter: unknown;
  try {
    const mod = _require(packageName);
    Adapter = exportName ? mod[exportName] : (mod.default ?? mod);
  } catch {
    callback(new Error(`Adapter "${packageName}" is not installed. Install it alongside this package: npm install ${packageName}`));
    return;
  }

  adapterCache.set(cacheKey, Adapter);
  callback(null, Adapter);
}

/**
 * Clear the adapter cache (useful for testing)
 */
export function clearAdapterCache(): void {
  adapterCache.clear();
}
