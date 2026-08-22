import assert from 'node:assert/strict';
import test from 'node:test';
import { splitManifestBatches } from './import';

test('splitManifestBatches keeps every descriptor and stays below the JSON budget', () => {
  const files = Array.from({ length: 1200 }, (_, index) => ({
    index,
    clientKey: `key-${index}`,
    name: `chapter-${index}/page-${'x'.repeat(500)}.jpg`,
    size: 1024,
    lastModified: index,
    sha256: 'a'.repeat(64),
  }));
  const batches = splitManifestBatches(files);
  assert.ok(batches.length > 1);
  assert.deepEqual(batches.flat().map(file => file.index), files.map(file => file.index));
  assert.ok(batches.every(batch => new TextEncoder().encode(JSON.stringify(batch)).byteLength <= 512 * 1024));
});
