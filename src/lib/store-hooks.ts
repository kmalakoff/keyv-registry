/**
 * Internal seam for the store's tests: per-instance steps a spec or a child process can act on to create real
 * filesystem conditions. Not exported from the package entry and unset in production, where nothing changes.
 */
export interface StoreHooks {
  /** Runs after each read of the store file, under the lock during a write. */
  afterRead?: () => void;
  /** Names the temp file a write uses. */
  tempFile?: () => string;
}

export const storeHooks = new WeakMap<object, StoreHooks>();
