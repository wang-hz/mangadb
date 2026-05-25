import { JWT_EXPIRES_IN, JWT_SECRET } from '@/config/env';
import { UserService } from '@/service/user.service';
import bcrypt from 'bcryptjs';
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
      { sub: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions,
    );
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
}