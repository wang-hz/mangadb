import type { Manga, PageResult, Tag, TagType } from '../types'

const BASE = '/api/mangadb'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json()
}

export const api = {
  getMangas(params: { page: number; limit: number; search?: string; sortBy?: string; sortOrder?: string }) {
    const q = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
      ...(params.search ? { search: params.search } : {}),
      ...(params.sortBy ? { sortBy: params.sortBy } : {}),
      ...(params.sortOrder ? { sortOrder: params.sortOrder } : {}),
    })
    return request<PageResult<Manga>>(`${BASE}/mangas?${q}`)
  },

  getManga(uuid: string) {
    return request<Manga>(`${BASE}/mangas/${uuid}`)
  },

  updateManga(uuid: string, data: Partial<Pick<Manga, 'fullname' | 'displayTitle' | 'originalTitle' | 'cover'>>) {
    return request<Manga>(`${BASE}/mangas/${uuid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  createMangaTags(mangaUuid: string, tagUuids: string[]) {
    return request<unknown>(`${BASE}/mangas/${mangaUuid}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tagUuids),
    })
  },

  getMangasByTag(tagUuid: string, params: { page: number; limit: number; search?: string; sortBy?: string; sortOrder?: string }) {
    const q = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
      ...(params.search ? { search: params.search } : {}),
      ...(params.sortBy ? { sortBy: params.sortBy } : {}),
      ...(params.sortOrder ? { sortOrder: params.sortOrder } : {}),
    })
    return request<PageResult<Manga>>(`${BASE}/tags/${tagUuid}/mangas?${q}`)
  },

  getTag(uuid: string) {
    return request<Tag>(`${BASE}/tags/${uuid}`)
  },

  getTags(params: { page: number; limit: number; search?: string; sortBy?: string; sortOrder?: string; tagTypeName?: string }) {
    const q = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
      ...(params.search ? { search: params.search } : {}),
      ...(params.sortBy ? { sortBy: params.sortBy } : {}),
      ...(params.sortOrder ? { sortOrder: params.sortOrder } : {}),
      ...(params.tagTypeName ? { tagTypeName: params.tagTypeName } : {}),
    })
    return request<PageResult<Tag>>(`${BASE}/tags?${q}`)
  },

  createTag(name: string, type: string) {
    return request<Tag>(`${BASE}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type }),
    })
  },

  getTagTypes(params: { page: number; limit: number }) {
    const q = new URLSearchParams({ page: String(params.page), limit: String(params.limit) })
    return request<PageResult<TagType>>(`${BASE}/tag_types?${q}`)
  },
}