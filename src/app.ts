import prisma from '@/config/database';
import { PORT } from '@/config/env';
import fileRouter from '@/route/file.route';
import mangadbRouter from '@/route/mangadb.route';
import opdsRouter from '@/route/opds.route';
import cors from 'cors';
import express from 'express';
import path from 'path';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error(error);
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.use('/api/opds/v1.2', opdsRouter);
app.use('/api/file', fileRouter);
app.use('/api/mangadb', mangadbRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not Found' }));

const webDistPath = path.resolve(process.cwd(), 'web/dist');
app.use(express.static(webDistPath));
app.get('/{*path}', (_req, res) => res.sendFile(path.join(webDistPath, 'index.html')));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});

const shutdown = async () => {
  console.log('Server is shutting down...');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Database disconnected');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forcing shutdown...');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
