import prisma from '@/config/database';
import { CORS_ORIGIN, PORT } from '@/config/env';
import { logger } from '@/logger';
import { requireAuth, requireBasicOrBearer } from '@/middleware/auth';
import authRouter from '@/route/auth.route';
import fileRouter from '@/route/file.route';
import mangadbRouter from '@/route/mangadb.route';
import opdsRouter from '@/route/opds.route';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';

const app = express();

app.set('trust proxy', 1);
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // Ant Design (CSS-in-JS) requires unsafe-inline for dynamic styles
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({ status: 'error' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/opds/v1.2', requireBasicOrBearer, opdsRouter);
app.use('/api/file', requireBasicOrBearer, fileRouter);
app.use('/api/mangadb', requireAuth, mangadbRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not Found' }));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

const webDistPath = path.resolve(process.cwd(), 'web/dist');
app.use(express.static(webDistPath));
app.get('/{*path}', (_req, res) => res.sendFile(path.join(webDistPath, 'index.html')));

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server is running on port ${PORT}`);
});

const shutdown = async () => {
  logger.info('Server is shutting down...');
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Database disconnected');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forcing shutdown...');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
