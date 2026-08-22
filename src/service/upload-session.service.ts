import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from '@/config/env';
import {
  IMPORT_CHUNK_SIZE,
  IMPORT_MAX_FILE_SIZE,
  IMPORT_MAX_PAGE_COUNT,
  IMPORT_MAX_TOTAL_SIZE,
  IMPORT_UPLOAD_TTL_MS,
} from '@/service/import.constants';

export type UploadMode = 'zip' | 'images';
export type UploadState = 'registering' | 'uploading' | 'queued' | 'processing' | 'completed' | 'failed';

export interface UploadFileManifest {
  index: number;
  clientKey: string;
  name: string;
  relativePath?: string;
  size: number;
  lastModified: number;
  chunkCount?: number;
}

export interface UploadMetadata {
  fullname: string;
  displayTitle: string;
  originalTitle: string;
  publishDate?: string;
  tagUuids: string[];
  pendingTags: Array<{ name: string; tagTypeName: string }>;
}

export interface UploadSession {
  uploadId: string;
  ownerUuid: string;
  mangaUuid: string;
  mode: UploadMode;
  metadata: UploadMetadata;
  expectedFileCount: number;
  totalBytes: number;
  manifestSha256: string;
  chunkSize: number;
  state: UploadState;
  files: UploadFileManifest[];
  receivedBytes: number;
  receivedChunks: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  error?: { code: string; message: string };
  result?: { uuid: string; displayTitle: string; pageCount: number };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;
const ZIP_EXT = /\.(zip|cbz)$/i;

function nowIso(now: () => number): string {
  return new Date(now()).toISOString();
}

function hashManifest(files: UploadFileManifest[]): string {
  const canonical = [...files]
    .sort((a, b) => a.index - b.index)
    .map(file => [file.index, file.clientKey, file.name, file.relativePath ?? '', file.size, file.lastModified].join('\u0000'))
    .join('\n');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function validateName(name: string, field: string): void {
  if (!name || Buffer.byteLength(name, 'utf8') > 255) {
    throw new Error(`${field} must be 1-255 UTF-8 bytes`);
  }
}

function validateManifestFile(file: UploadFileManifest, mode: UploadMode, expectedIndex: number): UploadFileManifest {
  if (!Number.isSafeInteger(file.index) || file.index !== expectedIndex) {
    throw new Error('Manifest indexes must be consecutive integers');
  }
  validateName(file.name, 'File name');
  if (!file.clientKey || file.clientKey.length > 4096) throw new Error('Invalid client file key');
  if (file.relativePath !== undefined && file.relativePath.length > 4096) throw new Error('Invalid relative path');
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > IMPORT_MAX_FILE_SIZE) {
    throw new Error('Invalid file size');
  }
  if (!Number.isSafeInteger(file.lastModified) || file.lastModified < 0) {
    throw new Error('Invalid file timestamp');
  }
  if (mode === 'zip' ? !ZIP_EXT.test(file.name) : !IMAGE_EXT.test(file.name)) {
    throw new Error(`Unsupported file extension: ${file.name}`);
  }
  return {
    ...file,
    chunkCount: file.size === 0 ? 0 : Math.ceil(file.size / IMPORT_CHUNK_SIZE),
  };
}

export function validateUploadRequest(input: {
  mode: UploadMode;
  expectedFileCount: number;
  totalBytes: number;
}): void {
  if (!Number.isSafeInteger(input.expectedFileCount) || input.expectedFileCount < 1 || input.expectedFileCount > IMPORT_MAX_PAGE_COUNT) {
    throw new Error(`File count must be between 1 and ${IMPORT_MAX_PAGE_COUNT}`);
  }
  if (!Number.isSafeInteger(input.totalBytes) || input.totalBytes <= 0 || input.totalBytes > IMPORT_MAX_TOTAL_SIZE) {
    throw new Error('Total upload size must be between 1 byte and 10 GiB');
  }
  if (input.mode === 'zip' && input.expectedFileCount !== 1) {
    throw new Error('ZIP imports require exactly one file');
  }
}

export class UploadSessionService {
  constructor(
    private readonly rootDir = path.join(DATA_DIR, '.uploads'),
    private readonly clock: () => number = () => Date.now(),
  ) {}

  private sessionDir(uploadId: string): string {
    if (!UUID_RE.test(uploadId)) throw new Error('Invalid upload id');
    return path.join(this.rootDir, uploadId);
  }

  private sessionPath(uploadId: string): string {
    return path.join(this.sessionDir(uploadId), 'session.json');
  }

  private async writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
    const tempPath = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tempPath, filePath);
  }

  private async readSession(uploadId: string): Promise<UploadSession> {
    const raw = await fs.readFile(this.sessionPath(uploadId), 'utf8');
    return JSON.parse(raw) as UploadSession;
  }

  private async saveSession(session: UploadSession): Promise<void> {
    session.updatedAt = nowIso(this.clock);
    await this.writeJsonAtomic(this.sessionPath(session.uploadId), session);
  }

  async createSession(input: {
    ownerUuid: string;
    mangaUuid: string;
    mode: UploadMode;
    metadata: UploadMetadata;
    expectedFileCount: number;
    totalBytes: number;
    manifestSha256: string;
  }): Promise<UploadSession> {
    if (!UUID_RE.test(input.ownerUuid) || !UUID_RE.test(input.mangaUuid)) throw new Error('Invalid owner or manga id');
    validateUploadRequest(input);
    if (!/^[0-9a-f]{64}$/i.test(input.manifestSha256)) throw new Error('Invalid manifest hash');

    const uploadId = crypto.randomUUID();
    const createdAt = nowIso(this.clock);
    const session: UploadSession = {
      uploadId,
      ownerUuid: input.ownerUuid,
      mangaUuid: input.mangaUuid,
      mode: input.mode,
      metadata: input.metadata,
      expectedFileCount: input.expectedFileCount,
      totalBytes: input.totalBytes,
      manifestSha256: input.manifestSha256.toLowerCase(),
      chunkSize: IMPORT_CHUNK_SIZE,
      state: 'registering',
      files: [],
      receivedBytes: 0,
      receivedChunks: 0,
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(this.clock() + IMPORT_UPLOAD_TTL_MS).toISOString(),
    };
    const dir = this.sessionDir(uploadId);
    await fs.mkdir(path.join(dir, 'manifest-parts'), { recursive: true });
    await fs.mkdir(path.join(dir, 'files'), { recursive: true });
    await this.writeJsonAtomic(path.join(dir, 'session.json'), session);
    return session;
  }

  async getSession(uploadId: string, ownerUuid?: string): Promise<UploadSession> {
    const session = await this.readSession(uploadId);
    if (ownerUuid !== undefined && session.ownerUuid !== ownerUuid) throw new Error('Upload not found');
    return session;
  }

  async saveManifestBatch(uploadId: string, ownerUuid: string, batchIndex: number, files: UploadFileManifest[]): Promise<void> {
    if (!Number.isSafeInteger(batchIndex) || batchIndex < 0) throw new Error('Invalid manifest batch');
    const session = await this.getSession(uploadId, ownerUuid);
    if (session.state !== 'registering') throw new Error('Manifest is already complete');
    const normalized = files.map((file, index) => validateManifestFile(file, session.mode, file.index ?? index));
    const batchPath = path.join(this.sessionDir(uploadId), 'manifest-parts', `${batchIndex}.json`);
    await this.writeJsonAtomic(batchPath, normalized);
    await this.saveSession(session);
  }

  async completeManifest(uploadId: string, ownerUuid: string): Promise<UploadSession> {
    const session = await this.getSession(uploadId, ownerUuid);
    if (session.state === 'uploading') return session;
    if (session.state !== 'registering') throw new Error('Manifest cannot be completed in this state');
    const partDir = path.join(this.sessionDir(uploadId), 'manifest-parts');
    const partNames = (await fs.readdir(partDir)).filter(name => name.endsWith('.json')).sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
    const files: UploadFileManifest[] = [];
    for (const partName of partNames) {
      const part = JSON.parse(await fs.readFile(path.join(partDir, partName), 'utf8')) as UploadFileManifest[];
      files.push(...part);
    }
    if (files.length !== session.expectedFileCount) throw new Error('Manifest file count does not match');
    const normalized = files
      .sort((a, b) => a.index - b.index)
      .map((file, index) => validateManifestFile(file, session.mode, index));
    const totalBytes = normalized.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes !== session.totalBytes) throw new Error('Manifest total size does not match');
    if (hashManifest(normalized) !== session.manifestSha256) throw new Error('Manifest hash does not match');
    session.files = normalized;
    session.state = 'uploading';
    session.expiresAt = new Date(this.clock() + IMPORT_UPLOAD_TTL_MS).toISOString();
    await this.saveSession(session);
    return session;
  }

  async updateState(uploadId: string, ownerUuid: string, state: UploadState): Promise<UploadSession> {
    const session = await this.getSession(uploadId, ownerUuid);
    session.state = state;
    await this.saveSession(session);
    return session;
  }

  async cleanupExpired(): Promise<number> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    const now = this.clock();
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || !UUID_RE.test(entry.name)) continue;
      try {
        const session = await this.readSession(entry.name);
        if (session.state === 'queued' || session.state === 'processing') continue;
        if (new Date(session.expiresAt).getTime() <= now) {
          await fs.rm(this.sessionDir(entry.name), { recursive: true, force: true });
          removed++;
        }
      } catch {
        // An incomplete directory is safe to remove only after it has aged out;
        // leave it for the next cleanup pass if its session file is unreadable.
      }
    }
    return removed;
  }
}

export function manifestHash(files: UploadFileManifest[]): string {
  return hashManifest(files);
}
