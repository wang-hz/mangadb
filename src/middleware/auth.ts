import { JWT_SECRET } from '@/config/env';
import { UserService } from '@/service/user.service';
import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const userService = new UserService();

function verifyBearer(authHeader: string): { sub: string; role: string } | null {
  if (!authHeader.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(authHeader.slice(7), JWT_SECRET) as { sub: string; role: string };
  } catch {
    return null;
  }
}

async function verifyBasic(authHeader: string): Promise<boolean> {
  if (!authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const colonIdx = decoded.indexOf(':');
  if (colonIdx === -1) return false;
  const username = decoded.slice(0, colonIdx);
  const password = decoded.slice(colonIdx + 1);
  const user = await userService.findByUsername(username);
  if (!user) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (verifyBearer(req.headers.authorization ?? '')) { next(); return; }
  res.status(401).json({ error: 'Unauthorized' });
}

export async function requireBasicOrBearer(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization ?? '';
  if (verifyBearer(auth)) { next(); return; }
  if (await verifyBasic(auth)) { next(); return; }
  res.set('WWW-Authenticate', 'Basic realm="MangaDB"');
  res.status(401).json({ error: 'Unauthorized' });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const payload = verifyBearer(req.headers.authorization ?? '');
  if (!payload) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (payload.role !== 'admin') { res.status(403).json({ error: 'Forbidden' }); return; }
  next();
}