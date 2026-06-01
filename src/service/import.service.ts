import crypto from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import unzipper from 'unzipper';
import { Prisma } from '@/generated/prisma/client';
import prisma from '@/config/database';
import { DATA_DIR } from '@/config/env';

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

function naturalSort(files: string[]): string[] {
  return [...files].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  );
}

function sanitizeFilename(name: string): string {
  return path.basename(name).replace(/[^\w.\-()\[\] ]/g, '_');
}

function deduplicateNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map(name => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    return `${base}_${count}${ext}`;
  });
}

async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await fsPromises.rename(src, dest);
  } catch (e: any) {
    if (e.code === 'EXDEV') {
      await fsPromises.copyFile(src, dest);
      await fsPromises.rm(src, { force: true });
    } else {
      throw e;
    }
  }
}

export interface PendingTagInput {
  name: string;
  tagTypeName: string;
}

export interface ImportResult {
  uuid: string;
  displayTitle: string;
  pageCount: number;
}

export class ImportService {
  async importFromZip(
    tempFilePath: string,
    fullname: string,
    displayTitle: string,
    originalTitle: string,
    publishDate?: string,
    tagUuids: string[] = [],
    pendingTags: PendingTagInput[] = [],
  ): Promise<ImportResult> {
    const uuid = crypto.randomUUID();
    const destDir = path.join(DATA_DIR, uuid);
    const tempExtractDir = path.join(os.tmpdir(), `mangadb-extract-${uuid}`);

    try {
      await fsPromises.mkdir(tempExtractDir, { recursive: true });

      const directory = await unzipper.Open.file(tempFilePath);
      const imageEntries = directory.files.filter(
        entry => entry.type !== 'Directory' && IMAGE_EXT.test(path.basename(entry.path)),
      );

      if (imageEntries.length === 0) {
        throw new Error('No image files found in archive');
      }

      const rawNames = imageEntries.map(e => sanitizeFilename(e.path));
      const safeNames = deduplicateNames(rawNames);

      for (let i = 0; i < imageEntries.length; i++) {
        const destPath = path.join(tempExtractDir, safeNames[i]);
        await pipeline(imageEntries[i].stream(), fs.createWriteStream(destPath));
      }

      const entries = imageEntries.map((_, i) => ({ name: safeNames[i] }));
      entries.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
      );
      const sortedNames = entries.map(e => e.name);

      await fsPromises.mkdir(destDir, { recursive: true });
      for (const name of sortedNames) {
        await moveFile(path.join(tempExtractDir, name), path.join(destDir, name));
      }

      const result = await this.createMangaRecord(uuid, fullname, displayTitle, originalTitle, publishDate, sortedNames);
      const pendingUuids = await this.resolveOrCreateTags(pendingTags);
      await this.createMangaTags(uuid, [...tagUuids, ...pendingUuids]);
      return result;
    } catch (e) {
      await fsPromises.rm(destDir, { recursive: true, force: true });
      throw e;
    } finally {
      await fsPromises.rm(tempFilePath, { force: true });
      await fsPromises.rm(tempExtractDir, { recursive: true, force: true });
    }
  }

  async importFromImages(
    uploadedFiles: Array<{ tempPath: string; originalname: string }>,
    fullname: string,
    displayTitle: string,
    originalTitle: string,
    publishDate?: string,
    tagUuids: string[] = [],
    pendingTags: PendingTagInput[] = [],
  ): Promise<ImportResult> {
    const uuid = crypto.randomUUID();
    const destDir = path.join(DATA_DIR, uuid);
    const allTempPaths = uploadedFiles.map(f => f.tempPath);

    const validFiles = uploadedFiles.filter(f => IMAGE_EXT.test(f.originalname));
    if (validFiles.length === 0) {
      throw new Error('No valid image files');
    }

    const rawNames = validFiles.map(f => sanitizeFilename(f.originalname));
    const safeNames = deduplicateNames(rawNames);
    const files = validFiles.map((f, i) => ({ tempPath: f.tempPath, name: safeNames[i] }));
    files.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    );

    try {
      await fsPromises.mkdir(destDir, { recursive: true });
      for (const { tempPath, name } of files) {
        await moveFile(tempPath, path.join(destDir, name));
      }
      const result = await this.createMangaRecord(
        uuid, fullname, displayTitle, originalTitle, publishDate,
        files.map(f => f.name),
      );
      const pendingUuids = await this.resolveOrCreateTags(pendingTags);
      await this.createMangaTags(uuid, [...tagUuids, ...pendingUuids]);
      return result;
    } catch (e) {
      await fsPromises.rm(destDir, { recursive: true, force: true });
      throw e;
    } finally {
      for (const tempPath of allTempPaths) {
        await fsPromises.rm(tempPath, { force: true });
      }
    }
  }

  private async createMangaRecord(
    uuid: string,
    fullname: string,
    displayTitle: string,
    originalTitle: string,
    publishDate: string | undefined,
    pages: string[],
  ): Promise<ImportResult> {
    let candidate = fullname;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await prisma.manga.create({
          data: {
            uuid,
            fullname: candidate,
            displayTitle,
            originalTitle,
            publishDate: publishDate ? new Date(publishDate) : null,
            pages,
            cover: 0,
          },
        });
        return { uuid, displayTitle, pageCount: pages.length };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 4) {
          candidate = `${fullname}_${attempt + 2}`;
          continue;
        }
        throw e;
      }
    }
    throw new Error('Could not create manga record: fullname conflict after 5 attempts');
  }

  private async resolveOrCreateTags(pendingTags: PendingTagInput[]): Promise<string[]> {
    const uuids: string[] = [];
    for (const { name, tagTypeName } of pendingTags) {
      const trimName = name.trim();
      const trimType = tagTypeName.trim();
      if (!trimName || !trimType) continue;

      let tag = await prisma.tag.findUnique({ where: { name: trimName } });
      if (!tag) {
        const tagType = await prisma.tagType.findFirst({
          where: { name: { equals: trimType, mode: 'insensitive' } },
        });
        if (!tagType) continue;
        try {
          tag = await prisma.tag.create({ data: { name: trimName, tagTypeUuid: tagType.uuid } });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            tag = await prisma.tag.findUnique({ where: { name: trimName } });
          } else {
            throw e;
          }
        }
      }
      if (tag) uuids.push(tag.uuid);
    }
    return uuids;
  }

  private async createMangaTags(mangaUuid: string, tagUuids: string[]): Promise<void> {
    if (tagUuids.length === 0) return;
    await prisma.mangaTag.createMany({
      data: tagUuids.map(tagUuid => ({ mangaUuid, tagUuid })),
      skipDuplicates: true,
    });
  }
}

export const importService = new ImportService();