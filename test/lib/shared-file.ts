import { pathToFileURL } from 'url';

/** The `file+shared:` URI for a native path. */
export function sharedUrl(filename: string): string {
  return pathToFileURL(filename).href.replace(/^file:/, 'file+shared:');
}

/** The shape keyv 6 and keyv-file write: each value is Keyv's serialized `{ value }`. */
export const entry = (value: unknown) => ({ value: JSON.stringify({ value }) });
