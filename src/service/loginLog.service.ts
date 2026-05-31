import prisma from '@/config/database';

export const loginLogService = {
  create(data: { userUuid?: string; username: string; ip: string; userAgent: string; success: boolean }) {
    return prisma.loginLog.create({ data });
  },

  async list(params: { page: number; limit: number; username?: string; success?: boolean }) {
    const where = {
      ...(params.username ? { username: { contains: params.username, mode: 'insensitive' as const } } : {}),
      ...(params.success !== undefined ? { success: params.success } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.loginLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.loginLog.count({ where }),
    ]);
    return { items, total, page: params.page, limit: params.limit };
  },
};