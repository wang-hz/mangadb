import type { ApiClient } from './client'
import type { MangaSortBy, MangaSummary, PageResult, SortOrder } from './types'

export const MANGA_PAGE_SIZE = 24

export interface MangaListParams {
  page: number
  limit?: number
  search?: string
  sortBy: MangaSortBy
  sortOrder: SortOrder
}

export function getMangas(
  client: ApiClient,
  params: MangaListParams,
  signal?: AbortSignal,
): Promise<PageResult<MangaSummary>> {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit ?? MANGA_PAGE_SIZE),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    view: 'summary',
  })
  const search = params.search?.trim()
  if (search) query.set('search', search)
  return client.request<PageResult<MangaSummary>>(`/api/mangadb/mangas?${query}`, { signal })
}

export function nextMangaPage(
  lastPage: PageResult<MangaSummary>,
  allPages: PageResult<MangaSummary>[],
): number | undefined {
  const loaded = new Set(allPages.flatMap(page => page.items.map(item => item.uuid))).size
  if (
    lastPage.items.length === 0 ||
    lastPage.items.length < lastPage.limit ||
    loaded >= lastPage.total
  ) return undefined
  return lastPage.page + 1
}

export function uniqueMangas(pages: PageResult<MangaSummary>[]): MangaSummary[] {
  const seen = new Set<string>()
  return pages.flatMap(page => page.items.filter(manga => {
    if (seen.has(manga.uuid)) return false
    seen.add(manga.uuid)
    return true
  }))
}
