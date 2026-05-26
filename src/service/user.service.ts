import prisma from '@/config/database';

const userSelect = {
  uuid: true,
  username: true,
  role: true,
  createAt: true,
} as const;

export class UserService {
  async count() {
    return prisma.user.count();
  }

  async findByUsername(username: string) {
    return prisma.user.findUnique({ where: { username } });
  }

  async findByUuid(uuid: string) {
    return prisma.user.findUnique({ where: { uuid }, select: userSelect });
  }

  async create(username: string, passwordHash: string, role: string) {
    return prisma.user.create({
      data: { username, passwordHash, role },
      select: userSelect,
    });
  }

  async list() {
    return prisma.user.findMany({ select: userSelect, orderBy: { createAt: 'asc' } });
  }

  async findFullByUuid(uuid: string) {
    return prisma.user.findUnique({ where: { uuid } });
  }

  async updatePassword(uuid: string, passwordHash: string) {
    return prisma.user.update({ where: { uuid }, data: { passwordHash } });
  }

  async countAdmins() {
    return prisma.user.count({ where: { role: 'admin' } });
  }

  async delete(uuid: string) {
    return prisma.user.delete({ where: { uuid } });
  }
}