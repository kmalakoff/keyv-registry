# Changelog

## [3.0.1] - 2026-11-19

### Fixed

- `file://` stores no longer open a file that exists but cannot be read or parsed as an empty store, which made the next write replace the file and drop every other entry. `createStore` now rejects with an error that names the file and the cause, and leaves the file unchanged. This covers a truncated, zero-length, non-JSON or unreadable file, a file that is not a keyv-file store, and a directory at the path. `separatedFile` stores and a `store` you pass in are not checked.

## [3.0.0] - 2026-11-16

### Changed

- **Breaking:** requires Node.js >=22.19.0 and uses keyv 6. keyv 6 has no default namespace, so data written by 2.x (keyv 5, namespace `keyv`) reads as missing until you run `migrateKeyv5Keys(store)` once (see "Upgrading from 2.x" in the README).
- **Breaking:** Keyv's own options (`namespace`, `ttl`, `serialization`, `compression`, `stats`, `sanitize`, `encryption`, `checkExpired`) passed in code now go only to `new Keyv`; other code options go only to the adapter. The URI path is the file location for `file:`, `sqlite:` and `duckdb:`; query parameters are always adapter options, never Keyv options; options passed in code win.
- A failure to load an adapter keeps the original error as `cause`. "not installed" is reported only when the adapter itself is missing.

### Added

- `migrateKeyv5Keys(store)` and `KEYV5_NAMESPACE`: one-time move of keyv 5 default-namespace entries to keyv 6 keys. Run it at startup. It keeps the old key and rejects if the store reports an error. A store that cannot iterate (memcache) returns 0 and keeps its old entries unread. A plain key that starts with `keyv:` is treated as a keyv 5 key.

### Fixed

- `duckdb://` opens the file in the URI. 2.x ignored the path and wrote to `~/.keyv-duckdb/store.duckdb`; to keep that data, move that file to your URI's path.
- Paths with a Windows drive letter (`sqlite://C:/...`, `file://C:/...`) open the right file.
- `sqlite://` creates a missing folder, like `file://` and `duckdb://`, and resolves `~` and `.`. If it cannot, `createStore` rejects.

### Notes

- A `sqlite://` store opened by several processes at once on the first start after upgrading may fail once with "database is locked"; restart works.

## [2.0.2] - 2026-09-20

### Fixed

- File-backed adapters now receive decoded, platform-native filesystem paths from file URLs, including paths with URL-escaped characters.
