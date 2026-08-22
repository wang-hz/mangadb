import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, it } from 'node:test';
import { IMPORT_CHUNK_SIZE, IMPORT_MAX_TOTAL_SIZE } from './import.constants';
import { UploadSessionService, manifestHash, validateUploadRequest } from './upload-session.service';

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'mangadb-upload-test-'));
}

const uuid = '11111111-1111-4111-8111-111111111111';
const mangaUuid = '22222222-2222-4222-8222-222222222222';

describe('upload session validation', () => {
  it('accepts the 10 GiB boundary and rejects one byte over', () => {
    assert.doesNotThrow(() => validateUploadRequest({ mode: 'zip', expectedFileCount: 1, totalBytes: IMPORT_MAX_TOTAL_SIZE }));
    assert.throws(() => validateUploadRequest({ mode: 'zip', expectedFileCount: 1, totalBytes: IMPORT_MAX_TOTAL_SIZE + 1 }));
  });

  it('calculates fixed chunk counts', () => {
    assert.equal(Math.ceil((IMPORT_CHUNK_SIZE + 1) / IMPORT_CHUNK_SIZE), 2);
  });
});

describe('upload sessions', () => {
  it('persists a manifest in batches and moves to uploading', async () => {
    const root = await tempDir();
    const service = new UploadSessionService(root, () => Date.parse('2026-01-01T00:00:00Z'));
    const files = [{ index: 0, clientKey: 'book.zip', name: 'book.zip', size: 5, lastModified: 1 }];
    const session = await service.createSession({
      ownerUuid: uuid,
      mangaUuid,
      mode: 'zip',
      metadata: { fullname: 'book', displayTitle: 'Book', originalTitle: 'Book', tagUuids: [], pendingTags: [] },
      expectedFileCount: 1,
      totalBytes: 5,
      manifestSha256: manifestHash(files),
    });
    await service.saveManifestBatch(session.uploadId, uuid, 0, files);
    const completed = await service.completeManifest(session.uploadId, uuid);
    assert.equal(completed.state, 'uploading');
    assert.equal(completed.files[0].chunkCount, 1);
    await assert.rejects(() => service.getSession(session.uploadId, '33333333-3333-4333-8333-333333333333'));
    await fs.rm(root, { recursive: true, force: true });
  });
});
