import { type ChildProcess, spawn } from 'child_process';
import fs from 'fs';

export interface FileLock {
  close: (callback: (error?: Error) => void) => void;
}

/** Real exclusive Windows handle on `file` held by a PowerShell child until closed; the windows-latest CI job owns this fixture. */
export function lockFile(file: string, releaseFile: string, callback: (error: Error | null, lock?: FileLock) => void): void {
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const script = `$ErrorActionPreference='Stop'; $handle=[IO.File]::Open(${quote(file)}, 'Open', 'ReadWrite', 'None');
try { [Console]::WriteLine('READY');
while (!(Test-Path -LiteralPath ${quote(releaseFile)})) { Start-Sleep -Milliseconds 20 }
} finally { $handle.Dispose() }`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const child: ChildProcess = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
  let ready = false;
  let exited = false;
  let output = '';
  let stderr = '';
  let outcome: Error | undefined;
  const waiters: ((error?: Error) => void)[] = [];
  const lock: FileLock = {
    close: (done) => {
      if (exited) return done(outcome);
      waiters.push(done);
      fs.writeFileSync(releaseFile, '');
    },
  };
  child.stdout?.on('data', (data: Buffer) => {
    output += data.toString();
    if (!ready && output.includes('READY')) {
      ready = true;
      callback(null, lock);
    }
  });
  child.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString();
  });
  child.on('error', (error) => {
    outcome = error;
  });
  child.on('close', (code) => {
    exited = true;
    if (code !== 0 && !outcome) outcome = new Error(`Windows lock fixture failed (${code}): ${stderr}`);
    if (!ready) callback(outcome || new Error('Windows lock fixture never acquired the exclusive handle'));
    for (const done of waiters) done(outcome);
  });
}
