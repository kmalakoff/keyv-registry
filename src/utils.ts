import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// `scheme://C:/x` parses the drive letter as a host and drops the colon, so it is rewritten to `scheme:///C:/x` first.
const DRIVE_AS_HOST = /^([a-zA-Z][a-zA-Z0-9+.-]*:)\/\/([a-zA-Z]:[/\\])/;

/**
 * Parse a store URI, keeping a Windows drive letter written after `//` in the path
 */
export function parseUri(uri: string): URL {
  return new URL(uri.replace(DRIVE_AS_HOST, '$1///$2'));
}

export interface ToFilePathOptions {
  windows?: boolean;
  homedir?: string;
  cwd?: string;
}

/**
 * Convert a file-backed store URL to a native path, handling ~ and . prefixes (no filesystem access)
 */
export function toFilePath(url: URL, options: ToFilePathOptions = {}): string {
  const windows = options.windows ?? process.platform === 'win32';
  const p = windows ? path.win32 : path.posix;
  if (url.host === '~') return p.join(options.homedir ?? os.homedir(), decodeURIComponent(url.pathname.slice(1)));
  if (url.host === '.') return p.join(options.cwd ?? process.cwd(), decodeURIComponent(url.pathname.slice(1)));
  return fileURLToPath(new URL(`file://${url.host}${url.pathname}`), { windows });
}

/**
 * Resolve file path from URL and create its parent directory
 */
export function resolveFilePath(url: URL): string {
  const filePath = toFilePath(url);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return filePath;
}

/**
 * Parse URL search params into options object with type conversion
 */
export function parseUriOptions(url: URL): Record<string, unknown> {
  const options: Record<string, unknown> = {};

  for (const [key, value] of url.searchParams) {
    // Auto-convert types
    if (value === 'true') options[key] = true;
    else if (value === 'false') options[key] = false;
    else if (/^\d+$/.test(value)) options[key] = Number.parseInt(value, 10);
    else if (/^\d+\.\d+$/.test(value)) options[key] = Number.parseFloat(value);
    else options[key] = value;
  }

  return options;
}
