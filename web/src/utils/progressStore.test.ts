import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import { WebProgressStore } from '../progress/store';
import type { RemoteProgress } from '../../../mobile/src/sync/protocol';

const manga = { uuid: randomUUID(), displayTitle: 'Fixture', originalTitle: 'Fixture', cover: 0, publishDate: null, createAt: '2026-01-01T00:00:00.000Z', updateAt: '2026-01-01T00:00:00.000Z' };

it('persists offline positions and pending operations across store recreation', async () => {
  const identity = randomUUID();
  await new WebProgressStore(identity).write(manga, 10, { pageIndex: 4, mode: 'scroll' });
  const restored = new WebProgressStore(identity);
  assert.equal((await restored.read()).records[manga.uuid].pageIndex, 4);
  assert.equal((await restored.pending())[0].pageIndex, 4);
  assert.deepEqual(await new WebProgressStore(randomUUID()).pending(), []);
});

it('serializes simultaneous tab edits and retains the edit made during an upload', async () => {
  const identity = randomUUID();
  const first = new WebProgressStore(identity);
  const second = new WebProgressStore(identity);
  await Promise.all([
    first.write(manga, 10, { pageIndex: 2 }),
    second.write(manga, 10, { pageIndex: 6 }),
  ]);
  assert.equal((await first.read()).records[manga.uuid].pageIndex, 6);
  const sent = await first.pending();
  await second.write(manga, 10, { pageIndex: 8 });
  await first.apply([{ ...sent[0], manga, pageCount: 10 }], sent);
  assert.equal((await first.pending())[0].pageIndex, 8);
  assert.equal((await first.read()).records[manga.uuid].pageIndex, 8);
});

it('applies newer deletion tombstones and explicit rereads without resurrecting old progress', async () => {
  const store = new WebProgressStore(randomUUID());
  await store.write(manga, 10, { pageIndex: 9, state: 'completed' });
  const sent = await store.pending();
  const deleted: RemoteProgress = { ...sent[0], manga, pageCount: 10, deleted: true, updatedAt: '2099-01-01T00:00:00.000Z' };
  await store.apply([deleted], sent);
  await store.apply([{ ...sent[0], manga, pageCount: 10 }]);
  assert.equal((await store.read()).records[manga.uuid].deleted, true);
  assert.equal((await store.pending()).length, 0);
  await store.write(manga, 10, { pageIndex: 0, state: 'reading' });
  assert.equal((await store.read()).records[manga.uuid].deleted, false);
  assert.equal((await store.read()).records[manga.uuid].pageIndex, 0);
});

it('removes missing-manga operations only if their acknowledgement still matches', async () => {
  const store = new WebProgressStore(randomUUID());
  await store.write(manga, 10, { pageIndex: 4 });
  const sent = await store.pending();
  await store.write(manga, 10, { pageIndex: 5 });
  await store.apply([], sent, [manga.uuid]);
  assert.equal((await store.pending())[0].pageIndex, 5);
  await store.apply([], await store.pending(), [manga.uuid]);
  assert.equal((await store.pending()).length, 0);
});
