# keyv-registry

Protocol-based Keyv adapter registry with dynamic module installation.

Create Keyv stores from URI strings with automatic adapter resolution and on-demand installation.

## Features

- **URI-based configuration**: Use familiar connection strings like `redis://localhost:6379`
- **Dynamic installation**: Adapters are installed on-demand, no hard dependencies
- **Extensible registry**: Register custom protocols or override defaults
- **Dual-boot API**: Supports both Promise and callback patterns
- **URI parameter mapping**: Query params automatically converted to adapter options
- **Store passthrough**: Use pre-instantiated adapters when needed

## Installation

```bash
npm install keyv-registry
```

## Usage

### Promise API

```typescript
import createStore from 'keyv-registry';

// Redis
const redis = await createStore('redis://localhost:6379');

// PostgreSQL
const postgres = await createStore('postgresql://user:pass@localhost/db');

// File-based storage
const file = await createStore('file://~/.cache/myapp/data.json');

// In-memory (built-in, no package needed)
const memory = await createStore('memory://');

// SQLite
const sqlite = await createStore('sqlite:///path/to/db.sqlite');

// With options
const store = await createStore('redis://localhost:6379', {
  namespace: 'myapp',
  ttl: 60000
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
    encryption: true
  })
});
```

### Pre-instantiated Adapter Passthrough

For advanced configuration, pass a pre-instantiated adapter:

```typescript
import createStore from 'keyv-registry';
import KeyvRedis from '@keyv/redis';

const customRedis = new KeyvRedis('redis://localhost:6379', {
  useUnlink: true,
  cluster: true
});

// URI is ignored when store option is provided
const store = await createStore('redis://ignored', { store: customRedis });
```

## Supported Protocols

### Official @keyv Adapters

| Protocol | Package | Notes |
|----------|---------|-------|
| `redis://`, `rediss://` | `@keyv/redis` | Redis, supports TLS |
| `postgresql://`, `postgres://` | `@keyv/postgres` | PostgreSQL |
| `mysql://` | `@keyv/mysql` | MySQL/MariaDB |
| `sqlite://` | `@keyv/sqlite` | SQLite |
| `mongodb://`, `mongodb+srv://` | `@keyv/mongo` | MongoDB |
| `memcache://` | `@keyv/memcache` | Memcached |
| `etcd://` | `@keyv/etcd` | etcd |

### Third-party Adapters

| Protocol | Package | Notes |
|----------|---------|-------|
| `file://` | `keyv-file` | File-based JSON storage |
| `duckdb://` | `keyv-duckdb` | DuckDB (planned) |

### Built-in

| Protocol | Notes |
|----------|-------|
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

Directories are created automatically if they don't exist.

## License

MIT
