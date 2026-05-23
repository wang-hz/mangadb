import prisma from '@/config/database';

const mangaSelect = {
  uuid: true,
  fullname: true,
  displayTitle: true,
  originalTitle: true,
  publishDate: true,
  pages: true,
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
      { displayTitle: { contains: search, mode: 'insensitive' } },
      { originalTitle: { contains: search, mode: 'insensitive' } },
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

  async updateManga(uuid: string, fullname?: string, displayTitle?: string, originalTitle?: string) {
    return prisma.manga.update({
      where: { uuid },
      data: {
        fullname, displayTitle, originalTitle,
        updateAt: new Date(),
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

  async getMangasByTagUuid(tagUuid: string, pageIndex: number, pageSize: number) {
    const where = { mangaTags: { some: { tag: { uuid: tagUuid } } } };
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

  async getLatestMangaByTagUuid(tagUuid: string) {
    const mangas = await prisma.manga.findMany({
      where: { mangaTags: { some: { tag: { uuid: tagUuid } } } },
      orderBy: [
        { updateAt: 'desc' },
        { originalTitle: 'desc' },
        { pid: 'desc' },
      ],
      take: 1,
    });
    if (mangas.length === 0) {
      return null;
    }
    return mangas[0];
  }

  async getMangasByKeyword(keyword: string) {
    return prisma.manga.findMany({
      include: { mangaTags: { include: { tag: { include: { tagType: true } } } } },
      where: {
        OR: [{
          displayTitle: {
            contains: keyword,
            mode: 'insensitive',
          },
        },
        {
          originalTitle: {
            contains: keyword,
            mode: 'insensitive',
          },
        }],
      },
      orderBy: [
        { updateAt: 'desc' },
        { originalTitle: 'desc' },
      ],
    });
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
