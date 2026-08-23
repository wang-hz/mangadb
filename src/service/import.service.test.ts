import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deduplicateNames, sanitizeFilename } from './import.service';

describe('import filenames', () => {
  it('fits sanitized Unicode names within the filesystem byte limit', () => {
    const name = sanitizeFilename(`${'漫画'.repeat(200)}.jpg`);
    assert.ok(Buffer.byteLength(name, 'utf8') <= 255);
    assert.match(name, /\.jpg$/);
  });

  it('keeps long duplicate names unique and within the filesystem byte limit', () => {
    const name = sanitizeFilename(`${'a'.repeat(400)}.jpg`);
    const results = deduplicateNames([name, name, name]);
    assert.equal(new Set(results).size, results.length);
    assert.ok(results.every(result => Buffer.byteLength(result, 'utf8') <= 255));
    assert.ok(results.every(result => result.endsWith('.jpg')));
  });
});
