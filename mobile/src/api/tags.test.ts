import type { ApiClient } from './client'
import { getAllTagTypes, getMangasByTag, getTags, nextTagPage, uniqueTags } from './tags'
import type { PageResult, Tag } from './types'

describe('tag API', () => {
  const request = jest.fn()
  const client = { request } as unknown as ApiClient

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
    const tagType = (uuid: string) => ({ uuid })
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
    const tag = (uuid: string) => ({ uuid }) as Tag
    const pages: PageResult<Tag>[] = [
      { items: [tag('one'), tag('two')], total: 3, page: 1, limit: 2 },
      { items: [tag('two'), tag('three')], total: 3, page: 2, limit: 2 },
    ]
    expect(uniqueTags(pages).map(item => item.uuid)).toEqual(['one', 'two', 'three'])
    expect(nextTagPage(pages[1], pages)).toBeUndefined()
  })
})
