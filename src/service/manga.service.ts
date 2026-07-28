import prisma from '@/config/database';
import type { MangaListView, MangaSortBy, SortOrder } from '@/type';
import type { Prisma } from '@/generated/prisma/client';
import { DATA_DIR } from '@/config/env';
import fs from 'fs';
import path from 'path';

const mangaSelect = {
  uuid: true,
  fullname: true,
  displayTitle: true,
  originalTitle: true,
  publishDate: true,
  pages: true,
  cover: true,
  createAt: true,
  updateAt: true,
  mangaTags: {
    select: {
      tag: {
        select: {
          uuid: true,
          name: true,
          tagType: {
            select: {
              uuid: true,
              name: true,
            },
          },
        },
      },
    },
  },
};

const mangaSummarySelect = {
  uuid: true,
  displayTitle: true,
  originalTitle: true,
  publishDate: true,
  cover: true,
  createAt: true,
  updateAt: true,
};

type MangaDetail = Prisma.MangaGetPayload<{ select: typeof mangaSelect }>;
type MangaSummary = Prisma.MangaGetPayload<{ select: typeof mangaSummarySelect }>;

interface MangaFilters {
  tagUuids?: string[];
  publishYearFrom?: number;
  publishYearTo?: number;
}

function buildWhere(search?: string, filters: MangaFilters = {}): Prisma.MangaWhereInput {
  const AND: Prisma.MangaWhereInput[] = [];
  if (search) {
    AND.push({ OR: [
      { displayTitle: { contains: search, mode: 'insensitive' as const } },
      { originalTitle: { contains: search, mode: 'insensitive' as const } },
    ] });
  }
  for (const tagUuid of new Set(filters.tagUuids ?? [])) {
    AND.push({ mangaTags: { some: { tagUuid } } });
  }
  if (filters.publishYearFrom !== undefined || filters.publishYearTo !== undefined) {
    AND.push({
      publishDate: {
        ...(filters.publishYearFrom !== undefined
          ? { gte: new Date(Date.UTC(filters.publishYearFrom, 0, 1)) }
          : {}),
        ...(filters.publishYearTo !== undefined
          ? { lt: new Date(Date.UTC(filters.publishYearTo + 1, 0, 1)) }
          : {}),
      },
    });
  }
  return AND.length > 0 ? { AND } : {};
}

function buildOrderBy(
  sortBy: MangaSortBy,
  sortOrder: SortOrder,
): Prisma.MangaOrderByWithRelationInput[] {
  return [
    { [sortBy]: sortOrder },
    { pid: sortOrder },
  ];
}

export class MangaService {
  async getMangaByUuid(uuid: string) {
    return prisma.manga.findUnique({
      where: { uuid },
      select: mangaSelect,
    });
  }

  async getMangaPagesByUuid(uuid: string): Promise<string[] | null> {
    const manga = await prisma.manga.findUnique({
      where: { uuid },
      select: { pages: true },
    });
    if (!manga || !Array.isArray(manga.pages) || !manga.pages.every(page => typeof page === 'string')) {
      return null;
    }
    return manga.pages;
  }

  async getMangasByPage(
    page: number,
    limit: number,
    sortBy: MangaSortBy,
    sortOrder: SortOrder,
    search: string | undefined,
    view: 'summary',
    filters?: MangaFilters,
  ): Promise<[MangaSummary[], number]>;
  async getMangasByPage(
    page: number,
    limit: number,
    sortBy: MangaSortBy,
    sortOrder: SortOrder,
    search?: string,
    view?: 'full',
    filters?: MangaFilters,
  ): Promise<[MangaDetail[], number]>;
  async getMangasByPage(
    page: number,
    limit: number,
    sortBy: MangaSortBy,
    sortOrder: SortOrder,
    search?: string,
    view: MangaListView = 'full',
    filters: MangaFilters = {},
  ) {
    const where = buildWhere(search, filters);
    const orderBy = buildOrderBy(sortBy, sortOrder);
    if (view === 'summary') {
      return prisma.$transaction([
        prisma.manga.findMany({
          select: mangaSummarySelect,
          where,
          orderBy,
          skip: page * limit,
          take: limit,
        }),
        prisma.manga.count({ where }),
      ]);
    }
    return prisma.$transaction([
      prisma.manga.findMany({
        select: mangaSelect,
        where,
        orderBy,
        skip: page * limit,
        take: limit,
      }),
      prisma.manga.count({ where }),
    ]);
  }

  async updateManga(uuid: string, fullname?: string, displayTitle?: string, originalTitle?: string, cover?: number | null, publishDate?: string | null) {
    return prisma.manga.update({
      where: { uuid },
      data: {
        fullname, displayTitle, originalTitle,
        ...(cover !== undefined ? { cover } : {}),
        ...(publishDate !== undefined ? { publishDate: publishDate ? new Date(publishDate) : null } : {}),
      },
    });
  }

  async createMangaTags(mangaUuid: string, tagUuids: string[]) {
    return prisma.mangaTag.createMany({
      data: tagUuids.map(tagUuid => {
        return { mangaUuid, tagUuid };
      }),
    });
  }

  async batchSetPublishDateByTag(tagUuid: string, publishDate: string | null) {
    const mangaTags = await prisma.mangaTag.findMany({
      where: { tagUuid },
      select: { mangaUuid: true },
    });
    const mangaUuids = mangaTags.map(mt => mt.mangaUuid);
    if (mangaUuids.length === 0) return { updated: 0 };
    const result = await prisma.manga.updateMany({
      where: { uuid: { in: mangaUuids } },
      data: { publishDate: publishDate ? new Date(publishDate) : null },
    });
    return { updated: result.count };
  }

  async batchAddTagToMangasByTag(sourceTagUuid: string, targetTagUuid: string) {
    const mangaTags = await prisma.mangaTag.findMany({
      where: { tagUuid: sourceTagUuid },
      select: { mangaUuid: true },
    });
    const mangaUuids = mangaTags.map(mt => mt.mangaUuid);
    if (mangaUuids.length === 0) return { added: 0 };
    const existing = await prisma.mangaTag.findMany({
      where: { tagUuid: targetTagUuid, mangaUuid: { in: mangaUuids } },
      select: { mangaUuid: true },
    });
    const existingUuids = new Set(existing.map(e => e.mangaUuid));
    const toAdd = mangaUuids.filter(uuid => !existingUuids.has(uuid));
    if (toAdd.length === 0) return { added: 0 };
    await prisma.mangaTag.createMany({
      data: toAdd.map(mangaUuid => ({ mangaUuid, tagUuid: targetTagUuid })),
    });
    return { added: toAdd.length };
  }

  async getMangaFolderFiles(uuid: string): Promise<string[]> {
    const mangaDir = path.join(DATA_DIR, uuid);
    try {
      const entries = await fs.promises.readdir(mangaDir);
      return entries
        .filter(f => /\.(jpe?g|png|webp|gif|avif)$/i.test(f))
        .sort();
    } catch {
      return [];
    }
  }

  async updateMangaPages(uuid: string, pages: string[], cover: number) {
    const mangaDir = path.join(DATA_DIR, uuid);
    for (const filename of pages) {
      const resolved = path.resolve(mangaDir, filename);
      if (!resolved.startsWith(mangaDir + path.sep)) {
        throw new Error('Invalid filename');
      }
    }
    return prisma.manga.update({
      where: { uuid },
      data: { pages, cover },
    });
  }

  async deleteMangaTag(mangaUuid: string, tagUuid: string) {
    return prisma.mangaTag.delete({
      where: { mangaUuid_tagUuid: { mangaUuid, tagUuid } },
    });
  }

  async getMangasByTagUuid(
    tagUuid: string,
    pageIndex: number,
    pageSize: number,
    sortBy: MangaSortBy,
    sortOrder: SortOrder,
    search: string | undefined,
    view: 'summary',
  ): Promise<[MangaSummary[], number]>;
  async getMangasByTagUuid(
    tagUuid: string,
    pageIndex: number,
    pageSize: number,
    sortBy?: MangaSortBy,
    sortOrder?: SortOrder,
    search?: string,
    view?: 'full',
  ): Promise<[MangaDetail[], number]>;
  async getMangasByTagUuid(
    tagUuid: string,
    pageIndex: number,
    pageSize: number,
    sortBy: MangaSortBy = 'createAt',
    sortOrder: SortOrder = 'desc',
    search?: string,
    view: MangaListView = 'full',
  ) {
    const tagFilter = { mangaTags: { some: { tag: { uuid: tagUuid } } } };
    const where = search ? { AND: [tagFilter, buildWhere(search)] } : tagFilter;
    const orderBy = buildOrderBy(sortBy, sortOrder);
    if (view === 'summary') {
      return prisma.$transaction([
        prisma.manga.findMany({
          select: mangaSummarySelect,
          where,
          orderBy,
          skip: pageIndex * pageSize,
          take: pageSize,
        }),
        prisma.manga.count({ where }),
      ]);
    }
    return prisma.$transaction([
      prisma.manga.findMany({
        select: mangaSelect,
        where,
        orderBy,
        skip: pageIndex * pageSize,
        take: pageSize,
      }),
      prisma.manga.count({ where }),
    ]);
  }

  async getLatestMangasByTagUuids(tagUuids: string[]) {
    if (tagUuids.length === 0) return new Map();
    const rows = await prisma.mangaTag.findMany({
      where: { tagUuid: { in: tagUuids } },
      include: { manga: true },
      orderBy: [
        { manga: { updateAt: 'desc' } },
        { manga: { originalTitle: 'desc' } },
        { manga: { pid: 'desc' } },
      ],
    });
    const result = new Map<string, (typeof rows)[number]['manga']>();
    for (const row of rows) {
      if (!result.has(row.tagUuid)) {
        result.set(row.tagUuid, row.manga);
      }
    }
    return result;
  }

  async getLatestMangas(pageIndex: number, pageSize: number) {
    const oneWeekAgo = new Date();
    oneWeekAgo.setHours(oneWeekAgo.getHours() - 24 * 7);
    const where = { createAt: { gte: oneWeekAgo } };
    return prisma.$transaction([
      prisma.manga.findMany({
        include: { mangaTags: { include: { tag: { include: { tagType: true } } } } },
        where,
        orderBy: [
          { updateAt: 'desc' },
          { originalTitle: 'desc' },
          { pid: 'desc' },
        ],
        skip: pageIndex * pageSize,
        take: pageSize,
      }),
      prisma.manga.count({ where }),
    ]);
  }
}

export const mangaService = new MangaService();
