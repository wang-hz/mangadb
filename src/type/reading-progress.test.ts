import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { progressBatchSchema, progressListSchema } from './reading-progress';

const operation = {
  mangaUuid: '00000000-0000-4000-8000-000000000001',
  operationId: '00000000-0000-4000-8000-000000000002',
  pageIndex: 0, mode: 'paged', state: 'reading', hiddenFromRecent: false,
  deleted: false, updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('reading progress requests', () => {
  it('accepts deletions and explicit restart operations', () => {
    assert.ok(progressBatchSchema.safeParse({ operations: [{ ...operation, deleted: true }] }).success);
    assert.ok(progressBatchSchema.safeParse({ operations: [operation] }).success);
  });
  it('rejects identity injection, fractional/negative positions, invalid dates and unbounded batches', () => {
    for (const invalid of [{ userUuid: operation.mangaUuid }, { pageIndex: -1 }, { pageIndex: 1.5 },
      { updatedAt: 'invalid' }, { state: 'unread' }, { mode: 'flip' }]) {
      assert.equal(progressBatchSchema.safeParse({ operations: [{ ...operation, ...invalid }] }).success, false);
    }
    assert.equal(progressBatchSchema.safeParse({ operations: Array(101).fill(operation) }).success, false);
  });
  it('validates and bounds pagination', () => {
    assert.equal(progressListSchema.parse({}).limit, 100);
    assert.equal(progressListSchema.safeParse({ limit: 0 }).success, false);
    assert.equal(progressListSchema.safeParse({ after: 'invalid' }).success, false);
  });
});
