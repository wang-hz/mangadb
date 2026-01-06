import { DATA_DIR } from '@/config/env';
import { MangaService } from '@/service/manga.service';

import archiver from 'archiver';
import { Request, Response } from 'express';
import fs from 'fs';
import mime from 'mime-types';
import path from 'path';

const mangaService = new MangaService();

export class FileController {
  async getZip(req: Request, res: Response) {
    const mangaUuid = req.params.mangaUuid;
    if (!mangaUuid) {
      return res.sendStatus(400);
    }
    const manga = await mangaService.getMangaByUuid(mangaUuid);
    if (!manga) {
      return res.sendStatus(404);
    }
    const mangaPath = path.join(DATA_DIR, mangaUuid);
    if (!fs.existsSync(mangaPath)) {
      return res.sendStatus(404);
    }
    res.setHeader('Content-Type', 'application/vnd.comicbook+zip');
    res.setHeader('Content-Disposition', `attachment; filename=${mangaUuid}.cbz`);
    const archive = archiver('zip', { zlib: { level: 0 } });
    archive.on('error', err => {
      throw err;
    });
    archive.pipe(res);
    const pages = manga.pages as string[];
    for (const imgFilename of pages) {
      archive.file(path.join(mangaPath, imgFilename), { name: imgFilename });
    }
    await archive.finalize();
  }

  async getImg(req: Request, res: Response) {
    const mangaUuid = req.params.mangaUuid;
    const pageNumber = req.params.pageNumber;
    if (!mangaUuid || !pageNumber) {
      return res.sendStatus(400);
    }
    const pageIndex = parseInt(pageNumber);
    const manga = await mangaService.getMangaByUuid(mangaUuid);
    if (!manga) {
      return res.sendStatus(404);
    }
    const pages = manga.pages as string[];
    const imgFilename = pages[pageIndex];
    if (!imgFilename) {
      return res.sendStatus(404);
    }
    const imgPath = path.join(DATA_DIR, mangaUuid, imgFilename);
    const mimeType = mime.lookup(imgPath) || 'image/jpeg';
    res.setHeader('Content-Type', mimeType);
    fs.createReadStream(imgPath).pipe(res);
  }
}
