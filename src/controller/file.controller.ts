import { DATA_DIR } from '@/config/env';
import { mangaService } from '@/service/manga.service';
import archiver from 'archiver';
import { Request, Response } from 'express';
import fs from 'fs';
import mime from 'mime-types';
import path from 'path';
import sharp from 'sharp';

const THUMB_WIDTH = 300;
const THUMB_DIR = path.join(DATA_DIR, '.thumbs');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function safeJoin(base: string, filename: string): string | null {
  const resolved = path.resolve(base, filename);
  return resolved.startsWith(base + path.sep) ? resolved : null;
};

async function serveImageFile(req: Request, res: Response, imgPath: string): Promise<void> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(imgPath);
  } catch (err: any) {
    res.sendStatus(err.code === 'ENOENT' ? 404 : 500);
    return;
  }

  const etag = `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', stat.mtime.toUTCString());
  res.setHeader('Cache-Control', 'private, max-age=86400');

  if (req.headers['if-none-match'] === etag) {
    res.sendStatus(304);
    return;
  }

  const mimeType = mime.lookup(imgPath) || 'image/jpeg';
  res.setHeader('Content-Type', mimeType);
  const stream = fs.createReadStream(imgPath);
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (!res.headersSent) res.sendStatus(err.code === 'ENOENT' ? 404 : 500);
  });
  stream.pipe(res);
}

async function serveThumbnail(req: Request, res: Response, imgPath: string, cacheKey: string): Promise<void> {
  const thumbPath = path.join(THUMB_DIR, `${cacheKey}.webp`);

  // Serve from cache if it exists and is newer than the source
  try {
    const [srcStat, thumbStat] = await Promise.all([
      fs.promises.stat(imgPath),
      fs.promises.stat(thumbPath),
    ]);
    if (thumbStat.mtimeMs >= srcStat.mtimeMs) {
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('Content-Type', 'image/webp');
      const stream = fs.createReadStream(thumbPath);
      stream.on('error', () => { if (!res.headersSent) res.sendStatus(500) });
      stream.pipe(res);
      return;
    }
  } catch {
    // Cache miss — generate below
  }

  await fs.promises.mkdir(path.join(THUMB_DIR, path.dirname(cacheKey)), { recursive: true });

  const data = await sharp(imgPath)
    .resize(THUMB_WIDTH, undefined, { withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  await fs.promises.writeFile(thumbPath, data);

  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('Content-Type', 'image/webp');
  res.send(data);
}

export class FileController {
  async getZip(req: Request, res: Response) {
    const mangaUuid = req.params.mangaUuid;
    if (!mangaUuid || !UUID_RE.test(mangaUuid)) {
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
      console.error('Archive error:', err);
      if (!res.headersSent) res.sendStatus(500);
    });
    archive.pipe(res);
    const pages = manga.pages as string[] | null;
    if (!Array.isArray(pages)) {
      return res.sendStatus(404);
    }
    for (const imgFilename of pages) {
      const imgPath = safeJoin(mangaPath, imgFilename);
      if (!imgPath) continue;
      archive.file(imgPath, { name: imgFilename });
    }
    await archive.finalize();
  }

  async getImgByFilename(req: Request, res: Response) {
    const { mangaUuid, filename } = req.params;
    if (!mangaUuid || !UUID_RE.test(mangaUuid) || !filename) {
      return res.sendStatus(400);
    }
    const manga = await mangaService.getMangaByUuid(mangaUuid);
    if (!manga) return res.sendStatus(404);
    const mangaPath = path.join(DATA_DIR, mangaUuid);
    const imgPath = safeJoin(mangaPath, filename);
    if (!imgPath) return res.sendStatus(400);
    await serveImageFile(req, res, imgPath);
  }

  async getImg(req: Request, res: Response) {
    const mangaUuid = req.params.mangaUuid;
    const pageNumber = req.params.pageNumber;
    if (!mangaUuid || !UUID_RE.test(mangaUuid) || !pageNumber) {
      return res.sendStatus(400);
    }
    const pageIndex = parseInt(pageNumber);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      return res.sendStatus(400);
    }
    const manga = await mangaService.getMangaByUuid(mangaUuid);
    if (!manga) {
      return res.sendStatus(404);
    }
    const pages = manga.pages as string[] | null;
    if (!Array.isArray(pages)) {
      return res.sendStatus(404);
    }
    const imgFilename = pages[pageIndex];
    if (!imgFilename) {
      return res.sendStatus(404);
    }
    const mangaPath = path.join(DATA_DIR, mangaUuid);
    const imgPath = safeJoin(mangaPath, imgFilename);
    if (!imgPath) return res.sendStatus(400);

    if (req.query.thumb === '1') {
      await serveThumbnail(req, res, imgPath, `${mangaUuid}/${pageIndex}`);
      return;
    }
    await serveImageFile(req, res, imgPath);
  }
}