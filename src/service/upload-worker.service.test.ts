import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UploadSessionService, type UploadSession } from './upload-session.service';
import { UploadWorker } from './upload-worker.service';

const session: UploadSession = {
  uploadId: '11111111-1111-4111-8111-111111111111',
  ownerUuid: '22222222-2222-4222-8222-222222222222',
  mangaUuid: '33333333-3333-4333-8333-333333333333',
  mode: 'zip',
  metadata: { fullname: 'book', displayTitle: 'Book', originalTitle: 'Book', tagUuids: [], pendingTags: [] },
  expectedFileCount: 1,
  totalBytes: 1,
  manifestSha256: 'a'.repeat(64),
  chunkSize: 768 * 1024,
  state: 'queued',
  files: [],
  receivedBytes: 1,
  receivedChunks: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-01-02T00:00:00.000Z',
};

const importer = {
  async importFromUploadSession() {
    return { uuid: session.mangaUuid, displayTitle: 'Book', pageCount: 1 };
  },
};

const mangas = { async getMangaByUuid() { return null; } };

describe('upload worker maintenance', () => {
  it('runs recovery and expiry cleanup immediately on start', async () => {
    let recoveryCalls = 0;
    let cleanupCalls = 0;
    const sessions = {
      async listAllSessions() { recoveryCalls++; return []; },
      async cleanupExpired() { cleanupCalls++; return 0; },
    } as unknown as UploadSessionService;
    const worker = new UploadWorker(sessions, importer, mangas, { info() {}, error() {} }, 60_000);
    worker.start();
    await new Promise(resolve => setImmediate(resolve));
    worker.stop();
    assert.equal(recoveryCalls, 1);
    assert.equal(cleanupCalls, 1);
  });

  it('does not mark an imported manga as failed when payload cleanup reports an error', async () => {
    let state: UploadSession['state'] = 'queued';
    let failed = false;
    let finalized = false;
    const errors: string[] = [];
    const sessions = {
      async getSession() { return { ...session, state }; },
      async markProcessing() { state = 'processing'; return { ...session, state }; },
      sessionDirectory() { return '/tmp/upload-worker-test'; },
      async finalizeCompleted(_uploadId: string, result: UploadSession['result']) {
        finalized = true;
        state = 'completed';
        return { session: { ...session, state, result }, cleanupError: new Error('cleanup failed') };
      },
      async markFailed() { failed = true; state = 'failed'; return { ...session, state }; },
    } as unknown as UploadSessionService;
    const worker = new UploadWorker(
      sessions,
      importer,
      mangas,
      { info() {}, error(message) { errors.push(message); } },
    );
    await (worker as unknown as { process(uploadId: string): Promise<void> }).process(session.uploadId);
    assert.equal(finalized, true);
    assert.equal(failed, false);
    assert.equal(state, 'completed');
    assert.ok(errors.some(message => message.includes('payload cleanup failed')));
  });
});
