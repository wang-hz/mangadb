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

  it('normalizes combined manga tag and publication-year filters', () => {
    const firstTag = '7f16ec5b-344a-49ad-9258-ef25e3b65599';
    const secondTag = 'e013541e-8f7b-49d8-a819-07ed867f04a7';
    assert.deepEqual(mangaListQuerySchema.parse({
      tagUuids: `${firstTag}, ${secondTag}`,
      publishYearFrom: '1990',
      publishYearTo: '2026',
    }), {
      page: 1,
      limit: 10,
      sortBy: 'createAt',
      sortOrder: 'desc',
      view: 'full',
      tagUuids: [firstTag, secondTag],
      publishYearFrom: 1990,
      publishYearTo: 2026,
    });
  });

  it('rejects malformed and excessive pagination values', () => {
    assert.equal(mangaListQuerySchema.safeParse({ page: '0' }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({ page: '1.5' }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({ page: '1e2' }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({ page: '0x10' }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({ page: '' }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({ page: ['1'] }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({ page: '1000001' }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({ limit: '101' }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({ publishYearFrom: '99' }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({
      publishYearFrom: '2026',
      publishYearTo: '2020',
    }).success, false);
    assert.equal(paginationQuerySchema.safeParse({ limit: 'not-a-number' }).success, false);
  });

  it('rejects unsupported sort and view values', () => {
    assert.equal(mangaListQuerySchema.safeParse({ sortBy: 'title' }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({ sortOrder: 'sideways' }).success, false);
    assert.equal(mangaListQuerySchema.safeParse({ view: 'compact' }).success, false);
    assert.equal(tagListQuerySchema.safeParse({ sortBy: 'publishDate' }).success, false);
  });
});
