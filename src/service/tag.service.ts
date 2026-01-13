import prisma from '@/config/database';

const tagSelect = {
  uuid: true,
  name: true,
  createAt: true,
  updateAt: true,
  tagType: {
    select: {
      name: true,
    },
  },
}

function buildWhere(search?: string) {
  if (!search) {
    return {};
  }
  return { name: { contains: search, mode: 'insensitive' } };
}

function buildOrderBy(
  sortBy: PaginationQuery['sortBy'],
  sortOrder: PaginationQuery['sortOrder'],
) {
  return {
    [sortBy ?? 'createAt']: sortOrder ?? 'desc',
  } as const;
}

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

  async getTagsByPage(
    pageIndex: number,
    pageSize: number,
    sortBy: 'createAt' | 'updateAt' | undefined,
    sortOrder: 'asc' | 'desc' | undefined,
    search?: string,
  ) {
    const where = buildWhere(search);
    const orderBy = buildOrderBy(sortBy, sortOrder);
    return prisma.$transaction([
      prisma.tag.count({ where }),
      prisma.tag.findMany({
        select: tagSelect,
        where,
        orderBy,
        skip: pageIndex * pageSize,
        take: pageSize,
      }),
    ]);
  }

  async getTagTypesByPage(pageIndex: number, pageSize: number) {
    return prisma.$transaction([
      prisma.tag.count(),
      prisma.tag.findMany({
        skip: pageIndex * pageSize,
        take: pageSize,
      }),
    ]);
  }
}
