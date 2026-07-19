import { ApiError, type ApiClient } from './client'
import type {
  MangaDetail,
  MangaSortBy,
  MangaSummary,
  MangaTagItem,
  PageResult,
  SortOrder,
} from './types'

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

export async function getManga(client: ApiClient, uuid: string, signal?: AbortSignal): Promise<MangaDetail> {
  const payload = await client.request<unknown>(
    `/api/mangadb/mangas/${encodeURIComponent(uuid)}`,
    { signal },
  )
  return normalizeMangaDetail(payload)
}

function normalizeMangaDetail(payload: unknown): MangaDetail {
  if (!isRecord(payload)) throw new ApiError('服务器返回了无效的漫画详情', 502, payload)
  const requiredStrings = ['uuid', 'fullname', 'displayTitle', 'originalTitle', 'createAt', 'updateAt'] as const
  if (requiredStrings.some(field => typeof payload[field] !== 'string')) {
    throw new ApiError('服务器返回了无效的漫画详情', 502, payload)
  }

  const publishDate = payload.publishDate
  const cover = payload.cover
  if (
    !(publishDate === null || typeof publishDate === 'string') ||
    !(cover === null || (typeof cover === 'number' && Number.isInteger(cover)))
  ) {
    throw new ApiError('服务器返回了无效的漫画详情', 502, payload)
  }

  const pages = Array.isArray(payload.pages) && payload.pages.every(page => typeof page === 'string')
    ? payload.pages
    : []
  const mangaTags = Array.isArray(payload.mangaTags)
    ? payload.mangaTags.filter(isMangaTagItem)
    : []

  return {
    uuid: payload.uuid as string,
    fullname: payload.fullname as string,
    displayTitle: payload.displayTitle as string,
    originalTitle: payload.originalTitle as string,
    publishDate,
    pages,
    cover,
    createAt: payload.createAt as string,
    updateAt: payload.updateAt as string,
    mangaTags,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMangaTagItem(value: unknown): value is MangaTagItem {
  if (!isRecord(value) || !isRecord(value.tag) || !isRecord(value.tag.tagType)) return false
  return typeof value.tag.uuid === 'string' &&
    typeof value.tag.name === 'string' &&
    typeof value.tag.tagType.uuid === 'string' &&
    typeof value.tag.tagType.name === 'string'
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
