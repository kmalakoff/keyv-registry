import type { KeyvOptions } from 'keyv';

/** The adapter behind `file:`; createStore checks that its file loaded. */
export const KEYV_FILE_PACKAGE = 'keyv-file';

/** Marks the registry entry for the store this package ships; `createStore` constructs `KeyvSharedFile` for it. */
export const SHARED_FILE_STORE = 'keyv-registry:shared-file';

/** Loaded on demand from the consumer's install when a `file+shared:` store opens; this package depends on none of them. */
export const SHARED_FILE_PACKAGES = ['proper-lockfile', '@keyv/serialize', 'temp-suffix'] as const;

/** A lock is taken over once its mtime is this old (proper-lockfile's default, named here because the write checks against it). */
export const LOCK_STALE_MS = 10000;

/** Windows answers these while another handle is open on a path being removed or replaced; they are retried on win32 only. */
export const TRANSIENT_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** Attempts before a transient code surfaces (backoff 0, 1, 2, 4 .. 100 ms: about 3 s). */
export const MAX_ATTEMPTS = 40;

/** Namespace keyv 5 used by default; keyv 6 has none. */
export const KEYV5_NAMESPACE = 'keyv';

/**
 * Option keys that belong to `new Keyv(...)`; every other option goes to the adapter constructor.
 * One entry per key of `KeyvOptions`: keyv@6.1.0 `dist/index.d.mts:586` namespace, `:593` serialization, `:598` store,
 * `:603` ttl, `:608` compression, `:613` stats, `:620` sanitize, `:628` encryption, `:638` checkExpired.
 * The `Record<keyof KeyvOptions, true>` type makes a key added by a later keyv a compile error here.
 */
const KEYV_OPTION_FLAGS: Record<keyof KeyvOptions, true> = {
  namespace: true,
  serialization: true,
  store: true,
  ttl: true,
  compression: true,
  stats: true,
  sanitize: true,
  encryption: true,
  checkExpired: true,
};

export const KEYV_OPTION_KEYS: ReadonlySet<string> = new Set(Object.keys(KEYV_OPTION_FLAGS));
