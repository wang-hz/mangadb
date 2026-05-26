import prisma from '@/config/database';
import type { PaginationQuery } from '@/type';

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

function buildWhere(search?: string) {
  if (!search) {
    return {};
  }
  return {
    OR: [
      { displayTitle: { contains: search, mode: 'insensitive' as const } },
      { originalTitle: { contains: search, mode: 'insensitive' as const } },
    ],
  };
}

function buildOrderBy(
  sortBy: PaginationQuery['sortBy'],
  sortOrder: PaginationQuery['sortOrder'],
) {
  return {
    [sortBy ?? 'createAt']: sortOrder ?? 'desc',
  } as const;
}

export class MangaService {
  async getMangaByUuid(uuid: string) {
    return prisma.manga.findUnique({
      where: { uuid },
      select: mangaSelect,
    });
  }

  async getMangasByPage(
    page: number,
    limit: number,
    sortBy: 'createAt' | 'updateAt' | 'publishDate' | undefined,
    sortOrder: 'asc' | 'desc' | undefined,
    search?: string,
  ) {
    const where = buildWhere(search);
    const orderBy = buildOrderBy(sortBy, sortOrder);
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

  async deleteMangaTag(mangaUuid: string, tagUuid: string) {
    return prisma.mangaTag.delete({
      where: { mangaUuid_tagUuid: { mangaUuid, tagUuid } },
    });
  }

  async getMangasByTagUuid(
    tagUuid: string,
    pageIndex: number,
    pageSize: number,
    sortBy?: 'createAt' | 'updateAt' | 'publishDate',
    sortOrder?: 'asc' | 'desc',
    search?: string,
  ) {
    const tagFilter = { mangaTags: { some: { tag: { uuid: tagUuid } } } };
    const where = search ? { AND: [tagFilter, buildWhere(search)] } : tagFilter;
    const orderBy = buildOrderBy(sortBy, sortOrder);
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
