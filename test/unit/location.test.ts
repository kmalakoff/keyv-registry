import assert from 'assert';
import { existsSync } from 'fs';
import { safeRmSync } from 'fs-remove-compat';
import createStore from 'keyv-registry';
import * as path from 'path';

// For every file-backed protocol the URI path is where the file lands: relative (`.`), absolute and `~`.
const root = path.resolve('.tmp', `location-${process.pid}`);
const home = path.join(root, 'home');

describe('file location', () => {
  let saved: Record<string, string | undefined>;
  before(() => {
    safeRmSync(root);
    saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    process.env.HOME = home; // os.homedir() reads HOME on POSIX and USERPROFILE on Windows
    process.env.USERPROFILE = home;
  });
  after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    safeRmSync(root);
  });

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
        ['home (~)', `${protocol}://~/${protocol}-home/c/store.${ext}`, path.join(home, `${protocol}-home`, 'c', `store.${ext}`)],
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

      it('does not write to the home default when a path is given', () => {
        assert.ok(!existsSync(path.join(home, '.keyv-duckdb')), 'no ~/.keyv-duckdb under the test home');
      });
    });
  }
});
