import assert from 'assert';
import * as os from 'os';
import * as path from 'path';

// Import from source for unit testing
import { parseUriOptions, resolveFilePath } from '../../src/utils.ts';

describe('utils', () => {
  describe('parseUriOptions', () => {
    it('parses string values', () => {
      const url = new URL('redis://localhost:6379?keyPrefix=myapp&name=test');
      const options = parseUriOptions(url);

      assert.equal(options.keyPrefix, 'myapp');
      assert.equal(options.name, 'test');
    });

    it('converts boolean true', () => {
      const url = new URL('redis://localhost:6379?enabled=true&verbose=true');
      const options = parseUriOptions(url);

      assert.strictEqual(options.enabled, true);
      assert.strictEqual(options.verbose, true);
    });

    it('converts boolean false', () => {
      const url = new URL('redis://localhost:6379?enabled=false&debug=false');
      const options = parseUriOptions(url);

      assert.strictEqual(options.enabled, false);
      assert.strictEqual(options.debug, false);
    });

    it('converts integers', () => {
      const url = new URL('redis://localhost:6379?ttl=3600&port=6379&retries=3');
      const options = parseUriOptions(url);

      assert.strictEqual(options.ttl, 3600);
      assert.strictEqual(options.port, 6379);
      assert.strictEqual(options.retries, 3);
    });

    it('converts floats', () => {
      const url = new URL('redis://localhost:6379?timeout=1.5&ratio=0.75');
      const options = parseUriOptions(url);

      assert.strictEqual(options.timeout, 1.5);
      assert.strictEqual(options.ratio, 0.75);
    });

    it('returns empty object for no params', () => {
      const url = new URL('redis://localhost:6379');
      const options = parseUriOptions(url);

      assert.deepEqual(options, {});
    });

    it('handles mixed types', () => {
      const url = new URL('redis://localhost:6379?name=cache&ttl=60&enabled=true&ratio=0.5');
      const options = parseUriOptions(url);

      assert.equal(options.name, 'cache');
      assert.strictEqual(options.ttl, 60);
      assert.strictEqual(options.enabled, true);
      assert.strictEqual(options.ratio, 0.5);
    });
  });

  describe('resolveFilePath', () => {
    it('resolves home directory with ~', () => {
      const url = new URL('file://~/.cache/test.json');
      const result = resolveFilePath(url);

      assert.equal(result, path.join(os.homedir(), '.cache/test.json'));
    });

    it('resolves current directory with .', () => {
      const url = new URL('file://./data/test.json');
      const result = resolveFilePath(url);

      assert.equal(result, path.join(process.cwd(), 'data/test.json'));
    });

    it('returns pathname for absolute paths', () => {
      // Use /tmp which exists and is writable
      const url = new URL('file:///tmp/keyv-registry-test/test.json');
      const result = resolveFilePath(url);

      assert.equal(result, '/tmp/keyv-registry-test/test.json');
    });
  });
});
