import type { KeyvOptions } from 'keyv';

/** The adapter behind `file:`; createStore checks that its file loaded. */
export const KEYV_FILE_PACKAGE = 'keyv-file';

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
