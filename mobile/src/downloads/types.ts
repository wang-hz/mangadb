import type { MangaDetail } from '@/api/types'

export type DownloadState =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'failed'
  | 'completed'
  | 'stale'

export type DownloadPageState = 'pending' | 'downloading' | 'completed' | 'failed'

export type DownloadFailureCode =
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'low-storage'
  | 'invalid-content'
  | 'filesystem'
  | 'unknown'

export interface DownloadIdentity {
  serverUrl: string
  userUuid: string
}

export interface DownloadPageRecord {
  index: number
  state: DownloadPageState
  bytesWritten: number
  expectedBytes: number | null
  etag: string | null
  lastModified: string | null
  attempts: number
}

export interface DownloadFailure {
  code: DownloadFailureCode
  message: string
  pageIndex?: number
}

export interface DownloadManifestV1 {
  schemaVersion: 1
  identity: DownloadIdentity
  manga: MangaDetail
  state: DownloadState
  requestedAt: string
  updatedAt: string
  completedAt: string | null
  failure: DownloadFailure | null
  pages: DownloadPageRecord[]
}

export function createDownloadManifest(
  identity: DownloadIdentity,
  manga: MangaDetail,
  now = new Date(),
): DownloadManifestV1 {
  const timestamp = now.toISOString()
  return {
    schemaVersion: 1,
    identity: { ...identity },
    manga: {
      ...manga,
      pages: [...manga.pages],
      mangaTags: manga.mangaTags.map(item => ({
        tag: {
          ...item.tag,
          tagType: { ...item.tag.tagType },
        },
      })),
    },
    state: 'queued',
    requestedAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    failure: null,
    pages: manga.pages.map((_, index) => ({
      index,
      state: 'pending',
      bytesWritten: 0,
      expectedBytes: null,
      etag: null,
      lastModified: null,
      attempts: 0,
    })),
  }
}

export function normalizeRestoredManifest(manifest: DownloadManifestV1): DownloadManifestV1 {
  if (manifest.state !== 'downloading' && !manifest.pages.some(page =>
    page.state === 'downloading')) return manifest
  return {
    ...manifest,
    state: manifest.state === 'downloading' ? 'paused' : manifest.state,
    pages: manifest.pages.map(page => page.state === 'downloading'
      ? { ...page, state: 'pending' }
      : page),
  }
}

export function isDownloadManifestV1(value: unknown): value is DownloadManifestV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) return false
  if (!isDownloadIdentity(value.identity) || !isMangaDetail(value.manga)) return false
  if (!isDownloadState(value.state)) return false
  if (!isIsoDate(value.requestedAt) || !isIsoDate(value.updatedAt)) return false
  if (value.completedAt !== null && !isIsoDate(value.completedAt)) return false
  if (value.failure !== null && !isDownloadFailure(value.failure)) return false
  if (!Array.isArray(value.pages) || value.pages.length !== value.manga.pages.length) return false
  return value.pages.every((page, index) => isDownloadPageRecord(page, index))
}

function isDownloadIdentity(value: unknown): value is DownloadIdentity {
  return isRecord(value) &&
    typeof value.serverUrl === 'string' &&
    value.serverUrl.length > 0 &&
    typeof value.userUuid === 'string' &&
    value.userUuid.length > 0
}

function isMangaDetail(value: unknown): value is MangaDetail {
  return isRecord(value) &&
    typeof value.uuid === 'string' &&
    typeof value.displayTitle === 'string' &&
    typeof value.originalTitle === 'string' &&
    typeof value.fullname === 'string' &&
    (value.publishDate === null || typeof value.publishDate === 'string') &&
    (value.cover === null || Number.isInteger(value.cover)) &&
    typeof value.createAt === 'string' &&
    typeof value.updateAt === 'string' &&
    Array.isArray(value.pages) &&
    value.pages.every(page => typeof page === 'string') &&
    Array.isArray(value.mangaTags) &&
    value.mangaTags.every(item => isRecord(item) &&
      isRecord(item.tag) &&
      typeof item.tag.uuid === 'string' &&
      typeof item.tag.name === 'string' &&
      isRecord(item.tag.tagType) &&
      typeof item.tag.tagType.uuid === 'string' &&
      typeof item.tag.tagType.name === 'string')
}

function isDownloadState(value: unknown): value is DownloadState {
  return value === 'queued' ||
    value === 'downloading' ||
    value === 'paused' ||
    value === 'failed' ||
    value === 'completed' ||
    value === 'stale'
}

function isDownloadPageRecord(value: unknown, index: number): value is DownloadPageRecord {
  return isRecord(value) &&
    value.index === index &&
    (
      value.state === 'pending' ||
      value.state === 'downloading' ||
      value.state === 'completed' ||
      value.state === 'failed'
    ) &&
    isNonNegativeInteger(value.bytesWritten) &&
    (value.expectedBytes === null || isNonNegativeInteger(value.expectedBytes)) &&
    (value.etag === null || typeof value.etag === 'string') &&
    (value.lastModified === null || typeof value.lastModified === 'string') &&
    isNonNegativeInteger(value.attempts)
}

function isDownloadFailure(value: unknown): value is DownloadFailure {
  if (!isRecord(value) || typeof value.message !== 'string') return false
  if (
    value.code !== 'network' &&
    value.code !== 'unauthorized' &&
    value.code !== 'forbidden' &&
    value.code !== 'not-found' &&
    value.code !== 'low-storage' &&
    value.code !== 'invalid-content' &&
    value.code !== 'filesystem' &&
    value.code !== 'unknown'
  ) return false
  return value.pageIndex === undefined || isNonNegativeInteger(value.pageIndex)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
