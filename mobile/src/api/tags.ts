import type { ApiClient } from './client'
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

export const TAG_PAGE_SIZE = 30

interface TagListParams {
  page: number
  search?: string
  tagTypeName?: string
  sortBy?: TagSortBy
  sortOrder?: SortOrder
}

export function getTags(
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
  return client.request<PageResult<Tag>>(`/api/mangadb/tags?${query}`, { signal })
}

export async function getAllTags(client: ApiClient, signal?: AbortSignal): Promise<Tag[]> {
  const tags: Tag[] = []
  const seen = new Set<string>()
  let page = 1
  while (true) {
    const response = await getTags(client, { page, sortBy: 'updateAt', sortOrder: 'desc' }, signal)
    for (const tag of response.items) {
      if (!seen.has(tag.uuid)) {
        seen.add(tag.uuid)
        tags.push(tag)
      }
    }
    if (response.items.length < response.limit || seen.size >= response.total) return tags
    page += 1
  }
}

export async function getAllTagTypes(client: ApiClient, signal?: AbortSignal): Promise<TagType[]> {
  const tagTypes: TagType[] = []
  const seen = new Set<string>()
  let page = 1

  while (true) {
    const response = await client.request<PageResult<TagType>>(
      `/api/mangadb/tag_types?page=${page}&limit=100`,
      { signal },
    )
    for (const tagType of response.items) {
      if (!seen.has(tagType.uuid)) {
        seen.add(tagType.uuid)
        tagTypes.push(tagType)
      }
    }
    if (response.items.length < response.limit || seen.size >= response.total) return tagTypes
    page += 1
  }
}

export function getTag(client: ApiClient, uuid: string, signal?: AbortSignal): Promise<Tag> {
  return client.request<Tag>(`/api/mangadb/tags/${encodeURIComponent(uuid)}`, { signal })
}

interface TagMangaListParams {
  tagUuid: string
  page: number
  search?: string
  sortBy?: MangaSortBy
  sortOrder?: SortOrder
}

export function getMangasByTag(
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
  return client.request<PageResult<MangaSummary>>(
    `/api/mangadb/tags/${encodeURIComponent(params.tagUuid)}/mangas?${query}`,
    { signal },
  )
}

export function nextTagPage(lastPage: PageResult<Tag>, allPages: PageResult<Tag>[]): number | undefined {
  const loaded = new Set(allPages.flatMap(page => page.items.map(item => item.uuid))).size
  if (
    lastPage.items.length === 0 ||
    lastPage.items.length < lastPage.limit ||
    loaded >= lastPage.total
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
