import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mangaListQuerySchema,
  paginationQuerySchema,
  tagListQuerySchema,
} from './pagination';

describe('pagination query schemas', () => {
  it('applies stable defaults when list parameters are omitted', () => {
    assert.deepEqual(mangaListQuerySchema.parse({}), {
      page: 1,
      limit: 10,
      sortBy: 'createAt',
      sortOrder: 'desc',
      view: 'full',
    });
  });

  it('accepts the mobile summary view and valid manga sorting', () => {
    assert.deepEqual(mangaListQuerySchema.parse({
      page: '2',
      limit: '20',
      sortBy: 'publishDate',
      sortOrder: 'asc',
      view: 'summary',
    }), {
      page: 2,
      limit: 20,
      sortBy: 'publishDate',
      sortOrder: 'asc',
      view: 'summary',
    });
  });

  it('rejects malformed and excessive pagination values', () => {
    assert.equal(mangaListQuerySchema.safeParse({ page: '0' }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({ page: '1.5' }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({ limit: '101' }).success, false);
    assert.equal(paginationQuerySchema.safeParse({ limit: 'not-a-number' }).success, false);
  });

  it('rejects unsupported sort and view values', () => {
    assert.equal(mangaListQuerySchema.safeParse({ sortBy: 'title' }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({ sortOrder: 'sideways' }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({ view: 'compact' }).success, false);
    assert.equal(tagListQuerySchema.safeParse({ sortBy: 'publishDate' }).success, false);
  });
});
