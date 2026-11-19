import Module from 'node:module';
import type { LoadAdapterCallback } from './types.ts';

// Create require function for ESM compatibility
const _require = typeof require === 'undefined' ? Module.createRequire(import.meta.url) : require;

// Cache loaded adapters
const adapterCache = new Map<string, unknown>();

// Module-not-found for the adapter itself; a missing dependency of the adapter names another module
export function isMissingModule(err: unknown, packageName: string): boolean {
  const e = err as { code?: string; message?: string };
  return (e?.code === 'MODULE_NOT_FOUND' || e?.code === 'ERR_MODULE_NOT_FOUND') && typeof e.message === 'string' && e.message.includes(`'${packageName}'`);
}

// Keep the original error as `cause` (the `ErrorOptions` argument is not in this project's lib target)
function loadError(err: unknown, packageName: string): Error {
  const message = isMissingModule(err, packageName) ? `Adapter "${packageName}" is not installed. Install it alongside this package: npm install ${packageName}` : `Adapter "${packageName}" failed to load: ${(err as Error)?.message}`;
  const error = new Error(message);
  (error as Error & { cause?: unknown }).cause = err;
  return error;
}

/**
 * Synchronously require a package from the modules installed alongside the consumer
 */
export function requirePackage(packageName: string): unknown {
  try {
    return _require(packageName);
  } catch (err) {
    throw loadError(err, packageName);
  }
}

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
    const mod = requirePackage(packageName) as Record<string, unknown> & { default?: unknown };
    Adapter = exportName ? mod[exportName] : (mod.default ?? mod);
  } catch (err) {
    callback(err as Error);
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
