import type { Request, Response } from 'express';
import { z } from 'zod';
import { progressBatchSchema, progressListSchema } from '@/type/reading-progress';
import { readingProgressService } from '@/service/reading-progress.service';

export const readingProgressController = {
  async list(req: Request, res: Response) {
    const parsed = progressListSchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    res.json(await readingProgressService.list(req.user!.uuid, parsed.data.limit, parsed.data.after));
  },
  async get(req: Request, res: Response) {
    const parsed = z.string().uuid().safeParse(req.params.uuid);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid manga UUID' }); return; }
    res.json({ item: await readingProgressService.get(req.user!.uuid, parsed.data), serverTime: new Date().toISOString() });
  },
  async submit(req: Request, res: Response) {
    const parsed = progressBatchSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    try {
      res.json(await readingProgressService.submit(req.user!.uuid, parsed.data.operations));
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      res.status(409).json({ error: error.message, serverTime: new Date().toISOString() });
    }
  },
};
