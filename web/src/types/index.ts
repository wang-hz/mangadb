export interface Manga {
  uuid: string
  fullname: string
  displayTitle: string
  originalTitle: string
  publishDate: string | null
  pages: string[]
  cover: number | null
  createAt: string
  updateAt: string
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

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

export interface User {
  uuid: string
  username: string
  role: string
  createAt: string
}

export interface LoginLog {
  id: number
  userUuid: string | null
  username: string
  ip: string
  userAgent: string
  success: boolean
  createdAt: string
}