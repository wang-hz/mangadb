import assert from 'node:assert/strict';
import { it } from 'node:test';
import { clampReaderPage, resolveReaderPosition, visibleReaderPage } from '../progress/reader';

it('restores saved positions while honoring explicit URL overrides and unread tombstones', () => {
  const saved = { pageIndex: 7, mode: 'scroll' as const };
  assert.deepEqual(resolveReaderPosition(new URLSearchParams(), saved, 10), { page: 7, mode: 'scroll' });
  assert.deepEqual(resolveReaderPosition(new URLSearchParams('page=1&mode=flip'), saved, 10), { page: 1, mode: 'flip' });
  assert.deepEqual(resolveReaderPosition(new URLSearchParams(), { ...saved, deleted: true }, 10), { page: 0, mode: 'flip' });
  assert.equal(clampReaderPage(99, 5), 4);
  assert.equal(clampReaderPage(NaN, 5), 0);
  assert.equal(clampReaderPage(0, 0), 0);
});

it('tracks the visible scrolling page under the toolbar rather than URL state', () => {
  const bounds = [{ top: -900, bottom: 100 }, { top: 100, bottom: 1100 }, { top: 1100, bottom: 2100 }];
  assert.equal(visibleReaderPage(bounds, 800), 1);
  assert.equal(visibleReaderPage([], 800), null);
});
