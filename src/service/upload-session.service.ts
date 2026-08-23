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
  if (!name || Array.from(name).length > 255) {
    throw new Error(`${field} must be 1-255 characters`);
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
  private readonly locks = new Map<string, Promise<void>>();

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

  private async withLock<T>(uploadId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(uploadId) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>(resolve => { release = resolve; });
    const queued = previous.then(() => next);
    this.locks.set(uploadId, queued);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(uploadId) === queued) this.locks.delete(uploadId);
    }
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
    let session: UploadSession;
    try {
      session = await this.readSession(uploadId);
    } catch (error: any) {
      if (error.code === 'ENOENT') throw new Error('Upload not found');
      throw error;
    }
    if (ownerUuid !== undefined && session.ownerUuid !== ownerUuid) throw new Error('Upload not found');
    return session;
  }

  sessionDirectory(uploadId: string): string {
    return this.sessionDir(uploadId);
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
    return this.withLock(uploadId, async () => {
      const session = await this.getSession(uploadId, ownerUuid);
      session.state = state;
      await this.saveSession(session);
      return session;
    });
  }

  private dataPath(uploadId: string, fileIndex: number): string {
    return path.join(this.sessionDir(uploadId), 'files', `${fileIndex}.data`);
  }

  private markerPath(uploadId: string, fileIndex: number, suffix: 'received' | 'hashes'): string {
    return path.join(this.sessionDir(uploadId), 'files', `${fileIndex}.${suffix}`);
  }

  private async readByte(filePath: string, offset: number): Promise<number> {
    try {
      const handle = await fs.open(filePath, 'r');
      try {
        const buffer = Buffer.alloc(1);
        const result = await handle.read(buffer, 0, 1, offset);
        return result.bytesRead === 1 ? buffer[0] : 0;
      } finally {
        await handle.close();
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') return 0;
      throw error;
    }
  }

  private async readHash(filePath: string, offset: number): Promise<string | null> {
    try {
      const handle = await fs.open(filePath, 'r');
      try {
        const buffer = Buffer.alloc(32);
        const result = await handle.read(buffer, 0, 32, offset);
        return result.bytesRead === 32 ? buffer.toString('hex') : null;
      } finally {
        await handle.close();
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  private async writeAt(filePath: string, data: Buffer, offset: number): Promise<void> {
    let handle;
    try {
      handle = await fs.open(filePath, 'r+');
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
      handle = await fs.open(filePath, 'w+');
    }
    try {
      await handle.write(data, 0, data.length, offset);
    } finally {
      await handle.close();
    }
  }

  async writeChunk(input: {
    uploadId: string;
    ownerUuid: string;
    fileIndex: number;
    chunkIndex: number;
    body: Buffer;
    sha256: string;
  }): Promise<{ duplicate: boolean; session: UploadSession }> {
    return this.withLock(input.uploadId, async () => {
      const session = await this.getSession(input.uploadId, input.ownerUuid);
      if (session.state !== 'uploading') throw new Error('Upload is not accepting chunks');
      const file = session.files[input.fileIndex];
      if (!file || file.index !== input.fileIndex) throw new Error('Invalid file index');
      if (!Number.isSafeInteger(input.chunkIndex) || input.chunkIndex < 0 || input.chunkIndex >= (file.chunkCount ?? 0)) {
        throw new Error('Invalid chunk index');
      }
      if (!/^[0-9a-f]{64}$/i.test(input.sha256)) throw new Error('Invalid chunk hash');
      const expectedSize = Math.min(session.chunkSize, file.size - input.chunkIndex * session.chunkSize);
      if (input.body.length !== expectedSize) throw new Error('Invalid chunk size');
      const actualHash = crypto.createHash('sha256').update(input.body).digest('hex');
      if (actualHash !== input.sha256.toLowerCase()) throw new Error('Chunk hash mismatch');

      const receivedPath = this.markerPath(input.uploadId, input.fileIndex, 'received');
      const hashPath = this.markerPath(input.uploadId, input.fileIndex, 'hashes');
      if (await this.readByte(receivedPath, input.chunkIndex)) {
        const storedHash = await this.readHash(hashPath, input.chunkIndex * 32);
        if (storedHash !== actualHash) throw new Error('Chunk already exists with different content');
        return { duplicate: true, session };
      }

      await this.writeAt(this.dataPath(input.uploadId, input.fileIndex), input.body, input.chunkIndex * session.chunkSize);
      await this.writeAt(hashPath, Buffer.from(actualHash, 'hex'), input.chunkIndex * 32);
      await this.writeAt(receivedPath, Buffer.from([1]), input.chunkIndex);
      session.receivedBytes += input.body.length;
      session.receivedChunks++;
      session.expiresAt = new Date(this.clock() + IMPORT_UPLOAD_TTL_MS).toISOString();
      await this.saveSession(session);
      return { duplicate: false, session };
    });
  }

  async getReceived(uploadId: string, ownerUuid: string, includeHashes = false) {
    const session = await this.getSession(uploadId, ownerUuid);
    const files = [] as Array<{ index: number; receivedChunks: number[]; hashes?: Record<number, string> }>;
    for (const file of session.files) {
      const receivedChunks: number[] = [];
      const hashes: Record<number, string> = {};
      for (let index = 0; index < (file.chunkCount ?? 0); index++) {
        if (await this.readByte(this.markerPath(uploadId, file.index, 'received'), index)) {
          receivedChunks.push(index);
          if (includeHashes) {
            const hash = await this.readHash(this.markerPath(uploadId, file.index, 'hashes'), index * 32);
            if (hash) hashes[index] = hash;
          }
        }
      }
      if (receivedChunks.length > 0 || includeHashes) files.push({ index: file.index, receivedChunks, ...(includeHashes ? { hashes } : {}) });
    }
    return { session, files };
  }

  async queue(uploadId: string, ownerUuid: string): Promise<UploadSession> {
    return this.withLock(uploadId, async () => {
      const session = await this.getSession(uploadId, ownerUuid);
      if (session.state === 'queued' || session.state === 'processing') return session;
      if (session.state === 'completed') return session;
      if (session.state !== 'uploading' && session.state !== 'failed') throw new Error('Upload is not ready to complete');
      for (const file of session.files) {
        for (let index = 0; index < (file.chunkCount ?? 0); index++) {
          if (!(await this.readByte(this.markerPath(uploadId, file.index, 'received'), index))) throw new Error('Upload is missing chunks');
        }
      }
      session.state = 'queued';
      await this.saveSession(session);
      return session;
    });
  }

  async listSessions(ownerUuid: string): Promise<UploadSession[]> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    const sessions: UploadSession[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !UUID_RE.test(entry.name)) continue;
      try {
        const session = await this.getSession(entry.name, ownerUuid);
        sessions.push(session);
      } catch {
        // Ignore sessions owned by another user or incomplete directories.
      }
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listAllSessions(): Promise<UploadSession[]> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
    const sessions: UploadSession[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !UUID_RE.test(entry.name)) continue;
      try { sessions.push(await this.getSession(entry.name)); } catch { /* ignore incomplete dirs */ }
    }
    return sessions;
  }

  async markProcessing(uploadId: string): Promise<UploadSession> {
    return this.withLock(uploadId, async () => {
      const session = await this.getSession(uploadId);
      session.state = 'processing';
      await this.saveSession(session);
      return session;
    });
  }

  async markCompleted(uploadId: string, result: UploadSession['result']): Promise<UploadSession> {
    return this.withLock(uploadId, async () => {
      const session = await this.getSession(uploadId);
      session.state = 'completed';
      session.result = result;
      session.error = undefined;
      session.expiresAt = new Date(this.clock() + IMPORT_UPLOAD_TTL_MS).toISOString();
      await this.saveSession(session);
      return session;
    });
  }

  async markFailed(uploadId: string, code: string, message: string): Promise<UploadSession> {
    return this.withLock(uploadId, async () => {
      const session = await this.getSession(uploadId);
      session.state = 'failed';
      session.error = { code, message: message.slice(0, 1000) };
      session.expiresAt = new Date(this.clock() + IMPORT_UPLOAD_TTL_MS).toISOString();
      await this.saveSession(session);
      return session;
    });
  }

  async cleanupPayload(uploadId: string): Promise<void> {
    const dir = this.sessionDir(uploadId);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(entries.filter(entry => entry.name !== 'session.json').map(entry => fs.rm(path.join(dir, entry.name), { recursive: true, force: true })));
  }

  async remove(uploadId: string, ownerUuid: string): Promise<void> {
    await this.withLock(uploadId, async () => {
      const session = await this.getSession(uploadId, ownerUuid);
      if (session.state === 'processing') throw new Error('Upload is being processed');
      await fs.rm(this.sessionDir(session.uploadId), { recursive: true, force: true });
    });
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
