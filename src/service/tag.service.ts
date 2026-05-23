import prisma from '@/config/database';

const tagSelect = {
  uuid: true,
  name: true,
  createAt: true,
  updateAt: true,
  tagType: {
    select: {
      uuid: true,
      name: true,
    },
  },
};

const tagTypeSelect = {
  uuid: true,
  name: true,
  createAt: true,
  updateAt: true,
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
  async getTagsByType(tagType: string, page: number, limit: number) {
    const where = { tagType: { name: tagType } };
    return prisma.$transaction([
      prisma.tag.findMany({
        include: { tagType: { select: { name: true } } },
        where,
        orderBy: [
          { updateAt: 'desc' },
          { pid: 'desc' },
        ],
        skip: page * limit,
        take: limit,
      }),
      prisma.tag.count({ where }),
    ]);
  }

  async getTagByUuid(uuid: string) {
    return prisma.tag.findUnique({ select: tagSelect, where: { uuid } });
  }

  async getTagsByKeyword(keyword: string) {
    return prisma.tag.findMany({
      select: tagSelect,
      where: {
        name: {
          contains: keyword,
          mode: 'insensitive',
        }
      },
    });
  }

  async getTagsByPage(
    page: number,
    limit: number,
    sortBy: 'createAt' | 'updateAt' | undefined,
    sortOrder: 'asc' | 'desc' | undefined,
    search?: string,
    tagTypeName?: string,
  ) {
    const where = {
      ...buildWhere(search),
      ...(tagTypeName ? { tagType: { name: tagTypeName } } : {}),
    };
    const orderBy = buildOrderBy(sortBy, sortOrder);
    return prisma.$transaction([
      prisma.tag.findMany({
        select: tagSelect,
        where,
        orderBy,
        skip: page * limit,
        take: limit,
      }),
      prisma.tag.count({ where }),
    ]);
  }

  async createTag(name: string, tagTypeUuid: string) {
    return prisma.tag.create({ data: { name, tagTypeUuid } });
  }

  async getTagTypesByPage(page: number, limit: number) {
    return prisma.$transaction([
      prisma.tagType.findMany({
        select: tagTypeSelect,
        skip: page * limit,
        take: limit,
      }),
      prisma.tagType.count(),
    ]);
  }

  async getAllTagTypes() {
    return prisma.tagType.findMany({ select: tagTypeSelect });
  }

  async getTagTypeByName(name: string) {
    return prisma.tagType.findUnique({
      select: tagTypeSelect,
      where: { name },
    });
  }
}
