import Module from 'node:module';
import path from 'node:path';
import url from 'node:url';
import installModule from 'install-module-linked';
import type { LoadAdapterCallback } from './types.ts';

// Create require function for ESM compatibility
const _require = typeof require === 'undefined' ? Module.createRequire(import.meta.url) : require;

// Determine node_modules path
const _dirname = path.dirname(typeof __filename === 'undefined' ? url.fileURLToPath(import.meta.url) : __filename);
const nodeModulesPath = path.join(_dirname, '..', '..', 'node_modules');

// Cache loaded adapters
const adapterCache = new Map<string, unknown>();

/**
 * Load an adapter, installing it dynamically if needed
 */
export default function loadAdapter(packageName: string, exportName: string | undefined, callback: LoadAdapterCallback): void {
  const cacheKey = `${packageName}:${exportName ?? 'default'}`;

  // Return cached adapter if available
  if (adapterCache.has(cacheKey)) {
    callback(null, adapterCache.get(cacheKey));
    return;
  }

  // Try to require first (may already be installed)
  try {
    const mod = _require(packageName);
    const Adapter = exportName ? mod[exportName] : (mod.default ?? mod);
    adapterCache.set(cacheKey, Adapter);
    callback(null, Adapter);
    return;
  } catch {
    // Not installed - dynamically install then load
    installModule(packageName, nodeModulesPath, {}, (err: Error | null) => {
      if (err) return callback(err);
      try {
        const mod = _require(packageName);
        const Adapter = exportName ? mod[exportName] : (mod.default ?? mod);
        adapterCache.set(cacheKey, Adapter);
        callback(null, Adapter);
      } catch (loadErr) {
        callback(loadErr as Error);
      }
    });
  }
}

/**
 * Clear the adapter cache (useful for testing)
 */
export function clearAdapterCache(): void {
  adapterCache.clear();
}
