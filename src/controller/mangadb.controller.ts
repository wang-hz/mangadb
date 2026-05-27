import { Prisma, Tag } from '@/generated/prisma/client';
import { mangaService } from '@/service/manga.service';
import { tagService } from '@/service/tag.service';
import { Request, Response } from 'express';
import type { PaginationQuery } from '@/type';
import { z } from 'zod';

const updateMangaSchema = z.object({
  fullname: z.string().optional(),
  displayTitle: z.string().optional(),
  originalTitle: z.string().optional(),
  cover: z.number().int().nonnegative().optional(),
  publishDate: z.string().nullable().optional(),
});

const createTagSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
});

const updateTagSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
});

const batchAddTagSchema = z.object({
  tagUuid: z.string().uuid(),
});

const batchSetDateSchema = z.object({
  publishDate: z.string().nullable().optional(),
});

function parsePositiveInt(value: string | undefined, defaultValue: number) {
  if (!value) {
    return defaultValue;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    return defaultValue;
  }
  return n;
}

export class MangadbController {
  async getMangasByPage(req: Request<any, any, any, PaginationQuery>, res: Response) {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 10);
    const search = req.query.search;
    const sortBy = req.query.sortBy;
    const sortOrder = req.query.sortOrder;
    const [items, total] = await mangaService.getMangasByPage(page-1, limit, sortBy, sortOrder, search);
    res.json({ items, total, page, limit });
  }

  async getMangaByUuid(req: Request, res: Response) {
    const uuid = req.params.uuid;
    const manga = await mangaService.getMangaByUuid(uuid);
    res.json(manga);
  }

  async updateManga(req: Request, res: Response) {
    const parsed = updateMangaSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { fullname, displayTitle, originalTitle, cover, publishDate } = parsed.data;
    const manga = await mangaService.updateManga(req.params.uuid, fullname, displayTitle, originalTitle, cover, publishDate);
    res.status(201).json(manga);
  }

  async createMangaTags(req: Request, res: Response) {
    const parsed = z.array(z.string().uuid()).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const payload = await mangaService.createMangaTags(req.params.uuid, parsed.data);
    res.status(201).json(payload);
  }

  async batchSetPublishDateByTag(req: Request, res: Response) {
    const parsed = batchSetDateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const result = await mangaService.batchSetPublishDateByTag(req.params.uuid, parsed.data.publishDate ?? null);
    res.json(result);
  }

  async batchAddTagToMangasByTag(req: Request, res: Response) {
    const parsed = batchAddTagSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const result = await mangaService.batchAddTagToMangasByTag(req.params.uuid, parsed.data.tagUuid);
    res.json(result);
  }

  async deleteMangaTag(req: Request, res: Response) {
    const mangaUuid: string = req.params.uuid;
    const tagUuid: string = req.params.tagUuid;
    await mangaService.deleteMangaTag(mangaUuid, tagUuid);
    res.sendStatus(204);
  }

  async getTagByUuid(req: Request, res: Response) {
    const tag = await tagService.getTagByUuid(req.params.uuid);
    if (!tag) { res.status(404).json({ msg: 'Not found' }); return; }
    res.json(tag);
  }

  async getMangasByTagUuid(req: Request<any, any, any, PaginationQuery>, res: Response) {
    const tagUuid = req.params.uuid;
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 10);
    const { search, sortBy, sortOrder } = req.query;
    const [items, total] = await mangaService.getMangasByTagUuid(tagUuid, page - 1, limit, sortBy, sortOrder, search);
    res.json({ items, total, page, limit });
  }

  async getTagsByPage(req: Request<any, any, any, PaginationQuery & { tagTypeName?: string }>, res: Response) {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 10);
    const { search, sortBy, sortOrder, tagTypeName } = req.query;
    const tagSortBy = sortBy === 'publishDate' ? undefined : sortBy;
    const [items, total] = await tagService.getTagsByPage(page-1, limit, tagSortBy, sortOrder, search, tagTypeName);
    res.json({ items, total, page, limit });
  }

  async createTag(req: Request, res: Response) {
    const parsed = createTagSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const tagType = await tagService.getTagTypeByName(parsed.data.type);
    if (!tagType) {
      res.status(400).json({ error: 'Tag type not found' });
      return;
    }
    const tag: Tag = await tagService.createTag(parsed.data.name, tagType.uuid);
    res.status(201).json(tag);
  }

  async updateTag(req: Request, res: Response) {
    const parsed = updateTagSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { name, type } = parsed.data;

    let tagTypeUuid: string | undefined;
    if (type !== undefined) {
      const tagType = await tagService.getTagTypeByName(type);
      if (!tagType) { res.status(400).json({ error: 'Tag type not found' }); return; }
      tagTypeUuid = tagType.uuid;
    }

    try {
      const tag = await tagService.updateTag(req.params.uuid, name, tagTypeUuid);
      res.json(tag);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') { res.status(409).json({ error: 'Tag name already exists' }); return; }
        if (e.code === 'P2025') { res.status(404).json({ error: 'Tag not found' }); return; }
      }
      throw e;
    }
  }

  async deleteTag(req: Request, res: Response) {
    try {
      await tagService.deleteTag(req.params.uuid);
      res.sendStatus(204);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        res.status(404).json({ error: 'Tag not found' }); return;
      }
      throw e;
    }
  }

  async getTagTypesByPage(req: Request<any, any, any, PaginationQuery>, res: Response) {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 10);
    const [items, total] = await tagService.getTagTypesByPage(page-1, limit);
    res.json({ items, total, page, limit });
  }
}
