import { AUTH_PASSWORD_HASH, AUTH_USERNAME, JWT_EXPIRES_IN, JWT_SECRET } from '@/config/env';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export class AuthController {
  async login(req: Request, res: Response) {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'username and password required' });
      return;
    }
    if (username !== AUTH_USERNAME) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const valid = await bcrypt.compare(password, AUTH_PASSWORD_HASH);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const token = jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
    res.json({ token });
  }
}