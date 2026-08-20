import {
  normalizeMangaDetail,
  normalizeMangaSummary,
  normalizePageResult,
  normalizeTag,
  normalizeTagType,
} from './validation'
import { ApiError } from './client'

const date = '2026-08-20T00:00:00.000Z'

describe('API response validation', () => {
  it('normalizes valid entities without retaining mutable server objects', () => {
    const summary = mangaSummary()
    const detail = {
      ...summary,
      fullname: '/manga/one',
      pages: ['one.jpg'],
      mangaTags: [{
        tag: { uuid: 'tag-1', name: '科幻', tagType: { uuid: 'type-1', name: '题材' } },
      }],
    }
    const normalized = normalizeMangaDetail(detail)
    expect(normalized).toEqual(detail)
    expect(normalized.pages).not.toBe(detail.pages)

    expect(normalizeTag({
      uuid: 'tag-1',
      name: '科幻',
      createAt: date,
      updateAt: date,
      tagType: { uuid: 'type-1', name: '题材' },
    })).toMatchObject({ uuid: 'tag-1' })
    expect(normalizeTagType({
      uuid: 'type-1', name: '题材', createAt: date, updateAt: date,
    })).toMatchObject({ uuid: 'type-1' })
  })

  it.each([
    {},
    { ...mangaSummary(), cover: -1 },
    { ...mangaSummary(), updateAt: 'not-a-date' },
  ])('rejects malformed manga summaries', payload => {
    expect(() => normalizeMangaSummary(payload)).toThrow(expect.objectContaining({ status: 502 }))
  })

  it.each([
    {},
    { items: null, total: 0, page: 1, limit: 24 },
    { items: [], total: -1, page: 1, limit: 24 },
    { items: [], total: 0, page: 0, limit: 24 },
    { items: [], total: 0, page: 1, limit: 1001 },
  ])('rejects malformed page envelopes', payload => {
    expect(() => normalizePageResult(payload, normalizeMangaSummary, '漫画'))
      .toThrow(expect.objectContaining({ status: 502 }))
  })

  it('rejects a malformed item inside an otherwise valid page', () => {
    expect(() => normalizePageResult({
      items: [mangaSummary(), {}],
      total: 2,
      page: 1,
      limit: 24,
    }, normalizeMangaSummary, '漫画')).toThrow(expect.objectContaining({ status: 502 }))
  })

  it('does not retain malformed response bodies in recoverable errors', () => {
    const oversizedPayload = { private: 'x'.repeat(100_000) }
    try {
      normalizeMangaSummary(oversizedPayload)
      throw new Error('expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).body).toBeUndefined()
    }
  })
})

function mangaSummary() {
  return {
    uuid: 'manga-1',
    displayTitle: '漫画',
    originalTitle: 'Manga',
    publishDate: null,
    cover: 0,
    createAt: date,
    updateAt: date,
  }
}
