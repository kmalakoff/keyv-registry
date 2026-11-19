# keyv-registry

Protocol-based Keyv adapter registry.

Create Keyv stores from URI strings, resolving each adapter from the modules installed alongside your application.

## Features

- **URI-based configuration**: Use familiar connection strings like `redis://localhost:6379`
- **No bundled adapters**: install only the adapter you use; keyv-registry itself depends on nothing but keyv
- **Extensible registry**: Register custom protocols or override defaults
- **Dual-boot API**: Supports both Promise and callback patterns
- **URI parameter mapping**: Query params automatically converted to adapter options
- **Store passthrough**: Use pre-instantiated adapters when needed

## Installation

```bash
npm install keyv-registry
```

Requires Node.js >=22.19.0 (keyv 6's floor). Adapters should be keyv 6 adapters (`@keyv/redis` 6, `@keyv/sqlite` 6, ...); keyv 6 also wraps keyv 5-era adapters.

Adapters are not bundled. Install the one your protocol needs alongside it:

```bash
npm install @keyv/redis   # redis://, rediss://
npm install keyv-file     # file://
npm install keyv-duckdb   # duckdb:// (0.2.0 or later)
npm install proper-lockfile @keyv/serialize temp-suffix   # file+shared://
```

`memory://` is built in and needs no package.

Adapters are resolved with `require()`, so an adapter only has to be installed somewhere Node resolves from your application: your project's `node_modules`, or globally beside a globally installed CLI. A protocol whose adapter is missing fails with the name of the package to install.

## Usage

### Promise API

```typescript
import createStore from 'keyv-registry';

// In-memory storage is built in and needs no adapter package.
const memory = await createStore('memory://');
await memory.set('greeting', 'hello');
console.log(await memory.get('greeting')); // hello

// Redis requires @keyv/redis and a running Redis server.
const redis = await createStore('redis://localhost:6379');

// PostgreSQL
const postgres = await createStore('postgresql://user:pass@localhost/db');

// File-based storage
const file = await createStore('file://~/.cache/myapp/data.json');

// SQLite
const sqlite = await createStore('sqlite:///path/to/db.sqlite');

// With options
const store = await createStore('redis://localhost:6379', {
  namespace: 'myapp',
  ttl: 60000,
});
```

### Callback API

```typescript
import createStore from 'keyv-registry';

createStore('redis://localhost:6379', (err, store) => {
  if (err) throw err;
  // use store
});

// With options
createStore('redis://localhost:6379', { namespace: 'myapp' }, (err, store) => {
  if (err) throw err;
  // use store
});
```

### URI Query Parameters

Query parameters are automatically converted to adapter options:

```typescript
// Equivalent to { keyPrefix: 'myapp', ttl: 3600 }
const store = await createStore('redis://localhost:6379?keyPrefix=myapp&ttl=3600');

// Boolean and number conversion is automatic
const file = await createStore('file://~/data.json?writeDelay=100&pretty=true');
```

### Connection String Handling

Connection strings are passed to adapters via protocol-specific mappings. Different adapters expect connection information in different formats:

**Direct URL passing** (adapter instantiated with URI string):

- `redis://`, `rediss://` - Redis
- `memcache://` - Memcached

**URI option mapping** (wrapped in `{ uri }` object):

- `postgresql://`, `postgres://` - PostgreSQL
- `mysql://` - MySQL/MariaDB
- `sqlite://` - SQLite

**URL option mapping** (wrapped in `{ url }` object):

- `mongodb://`, `mongodb+srv://` - MongoDB
- `etcd://` - etcd

**Where options go.** For `file://`, `sqlite://` and `duckdb://` the URI path is the file location. Query parameters are adapter options. Options passed in code win over query parameters and over the URI path. Keyv's own options passed in code (`namespace`, `ttl`, `serialization`, `compression`, `stats`, `sanitize`, `encryption`, `checkExpired`) go to `new Keyv(...)`; every other option goes to the adapter constructor.

### Custom Adapters

Register custom protocols or override defaults:

```typescript
import createStore, { registerAdapter } from 'keyv-registry';

// Register a new protocol
registerAdapter('cloudflare:', { package: 'keyv-cloudflare' });
const cf = await createStore('cloudflare://my-namespace');

// Override default with custom package
registerAdapter('file:', {
  package: '@my-org/keyv-file-encrypted',
  optionsMapper: (url) => ({
    filename: url.pathname,
    encryption: true,
  }),
});
```

### Pre-instantiated Adapter Passthrough

For advanced configuration, pass a pre-instantiated adapter:

```typescript
import createStore from 'keyv-registry';
import KeyvRedis from '@keyv/redis';

const customRedis = new KeyvRedis('redis://localhost:6379', {
  useUnlink: true,
  cluster: true,
});

// URI is ignored when store option is provided
const store = await createStore('redis://ignored', { store: customRedis });
```

## Supported Protocols

### Official @keyv Adapters

| Protocol                       | Package          | Connection String Handling | Notes               |
| ------------------------------ | ---------------- | -------------------------- | ------------------- |
| `redis://`, `rediss://`        | `@keyv/redis`    | Direct URL                 | Redis, supports TLS |
| `postgresql://`, `postgres://` | `@keyv/postgres` | URI option                 | PostgreSQL          |
| `mysql://`                     | `@keyv/mysql`    | URI option                 | MySQL/MariaDB       |
| `sqlite://`                    | `@keyv/sqlite`   | URI option                 | SQLite              |
| `mongodb://`, `mongodb+srv://` | `@keyv/mongo`    | URL option                 | MongoDB             |
| `memcache://`                  | `@keyv/memcache` | Direct URI                 | Memcached           |
| `etcd://`                      | `@keyv/etcd`     | URL option                 | etcd                |

### Third-party Adapters

| Protocol    | Package       | Notes                   |
| ----------- | ------------- | ----------------------- |
| `file://`   | `keyv-file`   | File-based JSON storage |
| `duckdb://` | `keyv-duckdb` | DuckDB, 0.2.0 or later  |

### Shared file (`file+shared://`)

keyv-file keeps its data in memory and rewrites the whole file on every write, so two processes using one file overwrite each other's changes. `file+shared://` keeps keyv-file's file format in one JSON file that several processes can share, on Windows, macOS and Linux:

```typescript
const tokens = await createStore('file+shared://~/.myapp/tokens.json');
```

Each write takes a lock, re-reads the file, changes only its own key and replaces the file atomically (mode 0600 on POSIX). Reads always see the current file, so a change made by another process is visible without reopening. A file written by keyv-file opens as is, and keyv-file reads the shared file back. The path shortcuts and drive paths of `file://` work the same way.

It needs `proper-lockfile`, `@keyv/serialize` and `temp-suffix` installed alongside keyv-registry, which loads them only when a `file+shared://` store opens (keyv-registry itself adds no dependency). If one is missing, `createStore` rejects naming it and the install command. Reading from disk on every call is slower than keyv-file's memory, so use it when more than one process shares the file.

A failure rejects the call that caused it; no `error` event is emitted. A write that waited past the lock's stale time (10 s, for example because its process was paused) rejects with code `ECOMPROMISED` rather than overwrite the writer that took over. A lock left by a killed process is taken over once it is 10 s old. The path is its only option: query parameters are ignored. Code that has a path and no URI can use `new KeyvSharedFile({ filename })`.

### Built-in

| Protocol    | Notes                            |
| ----------- | -------------------------------- |
| `memory://` | In-memory Map, no package needed |

## API

### `createStore(uri, [options], [callback])`

Create a Keyv store from a URI string.

**Parameters:**

- `uri` (string): Connection URI with protocol
- `options` (object, optional): Keyv options
  - `store`: Pre-instantiated adapter (bypasses URI loading)
  - `namespace`: Keyv namespace
  - `ttl`: Default TTL in milliseconds
  - Additional options passed to Keyv
- `callback` (function, optional): Node-style callback `(err, store) => void`

**Returns:** `Promise<Keyv>` if no callback, `undefined` if callback provided

### `registerAdapter(protocol, config)`

Register or override a protocol adapter.

**Parameters:**

- `protocol` (string): Protocol with or without trailing colon (e.g., `'redis:'` or `'redis'`)
- `config` (object): Adapter configuration
  - `package`: npm package name, or `null` for built-in
  - `exportName`: Named export (default: `'default'`)
  - `optionsMapper`: Function `(url: URL) => object` to map URL to options

### `getRegistry()`

Get a read-only copy of the current protocol registry.

**Returns:** `Record<string, AdapterConfig>`

### `clearAdapterCache()`

Clear the loaded adapter cache. Useful for testing.

## File Path Shortcuts

The `file://` protocol supports path shortcuts:

```typescript
// Home directory
await createStore('file://~/.cache/myapp/data.json');

// Current working directory
await createStore('file://./data/cache.json');

// Absolute path
await createStore('file:///var/cache/myapp/data.json');
```

Directories are created automatically if they don't exist, for `file://`, `sqlite://` and `duckdb://`. If a directory cannot be created, `createStore` rejects. Windows drive paths work as `file:///C:/data/x.json` or `file://C:/data/x.json`.

## Errors

keyv-registry attaches no `error` listener. With keyv 6, a failing call then rejects. Attach `store.on('error', ...)` yourself to get fallback values (`undefined`, `false`) instead.

`createStore('file://…')` and `createStore('file+shared://…')` reject when the file exists but cannot be read or parsed, and leave the file unchanged (`separatedFile` stores are not checked).

## Upgrading from 2.x

- Node.js >=22.19.0 and keyv 6.
- keyv 6 has no default namespace, and its key separator is `::`. Data written through keyv-registry 2.x (keyv 5, default namespace `keyv`) reads as missing. Move it once with `migrateKeyv5Keys`:

```typescript
import createStore, { migrateKeyv5Keys } from 'keyv-registry';

const store = await createStore('file://~/.cache/app/data.json');
const moved = await migrateKeyv5Keys(store); // number of entries moved
```

It moves entries of the default `keyv` namespace only, keeps expiry times, skips expired entries, keeps the plain key if both exist, and is safe to run again. Plan to remove the call once your data is moved; it goes away in the next major.

- Run it at startup, before the store serves other traffic: it renames keys and switches `store.namespace` while it runs.
- A plain key that itself starts with `keyv:` is taken for a keyv 5 key.
- A store that cannot iterate (for example memcache) has nothing to find: it returns 0 and your old entries stay unread.
- If a store error occurs during the move, the old key is kept and the call rejects with the error as `cause`. Entries already moved stay moved; run it again after fixing the cause.

- Keyv option keys given in code or the URI are no longer passed to the adapter constructor.
- `duckdb://` now opens the file in the URI. 2.x ignored the path and used `~/.keyv-duckdb/store.duckdb`.

## License

MIT
