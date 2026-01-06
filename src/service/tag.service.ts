import prisma from '@/config/database';

export class TagService {
  async getTagsByType(tagType: string, pageIndex: number, pageSize: number) {
    const where = { tagType: { name: tagType } };
    return prisma.$transaction([
      prisma.tag.findMany({
        include: { tagType: { select: { name: true } } },
        where,
        orderBy: [
          { updateAt: 'desc' },
          { pid: 'desc' },
        ],
        skip: pageIndex * pageSize,
        take: pageSize,
      }),
      prisma.tag.count({ where }),
    ]);
  }

  async getTagByUuid(uuid: string) {
    return prisma.tag.findUnique({ where: { uuid } });
  }

  async getTagsByKeyword(keyword: string) {
    return prisma.tag.findMany({
      include: { tagType: { select: { name: true } } },
      where: {
        name: {
          contains: keyword,
          mode: 'insensitive',
        }
      },
    });
  }

  async getAllTagTypes() {
    return prisma.tagType.findMany();
  }
}
