import assert from 'assert';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { safeRmSync } from 'fs-remove-compat';
import createStore from 'keyv-registry';
import * as path from 'path';

// For every file-backed protocol the URI path is where the file lands: relative (`.`), absolute and `~`.
const root = path.resolve('.tmp', `location-${process.pid}`);
const home = path.join(root, 'home');
const roundtrip = path.resolve('test', 'lib', 'store-roundtrip.mjs');

describe('file location', () => {
  before(() => safeRmSync(root));
  after(() => safeRmSync(root));

  const cases: [protocol: string, ext: string][] = [
    ['file', 'json'],
    ['sqlite', 'sqlite'],
    ['duckdb', 'duckdb'],
  ];

  for (const [protocol, ext] of cases) {
    describe(`${protocol}:`, () => {
      const rel = path.relative(process.cwd(), root).split(path.sep).join('/');
      const expectations: [label: string, uri: string, file: string][] = [
        ['relative', `${protocol}://./${rel}/${protocol}-rel/a/store.${ext}`, path.join(root, `${protocol}-rel`, 'a', `store.${ext}`)],
        ['absolute', `${protocol}://${root.startsWith('/') ? '' : '/'}${root.split(path.sep).join('/')}/${protocol}-abs/b/store.${ext}`, path.join(root, `${protocol}-abs`, 'b', `store.${ext}`)],
      ];

      for (const [label, uri, file] of expectations) {
        it(`${label}: creates the file at the URI path and round-trips`, async () => {
          const store = await createStore<string>(uri);
          await store.set('key', 'value');
          assert.equal(await store.get('key'), 'value');
          await store.disconnect();
          assert.ok(existsSync(file), `expected ${file}`);
        });
      }

      // The home is set in a child process: DuckDB keeps the home it first sees, so changing it here would break later tests.
      it('home (~): creates the file under the home, not the default, and round-trips', () => {
        const file = path.join(home, `${protocol}-home`, 'c', `store.${ext}`);
        const env = { ...process.env, HOME: home, USERPROFILE: home }; // os.homedir() reads HOME on POSIX and USERPROFILE on Windows
        const result = spawnSync(process.execPath, [roundtrip, `${protocol}://~/${protocol}-home/c/store.${ext}`], { env, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        assert.ok(existsSync(file), `expected ${file}`);
        assert.ok(!existsSync(path.join(home, '.keyv-duckdb')), 'no ~/.keyv-duckdb under the test home');
      });
    });
  }
});
