import crypto from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import unzipper from 'unzipper';
import { Prisma } from '@/generated/prisma/client';
import prisma from '@/config/database';
import { DATA_DIR } from '@/config/env';
import { IMPORT_MAX_EXTRACTED_SIZE, IMPORT_MAX_PAGE_COUNT } from '@/service/import.constants';
import type { UploadSession } from '@/service/upload-session.service';

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;
const MAX_STORED_FILENAME_BYTES = 255;

function naturalSort(files: string[]): string[] {
  return [...files].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  );
}

function fitFilename(name: string, suffix = ''): string {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  const tail = `${suffix}${ext}`;
  const baseBudget = MAX_STORED_FILENAME_BYTES - Buffer.byteLength(tail, 'utf8');
  let fittedBase = '';
  let fittedBytes = 0;
  for (const character of base) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (fittedBytes + characterBytes > baseBudget) break;
    fittedBase += character;
    fittedBytes += characterBytes;
  }
  return `${fittedBase}${tail}`;
}

export function sanitizeFilename(name: string): string {
  const safeName = path.basename(name).replace(/[^\w.\-()\[\] ]/gu, '_');
  return fitFilename(safeName);
}

export function deduplicateNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map(name => {
    let count = 0;
    let candidate = fitFilename(name);
    while (used.has(candidate)) {
      count += 1;
      candidate = fitFilename(name, `_${count}`);
    }
    used.add(candidate);
    return candidate;
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
  async importFromUploadSession(session: UploadSession, sessionDir: string): Promise<ImportResult> {
    const destDir = path.join(DATA_DIR, session.mangaUuid);
    const preparedDir = path.join(sessionDir, 'prepared');
    const sourceDir = path.join(sessionDir, 'files');

    await fsPromises.rm(preparedDir, { recursive: true, force: true });
    await fsPromises.mkdir(preparedDir, { recursive: true });
    let pages: string[];

    if (session.mode === 'zip') {
      const sourcePath = path.join(sourceDir, '0.data');
      const directory = await unzipper.Open.file(sourcePath);
      const imageEntries = directory.files.filter(
        entry => entry.type !== 'Directory' && IMAGE_EXT.test(path.basename(entry.path)),
      );
      if (imageEntries.length === 0) throw new Error('No image files found in archive');
      if (imageEntries.length > IMPORT_MAX_PAGE_COUNT) throw new Error(`Archive exceeds ${IMPORT_MAX_PAGE_COUNT} pages`);
      const declaredSize = imageEntries.reduce((sum, entry) => sum + Number(entry.uncompressedSize ?? 0), 0);
      if (declaredSize > IMPORT_MAX_EXTRACTED_SIZE) throw new Error('Archive exceeds the 20 GiB extracted size limit');

      const safeNames = deduplicateNames(imageEntries.map(entry => sanitizeFilename(entry.path)));
      let extractedSize = 0;
      for (let i = 0; i < imageEntries.length; i++) {
        const limiter = new Transform({
          transform(chunk, _encoding, callback) {
            extractedSize += chunk.length;
            if (extractedSize > IMPORT_MAX_EXTRACTED_SIZE) callback(new Error('Archive exceeds the 20 GiB extracted size limit'));
            else callback(null, chunk);
          },
        });
        await pipeline(imageEntries[i].stream(), limiter, fs.createWriteStream(path.join(preparedDir, safeNames[i])));
      }
      pages = naturalSort(safeNames);
    } else {
      if (session.files.length > IMPORT_MAX_PAGE_COUNT) throw new Error(`Import exceeds ${IMPORT_MAX_PAGE_COUNT} pages`);
      const safeNames = deduplicateNames(session.files.map(file => sanitizeFilename(file.name)));
      for (let i = 0; i < session.files.length; i++) {
        const sourcePath = path.join(sourceDir, `${session.files[i].index}.data`);
        const destPath = path.join(preparedDir, safeNames[i]);
        try {
          await fsPromises.link(sourcePath, destPath);
        } catch (error: any) {
          if (error.code !== 'EXDEV') throw error;
          await fsPromises.copyFile(sourcePath, destPath);
        }
      }
      pages = naturalSort(safeNames);
    }

    await fsPromises.rm(destDir, { recursive: true, force: true });
    await fsPromises.rename(preparedDir, destDir);
    try {
      const result = await this.createMangaAndTags(
        session.mangaUuid,
        session.metadata.fullname,
        session.metadata.displayTitle,
        session.metadata.originalTitle,
        session.metadata.publishDate,
        pages,
        session.metadata.tagUuids,
        session.metadata.pendingTags,
      );
      return result;
    } catch (error) {
      await fsPromises.rm(destDir, { recursive: true, force: true });
      throw error;
    }
  }

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
      if (imageEntries.length > IMPORT_MAX_PAGE_COUNT) {
        throw new Error(`Archive exceeds ${IMPORT_MAX_PAGE_COUNT} pages`);
      }
      const declaredSize = imageEntries.reduce(
        (sum, entry) => sum + Number(entry.uncompressedSize ?? 0),
        0,
      );
      if (declaredSize > IMPORT_MAX_EXTRACTED_SIZE) {
        throw new Error('Archive exceeds the 20 GiB extracted size limit');
      }

      const rawNames = imageEntries.map(e => sanitizeFilename(e.path));
      const safeNames = deduplicateNames(rawNames);

      let extractedSize = 0;
      for (let i = 0; i < imageEntries.length; i++) {
        const destPath = path.join(tempExtractDir, safeNames[i]);
        const limiter = new Transform({
          transform(chunk, _encoding, callback) {
            extractedSize += chunk.length;
            if (extractedSize > IMPORT_MAX_EXTRACTED_SIZE) {
              callback(new Error('Archive exceeds the 20 GiB extracted size limit'));
            } else {
              callback(null, chunk);
            }
          },
        });
        await pipeline(imageEntries[i].stream(), limiter, fs.createWriteStream(destPath));
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

      return this.createMangaAndTags(
        uuid, fullname, displayTitle, originalTitle, publishDate, sortedNames,
        tagUuids, pendingTags,
      );
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
    if (validFiles.length > IMPORT_MAX_PAGE_COUNT) {
      throw new Error(`Import exceeds ${IMPORT_MAX_PAGE_COUNT} pages`);
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
      return this.createMangaAndTags(
        uuid, fullname, displayTitle, originalTitle, publishDate,
        files.map(f => f.name), tagUuids, pendingTags,
      );
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

  private async createMangaAndTags(
    uuid: string,
    fullname: string,
    displayTitle: string,
    originalTitle: string,
    publishDate: string | undefined,
    pages: string[],
    tagUuids: string[],
    pendingTags: PendingTagInput[],
  ): Promise<ImportResult> {
    let candidate = fullname;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await prisma.$transaction(async tx => {
          await tx.manga.create({
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
          const pendingUuids = await this.resolveOrCreateTags(pendingTags, tx);
          await tx.mangaTag.createMany({
            data: [...tagUuids, ...pendingUuids].map(tagUuid => ({ mangaUuid: uuid, tagUuid })),
            skipDuplicates: true,
          });
        });
        return { uuid, displayTitle, pageCount: pages.length };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 4) {
          candidate = `${fullname}_${attempt + 2}`;
          continue;
        }
        throw error;
      }
    }
    throw new Error('Could not create manga record: fullname conflict after 5 attempts');
  }

  private async resolveOrCreateTags(
    pendingTags: PendingTagInput[],
    db: Pick<Prisma.TransactionClient, 'tag' | 'tagType'> = prisma,
  ): Promise<string[]> {
    const uuids: string[] = [];
    for (const { name, tagTypeName } of pendingTags) {
      const trimName = name.trim();
      const trimType = tagTypeName.trim();
      if (!trimName || !trimType) continue;

      let tag = await db.tag.findUnique({ where: { name: trimName } });
      if (!tag) {
        let tagType = await db.tagType.findFirst({
          where: { name: { equals: trimType, mode: 'insensitive' } },
        });
        if (!tagType) tagType = await db.tagType.upsert({
          where: { name: trimType },
          create: { name: trimType },
          update: {},
        });
        if (!tagType) continue;
        if (!tag) tag = await db.tag.upsert({
          where: { name: trimName },
          create: { name: trimName, tagTypeUuid: tagType.uuid },
          update: {},
        });
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
