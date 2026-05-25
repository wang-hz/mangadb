import { AUTH_PASSWORD_HASH, AUTH_USERNAME, JWT_SECRET } from '@/config/env';
import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

function verifyBearer(authHeader: string): boolean {
  if (!authHeader.startsWith('Bearer ')) return false;
  try {
    jwt.verify(authHeader.slice(7), JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

async function verifyBasic(authHeader: string): Promise<boolean> {
  if (!authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const colonIdx = decoded.indexOf(':');
  if (colonIdx === -1) return false;
  const username = decoded.slice(0, colonIdx);
  const password = decoded.slice(colonIdx + 1);
  if (username !== AUTH_USERNAME) return false;
  return bcrypt.compare(password, AUTH_PASSWORD_HASH);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization ?? '';
  if (verifyBearer(auth)) { next(); return; }
  res.status(401).json({ error: 'Unauthorized' });
}

export async function requireBasicOrBearer(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization ?? '';
  if (verifyBearer(auth)) { next(); return; }
  if (await verifyBasic(auth)) { next(); return; }
  res.set('WWW-Authenticate', 'Basic realm="MangaDB"');
  res.status(401).json({ error: 'Unauthorized' });
}