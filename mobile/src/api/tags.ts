import { ApiError, type ApiClient } from './client'
import type {
  MangaSortBy,
  MangaSummary,
  PageResult,
  SortOrder,
  Tag,
  TagSortBy,
  TagType,
} from './types'
import { MANGA_PAGE_SIZE } from './mangas'
import {
  normalizeMangaSummary,
  normalizePageResult,
  normalizeTag,
  normalizeTagType,
} from './validation'

export const TAG_PAGE_SIZE = 30
const MAX_PAGINATION_PAGES = 100

interface TagListParams {
  page: number
  search?: string
  tagTypeName?: string
  sortBy?: TagSortBy
  sortOrder?: SortOrder
}

export async function getTags(
  client: ApiClient,
  params: TagListParams,
  signal?: AbortSignal,
): Promise<PageResult<Tag>> {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(TAG_PAGE_SIZE),
    sortBy: params.sortBy ?? 'updateAt',
    sortOrder: params.sortOrder ?? 'desc',
  })
  const search = params.search?.trim()
  if (search) query.set('search', search)
  if (params.tagTypeName) query.set('tagTypeName', params.tagTypeName)
  const payload = await client.request<unknown>(`/api/mangadb/tags?${query}`, { signal })
  return normalizePageResult(payload, normalizeTag, '标签')
}

export async function getAllTags(client: ApiClient, signal?: AbortSignal): Promise<Tag[]> {
  const tags: Tag[] = []
  const seen = new Set<string>()
  let page = 1
  while (page <= MAX_PAGINATION_PAGES) {
    const response = await getTags(client, { page, sortBy: 'updateAt', sortOrder: 'desc' }, signal)
    const previousSize = seen.size
    for (const tag of response.items) {
      if (!seen.has(tag.uuid)) {
        seen.add(tag.uuid)
        tags.push(tag)
      }
    }
    if (response.items.length < response.limit || seen.size >= response.total) return tags
    if (response.page !== page || seen.size === previousSize) {
      throw new ApiError('标签分页没有进展', 502)
    }
    page += 1
  }
  throw new ApiError(`标签分页超过 ${MAX_PAGINATION_PAGES} 页安全上限`, 502)
}

export async function getAllTagTypes(client: ApiClient, signal?: AbortSignal): Promise<TagType[]> {
  const tagTypes: TagType[] = []
  const seen = new Set<string>()
  let page = 1

  while (page <= MAX_PAGINATION_PAGES) {
    const payload = await client.request<unknown>(
      `/api/mangadb/tag_types?page=${page}&limit=100`,
      { signal },
    )
    const response = normalizePageResult(payload, normalizeTagType, '标签类型')
    const previousSize = seen.size
    for (const tagType of response.items) {
      if (!seen.has(tagType.uuid)) {
        seen.add(tagType.uuid)
        tagTypes.push(tagType)
      }
    }
    if (response.items.length < response.limit || seen.size >= response.total) return tagTypes
    if (response.page !== page || seen.size === previousSize) {
      throw new ApiError('标签类型分页没有进展', 502)
    }
    page += 1
  }
  throw new ApiError(`标签类型分页超过 ${MAX_PAGINATION_PAGES} 页安全上限`, 502)
}

export async function getTag(client: ApiClient, uuid: string, signal?: AbortSignal): Promise<Tag> {
  const payload = await client.request<unknown>(
    `/api/mangadb/tags/${encodeURIComponent(uuid)}`,
    { signal },
  )
  return normalizeTag(payload)
}

interface TagMangaListParams {
  tagUuid: string
  page: number
  search?: string
  sortBy?: MangaSortBy
  sortOrder?: SortOrder
}

export async function getMangasByTag(
  client: ApiClient,
  params: TagMangaListParams,
  signal?: AbortSignal,
): Promise<PageResult<MangaSummary>> {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(MANGA_PAGE_SIZE),
    sortBy: params.sortBy ?? 'updateAt',
    sortOrder: params.sortOrder ?? 'desc',
    view: 'summary',
  })
  const search = params.search?.trim()
  if (search) query.set('search', search)
  const payload = await client.request<unknown>(
    `/api/mangadb/tags/${encodeURIComponent(params.tagUuid)}/mangas?${query}`,
    { signal },
  )
  return normalizePageResult(payload, normalizeMangaSummary, '标签漫画')
}

export function nextTagPage(lastPage: PageResult<Tag>, allPages: PageResult<Tag>[]): number | undefined {
  const loaded = new Set(allPages.flatMap(page => page.items.map(item => item.uuid))).size
  const previouslyLoaded = new Set(
    allPages.slice(0, -1).flatMap(page => page.items.map(item => item.uuid)),
  )
  const madeProgress = lastPage.items.some(item => !previouslyLoaded.has(item.uuid))
  if (
    lastPage.page >= MAX_PAGINATION_PAGES ||
    lastPage.items.length === 0 ||
    lastPage.items.length < lastPage.limit ||
    loaded >= lastPage.total ||
    !madeProgress
  ) return undefined
  return lastPage.page + 1
}

export function uniqueTags(pages: PageResult<Tag>[]): Tag[] {
  const seen = new Set<string>()
  return pages.flatMap(page => page.items.filter(tag => {
    if (seen.has(tag.uuid)) return false
    seen.add(tag.uuid)
    return true
  }))
}
