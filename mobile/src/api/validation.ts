import { ApiError } from './client'
import type {
  MangaDetail,
  MangaSummary,
  MangaTagItem,
  PageResult,
  Tag,
  TagType,
} from './types'

const MAX_PAGE_LIMIT = 1_000

export function normalizeMangaSummary(payload: unknown): MangaSummary {
  if (!isRecord(payload)) invalidPayload('服务器返回了无效的漫画信息')

  const uuid = requiredString(payload.uuid)
  const displayTitle = requiredString(payload.displayTitle)
  const originalTitle = requiredString(payload.originalTitle)
  const createAt = dateString(payload.createAt)
  const updateAt = dateString(payload.updateAt)
  const publishDate = nullableDateString(payload.publishDate)
  const cover = nullableNonNegativeInteger(payload.cover)

  if (
    uuid === null ||
    displayTitle === null ||
    originalTitle === null ||
    createAt === null ||
    updateAt === null ||
    publishDate === undefined ||
    cover === undefined
  ) invalidPayload('服务器返回了无效的漫画信息')

  return {
    uuid,
    displayTitle,
    originalTitle,
    publishDate,
    cover,
    createAt,
    updateAt,
  }
}

export function normalizeMangaDetail(payload: unknown): MangaDetail {
  const summary = normalizeMangaSummary(payload)
  if (!isRecord(payload)) invalidPayload('服务器返回了无效的漫画详情')
  const fullname = requiredString(payload.fullname)
  if (
    fullname === null ||
    !Array.isArray(payload.pages) ||
    !payload.pages.every(page => requiredString(page) !== null) ||
    !Array.isArray(payload.mangaTags) ||
    !payload.mangaTags.every(isMangaTagItem)
  ) invalidPayload('服务器返回了无效的漫画详情')

  return {
    ...summary,
    fullname,
    pages: [...payload.pages] as string[],
    mangaTags: payload.mangaTags.map(item => cloneMangaTagItem(item as MangaTagItem)),
  }
}

export function normalizeTag(payload: unknown): Tag {
  if (!isRecord(payload) || !isRecord(payload.tagType)) {
    invalidPayload('服务器返回了无效的标签信息')
  }
  const uuid = requiredString(payload.uuid)
  const name = requiredString(payload.name)
  const createAt = dateString(payload.createAt)
  const updateAt = dateString(payload.updateAt)
  const tagTypeUuid = requiredString(payload.tagType.uuid)
  const tagTypeName = requiredString(payload.tagType.name)
  if (
    uuid === null ||
    name === null ||
    createAt === null ||
    updateAt === null ||
    tagTypeUuid === null ||
    tagTypeName === null
  ) invalidPayload('服务器返回了无效的标签信息')
  return {
    uuid,
    name,
    createAt,
    updateAt,
    tagType: { uuid: tagTypeUuid, name: tagTypeName },
  }
}

export function normalizeTagType(payload: unknown): TagType {
  if (!isRecord(payload)) invalidPayload('服务器返回了无效的标签类型')
  const uuid = requiredString(payload.uuid)
  const name = requiredString(payload.name)
  const createAt = dateString(payload.createAt)
  const updateAt = dateString(payload.updateAt)
  if (uuid === null || name === null || createAt === null || updateAt === null) {
    invalidPayload('服务器返回了无效的标签类型')
  }
  return { uuid, name, createAt, updateAt }
}

export function normalizePageResult<T>(
  payload: unknown,
  normalizeItem: (item: unknown) => T,
  description: string,
): PageResult<T> {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    invalidPayload(`服务器返回了无效的${description}分页`)
  }
  const total = finiteInteger(payload.total, 0)
  const page = finiteInteger(payload.page, 1)
  const limit = finiteInteger(payload.limit, 1, MAX_PAGE_LIMIT)
  if (total === null || page === null || limit === null || payload.items.length > limit) {
    invalidPayload(`服务器返回了无效的${description}分页`)
  }
  let items: T[]
  try {
    items = payload.items.map(normalizeItem)
  } catch (error) {
    if (error instanceof ApiError) throw error
    invalidPayload(`服务器返回了无效的${description}分页`)
  }
  return { items, total, page, limit }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidPayload(message: string): never {
  // Do not retain a potentially huge or sensitive malformed response in the
  // React Query error cache. The status and sanitized message are sufficient.
  throw new ApiError(message, 502)
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function dateString(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
}

function nullableDateString(value: unknown): string | null | undefined {
  return value === null ? null : dateString(value) ?? undefined
}

function nullableNonNegativeInteger(value: unknown): number | null | undefined {
  return value === null
    ? null
    : Number.isInteger(value) && Number(value) >= 0
      ? Number(value)
      : undefined
}

function finiteInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum
    ? Number(value)
    : null
}

function isMangaTagItem(value: unknown): value is MangaTagItem {
  if (!isRecord(value) || !isRecord(value.tag) || !isRecord(value.tag.tagType)) return false
  return requiredString(value.tag.uuid) !== null &&
    requiredString(value.tag.name) !== null &&
    requiredString(value.tag.tagType.uuid) !== null &&
    requiredString(value.tag.tagType.name) !== null
}

function cloneMangaTagItem(item: MangaTagItem): MangaTagItem {
  return {
    tag: {
      uuid: item.tag.uuid,
      name: item.tag.name,
      tagType: { uuid: item.tag.tagType.uuid, name: item.tag.tagType.name },
    },
  }
}
