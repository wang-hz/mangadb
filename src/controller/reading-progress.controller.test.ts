import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from '@/config/database';
import { JWT_SECRET } from '@/config/env';
import { requireAuth } from '@/middleware/auth';
import router from '@/route/mangadb.route';

it('authenticates progress routes and rejects stale browser identities', {
  skip: process.env.PROGRESS_INTEGRATION !== '1',
}, async () => {
  const userUuid = randomUUID();
  const otherUuid = randomUUID();
  const mangaUuid = randomUUID();
  await prisma.user.createMany({ data: [userUuid, otherUuid].map(uuid => ({ uuid, username: uuid, passwordHash: 'fixture' })) });
  await prisma.manga.create({ data: { uuid: mangaUuid, fullname: mangaUuid, displayTitle: 'Fixture', originalTitle: 'Fixture', pages: ['1.jpg', '2.jpg'] } });
  const app = express();
  app.use(express.json());
  app.use('/api/mangadb', requireAuth, router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/mangadb/reading-progress`;
  const token = (uuid: string) => jwt.sign({ sub: uuid, uuid, role: 'user', jti: randomUUID() }, JWT_SECRET, { expiresIn: '1h' });
  const headers = { Authorization: `Bearer ${token(userUuid)}`, 'X-MangaDB-User': userUuid, 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { headers: { ...headers, 'X-MangaDB-User': otherUuid } })).status, 403);
    assert.equal((await fetch(base, { headers, method: 'POST', body: JSON.stringify({ operations: [{ userUuid: otherUuid }] }) })).status, 400);
    const operation = { mangaUuid, pageIndex: 1, mode: 'scroll', state: 'completed', deleted: false, hiddenFromRecent: false, updatedAt: new Date().toISOString(), operationId: randomUUID() };
    const posted = await fetch(base, { headers, method: 'POST', body: JSON.stringify({ operations: [operation] }) });
    assert.equal(posted.status, 200);
    const list = await fetch(`${base}?limit=1`, { headers });
    assert.equal(list.headers.get('cache-control'), 'no-store');
    assert.match(list.headers.get('vary') ?? '', /X-MangaDB-User/i);
    assert.equal((await list.json()).items[0].mangaUuid, mangaUuid);
    const other = await fetch(`${base}/${mangaUuid}`, { headers: { Authorization: `Bearer ${token(otherUuid)}` } });
    assert.equal((await other.json()).item, null);
    assert.equal((await fetch(`${base}/invalid`, { headers })).status, 400);
    assert.equal((await fetch(`${base}?limit=101`, { headers })).status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await prisma.manga.deleteMany({ where: { uuid: mangaUuid } });
    await prisma.user.deleteMany({ where: { uuid: { in: [userUuid, otherUuid] } } });
    await prisma.$disconnect();
  }
});
