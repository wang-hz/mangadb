import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import prisma from '@/config/database';
import { readingProgressService as service } from './reading-progress.service';
import type { ProgressOperation } from '@/type/reading-progress';

// Run only against a disposable migrated database, never normal developer data.
it('atomically merges progress, isolates users and retains deletion tombstones', {
  skip: process.env.PROGRESS_INTEGRATION !== '1',
}, async () => {
  const userUuid = randomUUID();
  const otherUuid = randomUUID();
  const mangaUuid = randomUUID();
  await prisma.user.createMany({ data: [userUuid, otherUuid].map(uuid => ({ uuid, username: uuid, passwordHash: 'fixture' })) });
  await prisma.manga.create({ data: { uuid: mangaUuid, fullname: mangaUuid, displayTitle: 'Fixture', originalTitle: 'Fixture', pages: ['1.jpg', '2.jpg', '3.jpg'] } });
  const operation: ProgressOperation = {
    mangaUuid, pageIndex: 1, mode: 'paged', state: 'reading', hiddenFromRecent: false,
    deleted: false, updatedAt: '2026-01-01T00:00:00.000Z', operationId: randomUUID(),
  };
  try {
    const newer = { ...operation, pageIndex: 99, updatedAt: '2026-01-02T00:00:00.000Z', operationId: randomUUID() };
    await Promise.all([service.submit(userUuid, [newer]), service.submit(userUuid, [operation])]);
    assert.equal((await service.get(userUuid, mangaUuid))?.pageIndex, 2);
    assert.equal(await service.get(otherUuid, mangaUuid), null);
    await service.submit(userUuid, [newer]);
    assert.equal((await service.get(userUuid, mangaUuid))?.operationId, newer.operationId);
    const deletion = { ...newer, deleted: true, updatedAt: '2026-01-03T00:00:00.000Z', operationId: randomUUID() };
    await service.submit(userUuid, [deletion]);
    await service.submit(userUuid, [newer]);
    assert.equal((await service.get(userUuid, mangaUuid))?.deleted, true);
    assert.equal((await service.list(userUuid, 1)).items[0].deleted, true);
    const restart = { ...operation, pageIndex: 0, updatedAt: '2026-01-04T00:00:00.000Z', operationId: randomUUID() };
    await service.submit(userUuid, [restart]);
    assert.equal((await service.get(userUuid, mangaUuid))?.deleted, false);
    const low = { ...restart, operationId: '00000000-0000-4000-8000-000000000001' };
    const high = { ...restart, operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', hiddenFromRecent: true };
    await Promise.all([service.submit(userUuid, [high]), service.submit(userUuid, [low])]);
    assert.equal((await service.get(userUuid, mangaUuid))?.hiddenFromRecent, true);
    const missingUuid = randomUUID();
    assert.deepEqual((await service.submit(userUuid, [{ ...operation, mangaUuid: missingUuid }])).missing, [missingUuid]);
    await assert.rejects(service.submit(userUuid, [{ ...operation, updatedAt: '2099-01-01T00:00:00.000Z' }]), RangeError);
    await prisma.manga.delete({ where: { uuid: mangaUuid } });
    assert.equal(await service.get(userUuid, mangaUuid), null);
  } finally {
    await prisma.manga.deleteMany({ where: { uuid: mangaUuid } });
    await prisma.user.deleteMany({ where: { uuid: { in: [userUuid, otherUuid] } } });
    await prisma.$disconnect();
  }
});
