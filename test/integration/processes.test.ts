// Child processes through cross-spawn-cb: the process boundary is the subject.
import assert from 'assert';
import spawn from 'cross-spawn-cb';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { safeRmSync } from 'fs-remove-compat';
import { Keyv } from 'keyv';
import { KeyvSharedFile } from 'keyv-registry';
import * as path from 'path';
import waitFor from '../lib/wait-for.ts';

const actor = path.resolve('test', 'lib', 'shared-file-actor.mjs');
const root = path.resolve('.tmp', `processes-${process.pid}`);
const posixIt = process.platform === 'win32' ? it.skip : it; // SIGSTOP does not exist on Windows

interface Child {
  dir: string;
  done: Promise<{ status: number | null; out: string; err: string }>;
  exited: () => boolean;
  pid: () => Promise<number>;
  markerOrExit: (name: string) => Promise<void>;
}

function scratch(name: string): string {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function start(dir: string, role: string, scenario: string): Child {
  let exited = false;
  const done = spawn(process.execPath, [actor, dir, role, scenario], { encoding: 'utf8' })
    .then(
      (res) => ({ status: res.status, out: String(res.stdout).trim(), err: String(res.stderr).trim() }),
      (err) => ({ status: err.status ?? null, out: String(err.stdout ?? '').trim(), err: String(err.stderr ?? err.message).trim() })
    )
    .then((res) => {
      exited = true;
      return res;
    });
  // Waits for the marker, or for the process to exit first, which fails the spec instead of waiting on a dead process.
  const markerOrExit = async (name: string) => {
    const file = path.join(dir, name);
    await waitFor(`${name} from ${role}, or its exit`, () => existsSync(file) || exited);
    if (existsSync(file)) return;
    const res = await done;
    throw new Error(`${role} exited before ${name} (status ${res.status}): ${res.err}`);
  };
  const pid = async () => {
    const file = path.join(dir, `pid-${role}`);
    await waitFor(`the ${role} process to write its pid, or exit`, () => (existsSync(file) && readFileSync(file, 'utf8') !== '') || exited);
    if (!existsSync(file) || readFileSync(file, 'utf8') === '') throw new Error(`${role} exited before writing its pid`);
    return Number(readFileSync(file, 'utf8'));
  };
  return { dir, done, exited: () => exited, pid, markerOrExit };
}

const keysOnDisk = (dir: string): string[] => JSON.parse(readFileSync(path.join(dir, 'tokens.json'), 'utf8')).cache.map((e: [string]) => e[0]);
const mark = (dir: string, name: string) => writeFileSync(path.join(dir, name), '');
const noLeftovers = (dir: string) =>
  assert.deepEqual(
    readdirSync(dir).filter((name) => name.startsWith('tokens.json.')),
    [],
    'no lock folder or temp file left'
  );

// Kills the holder once it holds the lock, and in every case if the wait fails, so no holder outlives the spec.
async function killWhenHeld(holder: Child): Promise<void> {
  try {
    await holder.markerOrExit('held');
  } finally {
    if (!holder.exited()) process.kill(await holder.pid(), 'SIGKILL');
    await holder.done;
  }
}

describe('file+shared: across processes', () => {
  after(() => safeRmSync(root));

  it('two processes signing in at once both keep their sign-in', async () => {
    for (let round = 0; round < 5; round++) {
      const dir = scratch(`sign-in-${round}`);
      const actors = [start(dir, 'A', 'sign-in'), start(dir, 'B', 'sign-in')];
      try {
        await Promise.all(actors.map((child, i) => child.markerOrExit(`ready-${'AB'[i]}`)));
      } catch (err) {
        mark(dir, 'ready-A'); // releases an actor that waits for a partner that is gone
        mark(dir, 'ready-B');
        await Promise.all(actors.map((child) => child.done));
        throw err;
      }
      const results = await Promise.all(actors.map((child) => child.done));
      for (const res of results) assert.equal(res.status, 0, res.err);
      assert.deepEqual(keysOnDisk(dir).sort(), ['A@x:mcp-A:token', 'B@x:mcp-B:token'], `round ${round}`);
      noLeftovers(dir);
    }
  });

  it('a reader sees the key on every read while another process rewrites it', async () => {
    const dir = scratch('reader');
    const reader = new Keyv({ store: new KeyvSharedFile({ filename: path.join(dir, 'tokens.json') }) });
    await reader.set('alice@x:mcp-gmail:token', { accessToken: 'seed' });
    const writer = start(dir, 'W', 'writer');
    await waitFor('the writer to start writing', () => existsSync(path.join(dir, 'writing')));
    let missing = 0;
    try {
      for (let i = 0; i < 500; i++) if ((await reader.get('alice@x:mcp-gmail:token')) === undefined) missing++;
    } finally {
      mark(dir, 'reader-done');
    }
    const res = await writer.done;
    assert.equal(res.status, 0, res.err);
    assert.ok(JSON.parse(res.out).writes > 0, 'the writer rewrote the key during the reads');
    assert.equal(missing, 0);
    noLeftovers(dir);
  });

  it('takes over the lock of a holder that was killed', async () => {
    const dir = scratch('killed');
    const holder = start(dir, 'H', 'hold');
    await killWhenHeld(holder);
    assert.ok(existsSync(path.join(dir, 'tokens.json.lock')), 'the killed holder left its lock');
    const store = new Keyv({ store: new KeyvSharedFile({ filename: path.join(dir, 'tokens.json') }) });
    await store.set('carol@x:mcp-sheets:token', { accessToken: 'c' });
    assert.deepEqual(keysOnDisk(dir), ['carol@x:mcp-sheets:token']);
    noLeftovers(dir);
  });

  it('scratch cleanup is not blocked by the lock folder a killed holder left', async () => {
    const dir = scratch('cleanup');
    const holder = start(dir, 'H', 'hold');
    await killWhenHeld(holder);
    assert.ok(existsSync(path.join(dir, 'tokens.json.lock')), 'the killed holder left its lock');
    safeRmSync(dir);
    assert.equal(existsSync(dir), false);
  });

  posixIt("rejects the write of a holder paused past the stale time and keeps the other writer's change (POSIX)", async () => {
    const dir = scratch('paused');
    const holder = start(dir, 'H', 'paused-write');
    await holder.markerOrExit('in-write');
    const pid = await holder.pid();
    process.kill(pid, 'SIGSTOP');
    try {
      const store = new Keyv({ store: new KeyvSharedFile({ filename: path.join(dir, 'tokens.json') }) });
      await store.set('contender@x:mcp-drive:token', { accessToken: 'c' });
    } finally {
      process.kill(pid, 'SIGCONT'); // the holder is blocked until released, so it is still alive here
      mark(dir, 'release');
    }
    const res = await holder.done;
    assert.equal(res.status, 0, res.err);
    const result = JSON.parse(res.out);
    assert.equal(result.rejected, 'ECOMPROMISED', res.out);
    assert.deepEqual(keysOnDisk(dir), ['contender@x:mcp-drive:token']);
    noLeftovers(dir);
  });
});
