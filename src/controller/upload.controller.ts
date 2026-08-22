import crypto from 'crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { UploadSessionService, type UploadFileManifest, type UploadMetadata, type UploadMode } from '@/service/upload-session.service';

const uploadService = new UploadSessionService();

const metadataSchema = z.object({
  fullname: z.string().min(1),
  displayTitle: z.string().min(1),
  originalTitle: z.string().min(1),
  publishDate: z.string().optional(),
  tagUuids: z.array(z.string().uuid()).default([]),
  pendingTags: z.array(z.object({ name: z.string(), tagTypeName: z.string() })).default([]),
});

const createSchema = z.object({
  mode: z.enum(['zip', 'images']),
  metadata: metadataSchema,
  expectedFileCount: z.number().int().positive(),
  totalBytes: z.number().int().positive(),
  manifestSha256: z.string().regex(/^[0-9a-f]{64}$/i),
});

function userUuid(req: Request): string {
  if (!req.user?.uuid) throw new Error('Unauthorized');
  return req.user.uuid;
}

function statusFor(error: unknown): number {
  const message = error instanceof Error ? error.message : '';
  if (message === 'Upload not found') return 404;
  if (message.includes('already exists') || message.includes('already complete') || message.includes('missing chunks') || message.includes('not accepting') || message.includes('not ready')) return 409;
  if (message.includes('hash mismatch')) return 422;
  if (message === 'Unauthorized') return 401;
  return 400;
}

function respondError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Upload request failed';
  res.status(statusFor(error)).json({ error: message });
}

export class UploadController {
  async list(req: Request, res: Response) {
    try {
      const sessions = await uploadService.listSessions(userUuid(req));
      res.json(sessions);
    } catch (error) { respondError(res, error); }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = createSchema.parse(req.body);
      const session = await uploadService.createSession({
        ownerUuid: userUuid(req),
        mangaUuid: crypto.randomUUID(),
        mode: parsed.mode as UploadMode,
        metadata: parsed.metadata as UploadMetadata,
        expectedFileCount: parsed.expectedFileCount,
        totalBytes: parsed.totalBytes,
        manifestSha256: parsed.manifestSha256,
      });
      res.status(201).json({ uploadId: session.uploadId, mangaUuid: session.mangaUuid, chunkSize: session.chunkSize, expiresAt: session.expiresAt, state: session.state });
    } catch (error) { respondError(res, error); }
  }

  async manifestBatch(req: Request, res: Response) {
    try {
      const files = z.array(z.object({
        index: z.number().int().nonnegative(),
        clientKey: z.string().min(1),
        name: z.string().min(1),
        relativePath: z.string().optional(),
        size: z.number().int().nonnegative(),
        lastModified: z.number().int().nonnegative(),
      })).max(1000).parse(req.body) as UploadFileManifest[];
      await uploadService.saveManifestBatch(req.params.uploadId, userUuid(req), Number(req.params.batchIndex), files);
      res.status(204).end();
    } catch (error) { respondError(res, error); }
  }

  async manifestComplete(req: Request, res: Response) {
    try {
      const session = await uploadService.completeManifest(req.params.uploadId, userUuid(req));
      res.json({ uploadId: session.uploadId, state: session.state, files: session.files.map(file => ({ index: file.index, chunkCount: file.chunkCount })) });
    } catch (error) { respondError(res, error); }
  }

  async status(req: Request, res: Response) {
    try {
      const includeHashes = req.query.includeHashes === '1';
      const result = await uploadService.getReceived(req.params.uploadId, userUuid(req), includeHashes);
      res.json({ ...result.session, files: result.files });
    } catch (error) { respondError(res, error); }
  }

  async chunk(req: Request, res: Response) {
    try {
      if (!Buffer.isBuffer(req.body)) throw new Error('Expected application/octet-stream body');
      const result = await uploadService.writeChunk({
        uploadId: req.params.uploadId,
        ownerUuid: userUuid(req),
        fileIndex: Number(req.params.fileIndex),
        chunkIndex: Number(req.params.chunkIndex),
        body: req.body,
        sha256: req.get('X-Chunk-SHA256') ?? '',
      });
      res.status(result.duplicate ? 204 : 201).end();
    } catch (error) { respondError(res, error); }
  }

  async complete(req: Request, res: Response) {
    try {
      const session = await uploadService.queue(req.params.uploadId, userUuid(req));
      res.status(session.state === 'completed' ? 200 : 202).json(session);
    } catch (error) { respondError(res, error); }
  }

  async remove(req: Request, res: Response) {
    try {
      await uploadService.remove(req.params.uploadId, userUuid(req));
      res.status(204).end();
    } catch (error) { respondError(res, error); }
  }
}

export const uploadController = new UploadController();
