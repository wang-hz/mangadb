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
    const pageSize = parsePositiveInt(req.query.pageSize, 10);
    const search = req.query.search;
    const sortBy = req.query.sortBy;
    const sortOrder = req.query.sortOrder;
    const [count, data] = await mangaService.getMangasByPage(page - 1, pageSize, sortBy, sortOrder, search);
    res.json({ count, data });
  }

  async getTagsByPage(req: Request<any, any, any, PaginationQuery>, res: Response) {
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 10);
    const search = req.query.search;
    const sortBy = req.query.sortBy;
    const sortOrder = req.query.sortOrder;
    const [count, data] = await tagService.getTagsByPage(page - 1, pageSize, sortBy, sortOrder, search);
    res.json({ count, data });
  }

  async getTagTypesByPage(req: Request<any, any, any, PaginationQuery>, res: Response) {
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 10);
    const [count, data] = await tagService.getTagTypesByPage(page - 1, pageSize);
    res.json({ count, data });
  }
}
