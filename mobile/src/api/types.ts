export type SortOrder = 'asc' | 'desc'
export type MangaSortBy = 'createAt' | 'updateAt' | 'publishDate'
export type TagSortBy = 'createAt' | 'updateAt'

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

export interface MangaSummary {
  uuid: string
  displayTitle: string
  originalTitle: string
  publishDate: string | null
  cover: number | null
  createAt: string
  updateAt: string
}

export interface MangaDetail extends MangaSummary {
  fullname: string
  pages: string[]
  mangaTags: MangaTagItem[]
}

export interface MangaTagItem {
  tag: {
    uuid: string
    name: string
    tagType: {
      uuid: string
      name: string
    }
  }
}

export interface Tag {
  uuid: string
  name: string
  createAt: string
  updateAt: string
  tagType: {
    uuid: string
    name: string
  }
}

export interface TagType {
  uuid: string
  name: string
  createAt: string
  updateAt: string
}

export interface SessionUser {
  uuid: string
  username: string
  role: string
  expiresAt: number
}
