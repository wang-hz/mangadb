import type { ApiClient } from './client'
import {
  getAllTags,
  getAllTagTypes,
  getMangasByTag,
  getTags,
  nextTagPage,
  uniqueTags,
} from './tags'
import type { PageResult, Tag } from './types'

describe('tag API', () => {
  const request = jest.fn()
  const client = { request } as unknown as ApiClient
  const timestamp = '2026-08-20T00:00:00.000Z'
  const tag = (uuid: string): Tag => ({
    uuid,
    name: uuid,
    createAt: timestamp,
    updateAt: timestamp,
    tagType: { uuid: 'type-1', name: '题材' },
  })
  const tagType = (uuid: string) => ({
    uuid,
    name: uuid,
    createAt: timestamp,
    updateAt: timestamp,
  })

  beforeEach(() => request.mockReset())

  it('loads all tag pages without duplicates', async () => {
    request
      .mockResolvedValueOnce({
        items: [tag('tag-1'), tag('tag-2')],
        total: 3,
        page: 1,
        limit: 2,
      })
      .mockResolvedValueOnce({
        items: [tag('tag-2'), tag('tag-3')],
        total: 3,
        page: 2,
        limit: 2,
      })

    const tags = await getAllTags(client)
    expect(tags.map(tag => tag.uuid)).toEqual(['tag-1', 'tag-2', 'tag-3'])
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('encodes tag search and type filters', async () => {
    request.mockResolvedValue({ items: [], total: 0, page: 1, limit: 30 })
    await getTags(client, {
      page: 1,
      search: ' 少年 ',
      tagTypeName: '作品 类型',
    })
    expect(request).toHaveBeenLastCalledWith(
      '/api/mangadb/tags?page=1&limit=30&sortBy=updateAt&sortOrder=desc&search=%E5%B0%91%E5%B9%B4&tagTypeName=%E4%BD%9C%E5%93%81+%E7%B1%BB%E5%9E%8B',
      { signal: undefined },
    )
  })

  it('loads every tag type page and requests summary mangas using bounded page sizes', async () => {
    request
      .mockResolvedValueOnce({
        items: Array.from({ length: 100 }, (_, index) => tagType(String(index))),
        total: 101,
        page: 1,
        limit: 100,
      })
      .mockResolvedValueOnce({ items: [tagType('100')], total: 101, page: 2, limit: 100 })
    await expect(getAllTagTypes(client)).resolves.toHaveLength(101)
    expect(request.mock.calls.slice(-2)).toEqual([
      ['/api/mangadb/tag_types?page=1&limit=100', { signal: undefined }],
      ['/api/mangadb/tag_types?page=2&limit=100', { signal: undefined }],
    ])

    request.mockResolvedValueOnce({ items: [], total: 0, page: 2, limit: 24 })
    await getMangasByTag(client, { tagUuid: 'tag/id', page: 2, search: ' hero ' })
    expect(request).toHaveBeenLastCalledWith(
      '/api/mangadb/tags/tag%2Fid/mangas?page=2&limit=24&sortBy=updateAt&sortOrder=desc&view=summary&search=hero',
      { signal: undefined },
    )
  })

  it('deduplicates shifted tag pages and stops when complete', () => {
    const pages: PageResult<Tag>[] = [
      { items: [tag('one'), tag('two')], total: 3, page: 1, limit: 2 },
      { items: [tag('two'), tag('three')], total: 3, page: 2, limit: 2 },
    ]
    expect(uniqueTags(pages).map(item => item.uuid)).toEqual(['one', 'two', 'three'])
    expect(nextTagPage(pages[1]!, pages)).toBeUndefined()
  })

  it('rejects a repeated full page instead of looping forever', async () => {
    request
      .mockResolvedValueOnce({ items: [tag('one')], total: 3, page: 1, limit: 1 })
      .mockResolvedValueOnce({ items: [tag('one')], total: 3, page: 2, limit: 1 })

    await expect(getAllTags(client)).rejects.toThrow('标签分页没有进展')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('stops infinite-query pagination at the 100-page safety limit', () => {
    const page: PageResult<Tag> = {
      items: [tag('last')],
      total: 101,
      page: 100,
      limit: 1,
    }
    expect(nextTagPage(page, [page])).toBeUndefined()
  })

  it('rejects malformed tag entities at the API boundary', async () => {
    request.mockResolvedValue({
      items: [{ uuid: 'missing-fields' }],
      total: 1,
      page: 1,
      limit: 30,
    })

    await expect(getTags(client, { page: 1 })).rejects.toMatchObject({ status: 502 })
  })
})
