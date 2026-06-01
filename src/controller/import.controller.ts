import type { Request, Response } from 'express';
import { z } from 'zod';
import { importService } from '@/service/import.service';

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
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { mode, fullname, displayTitle, originalTitle, publishDate, tagUuids, pendingTags } = parsed.data;
    const files = req.files as MulterFiles;

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
  }
}