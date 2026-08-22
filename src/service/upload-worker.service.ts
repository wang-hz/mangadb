import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from '@/config/env';
import { importService } from '@/service/import.service';
import { mangaService } from '@/service/manga.service';
import { UploadSessionService } from '@/service/upload-session.service';

export class UploadWorker {
  private readonly pending = new Set<string>();
  private running = false;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly sessions = new UploadSessionService(),
  ) {}

  start(): void {
    if (this.cleanupTimer) return;
    void this.resumeQueued();
    this.cleanupTimer = setInterval(() => {
      void this.resumeQueued();
      void this.sessions.cleanupExpired();
    }, 60 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  enqueue(uploadId: string): void {
    this.pending.add(uploadId);
    void this.drain();
  }

  private async resumeQueued(): Promise<void> {
    for (const session of await this.sessions.listAllSessions()) {
      if (session.state === 'queued' || session.state === 'processing') this.pending.add(session.uploadId);
    }
    await this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.size > 0) {
        const uploadId = this.pending.values().next().value as string;
        this.pending.delete(uploadId);
        await this.process(uploadId);
      }
    } finally {
      this.running = false;
    }
  }

  private async process(uploadId: string): Promise<void> {
    let session;
    try {
      session = await this.sessions.getSession(uploadId);
      if (session.state !== 'queued' && session.state !== 'processing') return;
      const existing = await mangaService.getMangaByUuid(session.mangaUuid);
      if (existing) {
        const mangaDir = path.join(DATA_DIR, session.mangaUuid);
        const pages = Array.isArray(existing.pages) ? existing.pages.filter((page): page is string => typeof page === 'string') : [];
        const filesPresent = await Promise.all(pages.map(async page => {
          try { await fs.access(path.join(mangaDir, page)); return true; } catch { return false; }
        }));
        if (pages.length > 0 && filesPresent.every(Boolean)) {
          await this.sessions.markCompleted(uploadId, { uuid: session.mangaUuid, displayTitle: existing.displayTitle, pageCount: pages.length });
          await this.sessions.cleanupPayload(uploadId);
          return;
        }
        await this.sessions.markFailed(uploadId, 'IMPORT_INCONSISTENT', 'Manga record and files are inconsistent');
        return;
      }
      await this.sessions.markProcessing(uploadId);
      session = await this.sessions.getSession(uploadId);
      const result = await importService.importFromUploadSession(session, this.sessions.sessionDirectory(uploadId));
      await this.sessions.markCompleted(uploadId, result);
      await this.sessions.cleanupPayload(uploadId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed';
      try { await this.sessions.markFailed(uploadId, 'IMPORT_FAILED', message); } catch { /* session may have expired */ }
    }
  }
}

export const uploadWorker = new UploadWorker();
