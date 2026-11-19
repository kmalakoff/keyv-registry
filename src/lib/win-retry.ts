import fs from 'node:fs';
import { MAX_ATTEMPTS, TRANSIENT_CODES } from '../constants.ts';

type CallbackFn = (...args: unknown[]) => void;

// Windows keeps a removed name delete-pending, and refuses a rename over a file another process has open, until that
// handle closes. The retry ends when the call goes through; the attempt bound only turns a permanent failure into the original error.
function retries(err: unknown, attempt: number): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return process.platform === 'win32' && code !== undefined && TRANSIENT_CODES.has(code) && attempt + 1 < MAX_ATTEMPTS;
}

const backoff = (attempt: number): Promise<void> => new Promise((resolve) => (attempt === 0 ? setImmediate(resolve) : setTimeout(resolve, Math.min(2 ** (attempt - 1), 100))));

/**
 * Run `fn`, retrying while Windows answers EPERM, EBUSY or EACCES. Other codes and other platforms surface at once.
 */
export async function retryTransient<T>(fn: () => T | Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!retries(err, attempt)) throw err;
    }
    await backoff(attempt);
  }
}

function retryingCallback(name: 'mkdir' | 'stat' | 'rmdir'): CallbackFn {
  const call = fs[name] as CallbackFn;
  return (...args) => {
    const callback = args.pop() as CallbackFn;
    const go = (attempt: number): void =>
      call(...args, (err: unknown, ...rest: unknown[]) => {
        if (retries(err, attempt)) backoff(attempt).then(() => go(attempt + 1));
        else callback(err, ...rest);
      });
    go(0);
  };
}

/** `fs` for proper-lockfile's `fs` option: the lock folder's mkdir, stat and rmdir retry like `retryTransient`. */
export const retryingFs: Omit<typeof fs, 'mkdir' | 'stat' | 'rmdir'> & Record<'mkdir' | 'stat' | 'rmdir', CallbackFn> = {
  ...fs,
  mkdir: retryingCallback('mkdir'),
  stat: retryingCallback('stat'),
  rmdir: retryingCallback('rmdir'),
};
