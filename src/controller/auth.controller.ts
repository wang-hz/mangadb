import prisma from '@/config/database';
import { JWT_EXPIRES_IN, JWT_SECRET } from '@/config/env';
import { loginLogService } from '@/service/loginLog.service';
import { userService } from '@/service/user.service';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
});

const createUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(['admin', 'user']).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8),
});

export class AuthController {
  async setupStatus(_req: Request, res: Response) {
    const count = await userService.count();
    res.json({ needsSetup: count === 0 });
  }

  async setup(req: Request, res: Response) {
    const count = await userService.count();
    if (count > 0) {
      res.status(400).json({ error: 'Already set up' });
      return;
    }
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { username, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userService.create(username, passwordHash, 'admin');
    res.status(201).json(user);
  }

  async login(req: Request, res: Response) {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { username, password } = parsed.data;
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim())
      ?? (req.headers['x-real-ip'] as string | undefined)
      ?? req.ip
      ?? 'unknown';
    const userAgent = (req.headers['user-agent'] ?? '').slice(0, 512);
    const user = await userService.findByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      loginLogService.create({ username, ip, userAgent, success: false }).catch(() => {});
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    loginLogService.create({ userUuid: user.uuid, username, ip, userAgent, success: true }).catch(() => {});
    const token = jwt.sign(
      { sub: user.username, uuid: user.uuid, role: user.role, jti: randomUUID() },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions,
    );
    res.cookie('token', token, { httpOnly: true, sameSite: 'strict' });
    res.json({ token });
  }

  async getLoginLogs(req: Request, res: Response) {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const username = typeof req.query.username === 'string' && req.query.username ? req.query.username : undefined;
    const success = req.query.success === 'true' ? true : req.query.success === 'false' ? false : undefined;
    const result = await loginLogService.list({ page, limit, username, success });
    res.json(result);
  }

  async getUsers(_req: Request, res: Response) {
    const users = await userService.list();
    res.json(users);
  }

  async createUser(req: Request, res: Response) {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { username, password, role } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userService.create(username, passwordHash, role ?? 'user');
    res.status(201).json(user);
  }

  async deleteUser(req: Request, res: Response) {
    const target = await userService.findByUuid(req.params.uuid);
    if (!target) { res.status(404).json({ error: 'User not found' }); return; }
    if (target.role === 'admin' && await userService.countAdmins() <= 1) {
      res.status(400).json({ error: 'Cannot delete the last admin account' });
      return;
    }
    await userService.delete(req.params.uuid);
    res.sendStatus(204);
  }

  async logout(req: Request, res: Response) {
    const authHeader = req.headers.authorization ?? '';
    const rawToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : req.cookies?.token;

    if (rawToken) {
      try {
        const payload = jwt.verify(rawToken, JWT_SECRET) as { jti?: string; exp?: number };
        if (payload.jti && payload.exp) {
          await prisma.tokenBlacklist.upsert({
            where: { jti: payload.jti },
            update: {},
            create: { jti: payload.jti, expiresAt: new Date(payload.exp * 1000) },
          });
          // lazily remove already-expired entries to keep the table small
          prisma.tokenBlacklist.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
        }
      } catch {
        // expired or invalid token — still clear the cookie
      }
    }

    res.clearCookie('token', { httpOnly: true, sameSite: 'strict' });
    res.sendStatus(204);
  }

  async changePassword(req: Request, res: Response) {
    const { uuid } = req.params;
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { currentPassword, newPassword } = parsed.data;

    const payload = req.user!;

    const target = await userService.findFullByUuid(uuid);
    if (!target) { res.status(404).json({ error: 'User not found' }); return; }

    const isSelf = payload.uuid === uuid;
    const isAdmin = payload.role === 'admin';

    if (!isSelf && !isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (isSelf) {
      if (!currentPassword) {
        res.status(400).json({ error: 'currentPassword required' });
        return;
      }
      const valid = await bcrypt.compare(currentPassword, target.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await userService.updatePassword(uuid, hash);
    res.sendStatus(204);
  }
}