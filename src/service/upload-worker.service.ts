import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from '@/config/env';
import { logger } from '@/logger';
import { importService } from '@/service/import.service';
import { mangaService } from '@/service/manga.service';
import { UploadSessionService, type UploadSession } from '@/service/upload-session.service';

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

export class UploadWorker {
  private readonly pending = new Set<string>();
  private running = false;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly sessions = new UploadSessionService(),
    private readonly importer: Pick<typeof importService, 'importFromUploadSession'> = importService,
    private readonly mangas: Pick<typeof mangaService, 'getMangaByUuid'> = mangaService,
    private readonly log: Pick<typeof logger, 'info' | 'error'> = logger,
    private readonly maintenanceIntervalMs = MAINTENANCE_INTERVAL_MS,
  ) {}

  start(): void {
    if (this.cleanupTimer) return;
    this.runMaintenance();
    this.cleanupTimer = setInterval(() => this.runMaintenance(), this.maintenanceIntervalMs);
    this.cleanupTimer.unref();
  }

  stop(): void {
    if (!this.cleanupTimer) return;
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = undefined;
  }

  private runMaintenance(): void {
    void this.resumeQueued().catch(error => this.log.error('Upload recovery failed', error));
    void this.sessions.cleanupExpired()
      .then(removed => { if (removed > 0) this.log.info(`Cleaned up ${removed} expired upload session(s)`); })
      .catch(error => this.log.error('Upload session cleanup failed', error));
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
    let result: NonNullable<UploadSession['result']>;
    try {
      session = await this.sessions.getSession(uploadId);
      if (session.state !== 'queued' && session.state !== 'processing') return;
      const existing = await this.mangas.getMangaByUuid(session.mangaUuid);
      if (existing) {
        const mangaDir = path.join(DATA_DIR, session.mangaUuid);
        const pages = Array.isArray(existing.pages) ? existing.pages.filter((page): page is string => typeof page === 'string') : [];
        const filesPresent = await Promise.all(pages.map(async page => {
          try { await fs.access(path.join(mangaDir, page)); return true; } catch { return false; }
        }));
        if (pages.length > 0 && filesPresent.every(Boolean)) {
          await this.finalizeSuccess(uploadId, { uuid: session.mangaUuid, displayTitle: existing.displayTitle, pageCount: pages.length });
          return;
        }
        await this.sessions.markFailed(uploadId, 'IMPORT_INCONSISTENT', 'Manga record and files are inconsistent');
        return;
      }
      await this.sessions.markProcessing(uploadId);
      session = await this.sessions.getSession(uploadId);
      result = await this.importer.importFromUploadSession(session, this.sessions.sessionDirectory(uploadId));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed';
      try { await this.sessions.markFailed(uploadId, 'IMPORT_FAILED', message); } catch { /* session may have expired */ }
      return;
    }
    await this.finalizeSuccess(uploadId, result);
  }

  private async finalizeSuccess(uploadId: string, result: NonNullable<UploadSession['result']>): Promise<void> {
    try {
      const finalized = await this.sessions.finalizeCompleted(uploadId, result);
      if (finalized.cleanupError !== undefined) {
        this.log.error(`Upload ${uploadId} completed, but temporary payload cleanup failed`, finalized.cleanupError);
      }
    } catch (error) {
      this.log.error(`Upload ${uploadId} was imported but could not be finalized; recovery will retry it`, error);
    }
  }
}

export const uploadWorker = new UploadWorker();
