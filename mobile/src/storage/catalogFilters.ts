import AsyncStorage from '@react-native-async-storage/async-storage'
import type { MangaSortBy, SortOrder } from '@/api/types'

const CATALOG_FILTERS_KEY_PREFIX = 'mangadb.catalogFilters.v1'
const writeQueues = new Map<string, Promise<unknown>>()

export type ReadingStateFilter = 'all' | 'unread' | 'reading' | 'completed'

export interface CatalogFilters {
  search: string
  sortBy: MangaSortBy
  sortOrder: SortOrder
  tagUuids: string[]
  publishYearFrom: number | null
  publishYearTo: number | null
  readingState: ReadingStateFilter
  favoriteOnly: boolean
  downloadedOnly: boolean
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = {
  search: '',
  sortBy: 'updateAt',
  sortOrder: 'desc',
  tagUuids: [],
  publishYearFrom: null,
  publishYearTo: null,
  readingState: 'all',
  favoriteOnly: false,
  downloadedOnly: false,
}

export async function loadCatalogFilters(
  serverUrl: string,
  userUuid: string,
): Promise<CatalogFilters> {
  const identity = catalogIdentity(serverUrl, userUuid)
  await writeQueues.get(identity)?.catch(() => {})
  const stored = await AsyncStorage.getItem(catalogFiltersKey(serverUrl, userUuid))
  if (!stored) return cloneDefault()
  try {
    return normalizeCatalogFilters(JSON.parse(stored))
  } catch {
    return cloneDefault()
  }
}

export async function saveCatalogFilters(
  serverUrl: string,
  userUuid: string,
  filters: CatalogFilters,
): Promise<CatalogFilters> {
  const identity = catalogIdentity(serverUrl, userUuid)
  const normalized = normalizeCatalogFilters(filters)
  const queued = (writeQueues.get(identity) ?? Promise.resolve())
    .catch(() => {})
    .then(() => AsyncStorage.setItem(
      catalogFiltersKey(serverUrl, userUuid),
      JSON.stringify(normalized),
    ))
    .then(() => normalized)
  writeQueues.set(identity, queued)
  void queued.finally(() => {
    if (writeQueues.get(identity) === queued) writeQueues.delete(identity)
  }).catch(() => {})
  return queued
}

export function activeCatalogFilterCount(filters: CatalogFilters): number {
  return Number(filters.tagUuids.length > 0) +
    Number(filters.publishYearFrom !== null || filters.publishYearTo !== null) +
    Number(filters.readingState !== 'all') +
    Number(filters.favoriteOnly) +
    Number(filters.downloadedOnly)
}

function normalizeCatalogFilters(value: unknown): CatalogFilters {
  if (!isRecord(value)) return cloneDefault()
  const from = normalizeYear(value.publishYearFrom)
  const to = normalizeYear(value.publishYearTo)
  return {
    search: typeof value.search === 'string' ? value.search.slice(0, 200) : '',
    sortBy: value.sortBy === 'createAt' ||
      value.sortBy === 'updateAt' ||
      value.sortBy === 'publishDate'
      ? value.sortBy
      : DEFAULT_CATALOG_FILTERS.sortBy,
    sortOrder: value.sortOrder === 'asc' || value.sortOrder === 'desc'
      ? value.sortOrder
      : DEFAULT_CATALOG_FILTERS.sortOrder,
    tagUuids: Array.isArray(value.tagUuids)
      ? [...new Set(value.tagUuids.filter(item =>
        typeof item === 'string' && item.length > 0))].slice(0, 20)
      : [],
    publishYearFrom: from !== null && to !== null && from > to ? null : from,
    publishYearTo: from !== null && to !== null && from > to ? null : to,
    readingState: value.readingState === 'unread' ||
      value.readingState === 'reading' ||
      value.readingState === 'completed'
      ? value.readingState
      : 'all',
    favoriteOnly: value.favoriteOnly === true,
    downloadedOnly: value.downloadedOnly === true,
  }
}

function normalizeYear(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 1000 && Number(value) <= 9999
    ? Number(value)
    : null
}

function cloneDefault(): CatalogFilters {
  return { ...DEFAULT_CATALOG_FILTERS, tagUuids: [] }
}

function catalogIdentity(serverUrl: string, userUuid: string) {
  return `${encodeURIComponent(serverUrl)}:${encodeURIComponent(userUuid)}`
}

function catalogFiltersKey(serverUrl: string, userUuid: string) {
  return `${CATALOG_FILTERS_KEY_PREFIX}:${catalogIdentity(serverUrl, userUuid)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
