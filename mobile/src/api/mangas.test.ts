import { getMangas, nextMangaPage, uniqueMangas } from './mangas'
import type { ApiClient } from './client'
import type { MangaSummary, PageResult } from './types'

describe('manga API', () => {
  it('requests a summary page with encoded search and sort values', async () => {
    const request = jest.fn().mockResolvedValue({ items: [], total: 0, page: 2, limit: 24 })
    const client = { request } as unknown as ApiClient
    const controller = new AbortController()

    await getMangas(client, {
      page: 2,
      search: '  科幻 漫画  ',
      sortBy: 'updateAt',
      sortOrder: 'desc',
    }, controller.signal)

    expect(request).toHaveBeenCalledWith(
      '/api/mangadb/mangas?page=2&limit=24&sortBy=updateAt&sortOrder=desc&view=summary&search=%E7%A7%91%E5%B9%BB+%E6%BC%AB%E7%94%BB',
      { signal: controller.signal },
    )
  })

  it('continues until all reported items are loaded and stops on an empty page', () => {
    const page = (number: number, count: number, total: number): PageResult<MangaSummary> => ({
      items: Array.from({ length: count }, (_, index) => ({ uuid: `${number}-${index}` })) as MangaSummary[],
      total,
      page: number,
      limit: 24,
    })
    const first = page(1, 24, 25)
    const second = page(2, 1, 25)
    const staleEmpty = page(2, 0, 25)

    expect(nextMangaPage(first, [first])).toBe(2)
    expect(nextMangaPage(second, [first, second])).toBeUndefined()
    expect(nextMangaPage(staleEmpty, [first, staleEmpty])).toBeUndefined()
  })

  it('deduplicates items when offset pages shift between requests', () => {
    const manga = (uuid: string) => ({ uuid }) as MangaSummary
    const pages: PageResult<MangaSummary>[] = [
      { items: [manga('one'), manga('two')], total: 3, page: 1, limit: 2 },
      { items: [manga('two'), manga('three')], total: 3, page: 2, limit: 2 },
    ]

    expect(uniqueMangas(pages).map(item => item.uuid)).toEqual(['one', 'two', 'three'])
    expect(nextMangaPage(pages[1], pages)).toBeUndefined()
  })
})
