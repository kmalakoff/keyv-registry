// Child process for test/integration/processes.test.ts: argv is <dir> <role> <scenario>.
// Roles coordinate with the parent through marker files in <dir>.
import fs from 'node:fs';
import path from 'node:path';
import { Keyv } from 'keyv';
import { KeyvSharedFile } from 'keyv-registry';
import lockfile from 'proper-lockfile';
import { storeHooks } from '../../src/lib/store-hooks.ts';
import SourceStore from '../../src/shared-file-store.ts';

const [dir, role, scenario] = process.argv.slice(2);
const file = path.join(dir, 'tokens.json');
const mark = (name) => fs.writeFileSync(path.join(dir, name), '');
const marked = (name) => fs.existsSync(path.join(dir, name));
const waitFor = async (check) => {
  while (!check()) await new Promise((resolve) => setTimeout(resolve, 2));
};

fs.writeFileSync(path.join(dir, `pid-${role}`), String(process.pid));
const out = { role };

if (scenario === 'sign-in') {
  const store = new Keyv({ store: new KeyvSharedFile({ filename: file }) });
  mark(`ready-${role}`);
  await waitFor(() => marked('ready-A') && marked('ready-B'));
  await store.set(`${role}@x:mcp-${role}:token`, { accessToken: `${role}-1` });
} else if (scenario === 'writer') {
  const store = new Keyv({ store: new KeyvSharedFile({ filename: file }) });
  const pad = 'x'.repeat(200000);
  let i = 0;
  mark('writing');
  while (!marked('reader-done')) await store.set('alice@x:mcp-gmail:token', { accessToken: String(i++), pad });
  out.writes = i;
} else if (scenario === 'hold') {
  // Takes the real lock and never releases it: the parent kills this process.
  await lockfile.lock(file, { realpath: false, stale: 10000 });
  mark('held');
  setInterval(() => {}, 2 ** 30); // keeps the process alive until it is killed
  await new Promise(() => {});
} else if (scenario === 'paused-write') {
  // Blocks inside the locked write, after the file was read and before the rename, until the parent releases it.
  // The source module is loaded directly: the hook seam is not part of the package entry.
  const store = new SourceStore({ filename: file });
  storeHooks.set(store, {
    afterRead: () => {
      mark('in-write');
      while (!marked('release')) {}
    },
  });
  try {
    await store.set('holder@x:mcp-holder:token', { accessToken: 'holder' });
    out.rejected = null;
  } catch (err) {
    out.rejected = err.code;
    out.message = err.message;
  }
}
console.log(JSON.stringify(out));
process.exit(0);
