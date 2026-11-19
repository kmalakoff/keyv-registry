import assert from 'assert';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { safeRmSync } from 'fs-remove-compat';
import * as path from 'path';
import { retryingFs, retryTransient } from '../../../src/lib/win-retry.ts';
import waitFor from '../../lib/wait-for.ts';
import { type FileLock, lockFile } from '../../lib/windows-lock.ts';

const dir = path.resolve('.tmp', `win-retry-${process.pid}`);
const windowsIt = process.platform === 'win32' ? it : it.skip; // real Windows handles; the windows-latest job owns these

describe('win-retry', () => {
  before(() => mkdirSync(dir, { recursive: true }));
  after(() => safeRmSync(dir));

  describe('retryTransient', () => {
    it('returns the value of a call that goes through', async () => {
      assert.equal(await retryTransient(() => 'done'), 'done');
    });

    it('surfaces a code that is not transient at once', async () => {
      let attempts = 0;
      await assert.rejects(
        retryTransient(() => {
          attempts++;
          renameSync(path.join(dir, 'does-not-exist'), path.join(dir, 'target'));
        }),
        (err: NodeJS.ErrnoException) => err.code === 'ENOENT'
      );
      assert.equal(attempts, 1);
    });

    windowsIt('a rename onto a file another handle holds open goes through once the handle closes (Windows)', (done) => {
      const target = path.join(dir, 'held.txt');
      const source = path.join(dir, 'held.new');
      writeFileSync(target, 'old');
      writeFileSync(source, 'new');
      lockFile(target, path.join(dir, 'held.release'), (err, lock?: FileLock) => {
        if (err || !lock) return done(err as Error);
        let attempts = 0;
        const renamed = retryTransient(() => {
          attempts++;
          renameSync(source, target);
        });
        waitFor('the rename to be refused at least twice', () => attempts >= 2)
          .then(() => new Promise<void>((resolve, reject) => lock.close((closeErr) => (closeErr ? reject(closeErr) : resolve()))))
          .then(() => renamed)
          .then(() => {
            assert.equal(readFileSync(target, 'utf8'), 'new');
            assert.ok(attempts >= 3);
            done();
          }, done);
      });
    });

    windowsIt('a rename onto a read-only target still fails with the original code (Windows)', async () => {
      const target = path.join(dir, 'readonly.txt');
      const source = path.join(dir, 'readonly.new');
      writeFileSync(target, 'old');
      writeFileSync(source, 'new');
      chmodSync(target, 0o444);
      await assert.rejects(
        retryTransient(() => renameSync(source, target)),
        (err: NodeJS.ErrnoException) => err.code === 'EPERM' || err.code === 'EACCES'
      );
      assert.equal(readFileSync(target, 'utf8'), 'old');
      chmodSync(target, 0o666);
    });
  });

  describe('retryingFs', () => {
    it('makes, checks and removes a folder like fs', (done) => {
      const folder = path.join(dir, 'lock-folder');
      retryingFs.mkdir(folder, (mkdirErr: Error | null) => {
        assert.ifError(mkdirErr);
        retryingFs.stat(folder, (statErr: Error | null, stats: { isDirectory(): boolean }) => {
          assert.ifError(statErr);
          assert.ok(stats.isDirectory());
          retryingFs.rmdir(folder, (rmErr: Error | null) => {
            assert.ifError(rmErr);
            assert.equal(existsSync(folder), false);
            done();
          });
        });
      });
    });

    it('passes a failure that is not transient through', (done) => {
      retryingFs.stat(path.join(dir, 'absent'), (err: NodeJS.ErrnoException | null) => {
        assert.equal(err?.code, 'ENOENT');
        done();
      });
    });
  });
});
