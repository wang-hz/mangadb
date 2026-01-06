import prisma from '@/config/database';

export class MangaService {
  async getMangaByUuid(uuid: string) {
    return prisma.manga.findUnique({ where: { uuid } });
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
