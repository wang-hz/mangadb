import type { Request, Response } from 'express';
import fsPromises from 'fs/promises';
import { z } from 'zod';
import { importService } from '@/service/import.service';
import { IMPORT_MAX_TOTAL_SIZE } from '@/service/import.constants';

const uploadSchema = z.object({
  mode: z.enum(['zip', 'images']),
  fullname: z.string().min(1),
  displayTitle: z.string().min(1),
  originalTitle: z.string().min(1),
  publishDate: z.string().optional(),
  tagUuids: z.preprocess(
    v => (v == null ? [] : Array.isArray(v) ? v : [v]),
    z.array(z.string().uuid()),
  ).optional().default([]),
  pendingTags: z.preprocess(
    v => { try { return v ? JSON.parse(v as string) : [] } catch { return [] } },
    z.array(z.object({ name: z.string(), tagTypeName: z.string() })),
  ).optional().default([]),
});

type MulterFiles = Record<string, Express.Multer.File[]>;

export class ImportController {
  async upload(req: Request, res: Response) {
    const files = req.files as MulterFiles;
    const uploadedPaths = Object.values(files ?? {}).flat().map(file => file.path);

    try {
      const parsed = uploadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

      const { mode, fullname, displayTitle, originalTitle, publishDate, tagUuids, pendingTags } = parsed.data;
      const totalSize = Object.values(files ?? {}).flat().reduce((sum, file) => sum + file.size, 0);
      if (totalSize > IMPORT_MAX_TOTAL_SIZE) {
        res.status(400).json({ error: 'Import exceeds the 10 GiB total limit' });
        return;
      }

      if (mode === 'zip') {
        const file = files?.file?.[0];
        if (!file) {
          res.status(400).json({ error: 'No file uploaded' });
          return;
        }
        const result = await importService.importFromZip(
          file.path, fullname, displayTitle, originalTitle, publishDate, tagUuids, pendingTags,
        );
        res.json(result);
      } else {
        const imageFiles = files?.files ?? [];
        if (imageFiles.length === 0) {
          res.status(400).json({ error: 'No files uploaded' });
          return;
        }
        const result = await importService.importFromImages(
          imageFiles.map(f => ({ tempPath: f.path, originalname: f.originalname })),
          fullname, displayTitle, originalTitle, publishDate, tagUuids, pendingTags,
        );
        res.json(result);
      }
    } finally {
      await Promise.all(uploadedPaths.map(filePath => fsPromises.rm(filePath, { force: true })));
    }
  }
}
