import prisma from '@/config/database';
import { JWT_EXPIRES_IN, JWT_SECRET } from '@/config/env';
import { UserService } from '@/service/user.service';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const userService = new UserService();

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
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'username and password required' });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userService.create(username, passwordHash, 'admin');
    res.status(201).json(user);
  }

  async login(req: Request, res: Response) {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'username and password required' });
      return;
    }
    const user = await userService.findByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const token = jwt.sign(
      { sub: user.username, uuid: user.uuid, role: user.role, jti: randomUUID() },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions,
    );
    res.cookie('token', token, { httpOnly: true, sameSite: 'strict' });
    res.json({ token });
  }

  async getUsers(_req: Request, res: Response) {
    const users = await userService.list();
    res.json(users);
  }

  async createUser(req: Request, res: Response) {
    const { username, password, role } = req.body as { username?: string; password?: string; role?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'username and password required' });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userService.create(username, passwordHash, role === 'admin' ? 'admin' : 'user');
    res.status(201).json(user);
  }

  async deleteUser(req: Request, res: Response) {
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
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'newPassword must be at least 8 characters' });
      return;
    }

    const payload = jwt.verify(
      (req.headers.authorization ?? '').slice(7),
      JWT_SECRET,
    ) as { sub: string; uuid: string; role: string };

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