import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Resolve file path from URL, handling ~ and . prefixes
 */
export function resolveFilePath(url: URL): string {
  let filePath = url.pathname;

  // Handle ~ for home directory
  if (url.host === '~') {
    filePath = path.join(os.homedir(), filePath.slice(1));
  }
  // Handle . for current directory
  else if (url.host === '.') {
    filePath = path.join(process.cwd(), filePath.slice(1));
  }

  // Ensure directory exists
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
