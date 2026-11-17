import type { Keyv, KeyvValue } from 'keyv';
import { KEYV5_NAMESPACE } from './constants.ts';

const PREFIX = `${KEYV5_NAMESPACE}:`;

interface LegacyKey {
  /** Namespace the old key is read and deleted under */
  namespace: string | undefined;
  oldKey: string;
  newKey: string;
}

function fail(message: string, cause: unknown): Error {
  const error = new Error(message);
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

/**
 * One-time move of entries keyv 5 wrote under its default `keyv` namespace to the plain keys keyv 6 reads.
 *
 * Works through the Keyv API only, on the instance the caller passes, so it covers every adapter that can iterate.
 * Finds both old layouts: `keyv:<key>` with no namespace (keyv-file) and namespace `keyv` (sqlite `<key>`, redis `keyv:<key>`).
 * Keeps the absolute expiry, skips expired entries, lets an existing plain key win, and is safe to run again.
 *
 * Call it at startup, before the store serves other traffic: it renames keys and switches `store.namespace` while it runs.
 * A plain key that itself starts with `keyv:` is taken for a keyv 5 key.
 * A store that cannot iterate (for example memcache) has nothing to find: it returns 0.
 *
 * Store errors: keyv hides them from the caller once any `error` listener is attached, so a temporary listener watches every read and write.
 * If one is emitted, the old key is not deleted and the call rejects with the error as `cause`; entries already moved stay moved and a rerun repairs the rest.
 *
 * @returns the number of entries moved
 */
export default async function migrateKeyv5Keys(store: Keyv): Promise<number> {
  const original = store.namespace;
  const errors: unknown[] = [];
  const onError = (err: unknown) => errors.push(err);
  const check = (what: string) => {
    if (errors.length > 0) throw fail(`migrateKeyv5Keys: ${what}: ${(errors[0] as Error)?.message ?? errors[0]}`, errors[0]);
  };
  store.on('error', onError);
  try {
    const legacy: LegacyKey[] = [];

    // Collect first, then change anything, so the iterators never see our own writes.
    store.namespace = undefined;
    for await (const [key] of store.iterator()) if (typeof key === 'string' && key.startsWith(PREFIX)) legacy.push({ namespace: undefined, oldKey: key, newKey: key.slice(PREFIX.length) });
    check('listing keys failed');
    store.namespace = KEYV5_NAMESPACE;
    for await (const [key] of store.iterator()) if (typeof key === 'string') legacy.push({ namespace: KEYV5_NAMESPACE, oldKey: key, newKey: key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key });
    check('listing keys failed');

    let moved = 0;
    for (const { namespace, oldKey, newKey } of legacy) {
      store.namespace = namespace;
      const raw = await store.getRaw(oldKey); // undefined when expired, and when the store failed (then an error was emitted)
      check(`reading "${oldKey}" failed, kept it`);
      store.namespace = undefined;
      if (raw !== undefined) {
        const exists = await store.has(newKey);
        check(`checking "${newKey}" failed, kept "${oldKey}"`);
        if (!exists) {
          if (!(await store.setRaw(newKey, raw as KeyvValue<unknown>))) throw fail(`migrateKeyv5Keys: could not write migrated key "${newKey}", kept "${oldKey}"`, errors[0]);
          check(`writing "${newKey}" failed, kept "${oldKey}"`);
          moved++;
        }
      }
      store.namespace = namespace;
      await store.delete(oldKey); // after the write: a crash in between leaves both, and a rerun keeps the plain key
      check(`deleting "${oldKey}" failed`);
    }
    return moved;
  } finally {
    store.off('error', onError);
    store.namespace = original;
  }
}
