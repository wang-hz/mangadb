import type { Manga, PageResult, Tag, TagType } from '../types'
import { request } from './request'

const BASE = '/api/mangadb'

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

  updateManga(uuid: string, data: Partial<Pick<Manga, 'fullname' | 'displayTitle' | 'originalTitle' | 'cover' | 'publishDate'>>) {
    return request<Manga>(`${BASE}/mangas/${uuid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  getMangaFolderFiles(uuid: string) {
    return request<string[]>(`${BASE}/mangas/${uuid}/folder-files`)
  },

  updateMangaPages(uuid: string, pages: string[], cover: number) {
    return request<Manga>(`${BASE}/mangas/${uuid}/pages`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages, cover }),
    })
  },

  createMangaTags(mangaUuid: string, tagUuids: string[]) {
    return request<unknown>(`${BASE}/mangas/${mangaUuid}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tagUuids),
    })
  },

  deleteMangaTag(mangaUuid: string, tagUuid: string) {
    return request<void>(`${BASE}/mangas/${mangaUuid}/tags/${tagUuid}`, {
      method: 'DELETE',
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

  updateTag(uuid: string, data: { name?: string; type?: string }) {
    return request<Tag>(`${BASE}/tags/${uuid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  deleteTag(uuid: string) {
    return request<void>(`${BASE}/tags/${uuid}`, { method: 'DELETE' })
  },

  batchSetPublishDateByTag(tagUuid: string, publishDate: string | null) {
    return request<{ updated: number }>(`${BASE}/tags/${tagUuid}/batch-set-publish-date`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishDate }),
    })
  },

  batchAddTagToMangasByTag(sourceTagUuid: string, targetTagUuid: string) {
    return request<{ added: number }>(`${BASE}/tags/${sourceTagUuid}/batch-add-tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagUuid: targetTagUuid }),
    })
  },

  getTagTypes(params: { page: number; limit: number }) {
    const q = new URLSearchParams({ page: String(params.page), limit: String(params.limit) })
    return request<PageResult<TagType>>(`${BASE}/tag_types?${q}`)
  },
}