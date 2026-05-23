import { Manga, Tag } from '@/generated/prisma/client';
import { MangaService } from '@/service/manga.service';
import { TagService } from '@/service/tag.service';
import { Request, Response } from 'express';

const mangaService = new MangaService();
const tagService = new TagService();

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

  async updateManga(req: Request<any, any, any, Manga>, res: Response) {
    const uuid: string = req.params.uuid;
    const { fullname, displayTitle, originalTitle }: Manga = req.body;
    const manga: Manga = await mangaService.updateManga(uuid, fullname, displayTitle, originalTitle);
    res.status(201).json(manga);
  }

  async createMangaTags(req: Request, res: Response) {
    const mangaUuid: string = req.params.uuid;
    const tagUuids: string[] = req.body;
    const payload = await mangaService.createMangaTags(mangaUuid, tagUuids);
    res.status(201).json(payload);
  }

  async getMangasByTagUuid(req: Request<any, any, any, PaginationQuery>, res: Response) {
    const tagUuid = req.params.uuid;
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 10);
    const { search, sortBy, sortOrder } = req.query;
    const [items, total] = await mangaService.getMangasByTagUuid(tagUuid, page - 1, limit, sortBy, sortOrder, search);
    res.json({ items, total, page, limit });
  }

  async getTagsByPage(req: Request<any, any, any, PaginationQuery>, res: Response) {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 10);
    const search = req.query.search;
    const sortBy = req.query.sortBy;
    const sortOrder = req.query.sortOrder;
    const [items, total] = await tagService.getTagsByPage(page-1, limit, sortBy, sortOrder, search);
    res.json({ items, total, page, limit });
  }

  async createTag(req: Request, res: Response) {
    const { name, type }: { name: string, type: string } = req.body;
    const tagType = await tagService.getTagTypeByName(type);
    if (!tagType) {
      res.status(400).json({ msg: 'Tag type not found' });
      return;
    }
    const tag: Tag = await tagService.createTag(name, tagType.uuid);
    res.status(201).json(tag);
  }

  async getTagTypesByPage(req: Request<any, any, any, PaginationQuery>, res: Response) {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 10);
    const [items, total] = await tagService.getTagTypesByPage(page-1, limit);
    res.json({ items, total, page, limit });
  }
}
