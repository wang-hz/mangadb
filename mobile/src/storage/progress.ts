import AsyncStorage from '@react-native-async-storage/async-storage'
import type { MangaSummary } from '@/api/types'
import { clampPageIndex, type ReaderMode } from '@/utils/reader'

const PROGRESS_KEY_PREFIX = 'mangadb.readingProgress.v1'
const PROGRESS_INDEX_KEY_PREFIX = 'mangadb.readingProgressIndex.v1'
const identityWriteQueues = new Map<string, Promise<unknown>>()

export type ReadingState = 'reading' | 'completed'

export interface ReadingProgress {
  pageIndex: number
  mode: ReaderMode
  state: ReadingState
  updatedAt: string
}

export interface RecentReadingEntry extends ReadingProgress {
  manga: MangaSummary
  pageCount: number
  hiddenFromRecent: boolean
}

interface ProgressIndexV1 {
  schemaVersion: 1
  entries: Record<string, RecentReadingEntry>
}

export async function loadReadingProgress(
  serverUrl: string,
  userUuid: string,
  mangaUuid: string,
  pageCount: number,
): Promise<ReadingProgress | null> {
  const identity = progressIdentity(serverUrl, userUuid)
  await identityWriteQueues.get(identity)?.catch(() => {})
  const key = progressKey(serverUrl, userUuid, mangaUuid)
  const stored = await AsyncStorage.getItem(key)
  const value = parseReadingProgress(stored)
  if (!value) return null

  const pageIndex = clampPageIndex(value.pageIndex, pageCount)
  if (pageIndex !== value.pageIndex) {
    const clamped = { ...value, pageIndex }
    try {
      await enqueueIdentityWrite(identity, () =>
        AsyncStorage.setItem(key, JSON.stringify(clamped)))
    } catch {}
    return clamped
  }
  return value
}

export async function saveReadingProgress(
  serverUrl: string,
  userUuid: string,
  mangaUuid: string,
  pageCount: number,
  pageIndex: number,
  mode: ReaderMode,
  manga?: MangaSummary,
): Promise<ReadingProgress> {
  const identity = progressIdentity(serverUrl, userUuid)
  return enqueueIdentityWrite(identity, async () => {
    const previousEntry = manga
      ? (await loadProgressIndex(serverUrl, userUuid)).entries[mangaUuid]
      : undefined
    const clampedPageIndex = clampPageIndex(pageIndex, pageCount)
    const progress: ReadingProgress = {
      pageIndex: clampedPageIndex,
      mode,
      state: keepCompletedState(previousEntry, pageCount, clampedPageIndex)
        ? 'completed'
        : 'reading',
      updatedAt: new Date().toISOString(),
    }
    await AsyncStorage.setItem(
      progressKey(serverUrl, userUuid, mangaUuid),
      JSON.stringify(progress),
    )
    if (manga) {
      const index = await loadProgressIndex(serverUrl, userUuid)
      index.entries[mangaUuid] = {
        ...progress,
        manga: cloneMangaSummary(manga),
        pageCount: Math.max(0, Math.trunc(pageCount)),
        hiddenFromRecent: false,
      }
      await saveProgressIndex(serverUrl, userUuid, index)
    }
    return progress
  })
}

export async function listRecentReading(
  serverUrl: string,
  userUuid: string,
): Promise<RecentReadingEntry[]> {
  const identity = progressIdentity(serverUrl, userUuid)
  await identityWriteQueues.get(identity)?.catch(() => {})
  const index = await loadProgressIndex(serverUrl, userUuid)
  return Object.values(index.entries)
    .filter(entry => !entry.hiddenFromRecent)
    .map(entry => ({
      ...entry,
      manga: cloneMangaSummary(entry.manga),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function listReadingProgress(
  serverUrl: string,
  userUuid: string,
): Promise<RecentReadingEntry[]> {
  const identity = progressIdentity(serverUrl, userUuid)
  await identityWriteQueues.get(identity)?.catch(() => {})
  const index = await loadProgressIndex(serverUrl, userUuid)
  return Object.values(index.entries)
    .map(entry => ({
      ...entry,
      manga: cloneMangaSummary(entry.manga),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function markMangaCompleted(
  serverUrl: string,
  userUuid: string,
  manga: MangaSummary,
  pageCount: number,
  mode: ReaderMode,
): Promise<RecentReadingEntry> {
  const identity = progressIdentity(serverUrl, userUuid)
  return enqueueIdentityWrite(identity, async () => {
    const index = await loadProgressIndex(serverUrl, userUuid)
    const now = new Date().toISOString()
    const entry: RecentReadingEntry = {
      manga: cloneMangaSummary(manga),
      pageCount: Math.max(0, Math.trunc(pageCount)),
      pageIndex: clampPageIndex(pageCount - 1, pageCount),
      mode,
      state: 'completed',
      updatedAt: now,
      hiddenFromRecent: false,
    }
    await AsyncStorage.setItem(
      progressKey(serverUrl, userUuid, manga.uuid),
      JSON.stringify(readingProgressFromEntry(entry)),
    )
    index.entries[manga.uuid] = entry
    await saveProgressIndex(serverUrl, userUuid, index)
    return entry
  })
}

export async function markMangaUnread(
  serverUrl: string,
  userUuid: string,
  mangaUuid: string,
): Promise<void> {
  const identity = progressIdentity(serverUrl, userUuid)
  await enqueueIdentityWrite(identity, async () => {
    const index = await loadProgressIndex(serverUrl, userUuid)
    delete index.entries[mangaUuid]
    await AsyncStorage.removeItem(progressKey(serverUrl, userUuid, mangaUuid))
    await saveProgressIndex(serverUrl, userUuid, index)
  })
}

export async function removeFromRecentReading(
  serverUrl: string,
  userUuid: string,
  mangaUuid: string,
): Promise<void> {
  const identity = progressIdentity(serverUrl, userUuid)
  await enqueueIdentityWrite(identity, async () => {
    const index = await loadProgressIndex(serverUrl, userUuid)
    const entry = index.entries[mangaUuid]
    if (!entry) return
    index.entries[mangaUuid] = { ...entry, hiddenFromRecent: true }
    await saveProgressIndex(serverUrl, userUuid, index)
  })
}

function enqueueIdentityWrite<T>(
  identity: string,
  operation: () => Promise<T>,
): Promise<T> {
  const queued = (identityWriteQueues.get(identity) ?? Promise.resolve())
    .catch(() => {})
    .then(operation)
  identityWriteQueues.set(identity, queued)
  void queued.finally(() => {
    if (identityWriteQueues.get(identity) === queued) identityWriteQueues.delete(identity)
  }).catch(() => {})
  return queued
}

async function loadProgressIndex(
  serverUrl: string,
  userUuid: string,
): Promise<ProgressIndexV1> {
  const stored = await AsyncStorage.getItem(progressIndexKey(serverUrl, userUuid))
  if (!stored) return emptyProgressIndex()
  let value: unknown
  try {
    value = JSON.parse(stored)
  } catch {
    return emptyProgressIndex()
  }
  return normalizeProgressIndex(value)
}

async function saveProgressIndex(
  serverUrl: string,
  userUuid: string,
  index: ProgressIndexV1,
): Promise<void> {
  await AsyncStorage.setItem(
    progressIndexKey(serverUrl, userUuid),
    JSON.stringify(index),
  )
}

function emptyProgressIndex(): ProgressIndexV1 {
  return { schemaVersion: 1, entries: {} }
}

function normalizeProgressIndex(value: unknown): ProgressIndexV1 {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.entries)) {
    return emptyProgressIndex()
  }
  const entries: Record<string, RecentReadingEntry> = {}
  for (const [mangaUuid, entry] of Object.entries(value.entries)) {
    if (isRecentReadingEntry(entry) && entry.manga.uuid === mangaUuid) {
      entries[mangaUuid] = {
        ...entry,
        hiddenFromRecent: entry.hiddenFromRecent ?? false,
      }
    }
  }
  return { schemaVersion: 1, entries }
}

function parseReadingProgress(stored: string | null): ReadingProgress | null {
  if (!stored) return null
  let value: unknown
  try {
    value = JSON.parse(stored)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  if (
    !Number.isInteger(value.pageIndex) ||
    Number(value.pageIndex) < 0 ||
    (value.mode !== 'paged' && value.mode !== 'scroll') ||
    typeof value.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    (
      value.state !== undefined &&
      value.state !== 'reading' &&
      value.state !== 'completed'
    )
  ) return null
  return {
    pageIndex: Number(value.pageIndex),
    mode: value.mode,
    state: value.state ?? 'reading',
    updatedAt: value.updatedAt,
  }
}

function isRecentReadingEntry(value: unknown): value is RecentReadingEntry {
  if (!isRecord(value) || !isMangaSummary(value.manga)) return false
  if (!Number.isInteger(value.pageCount) || Number(value.pageCount) < 0) return false
  if (value.hiddenFromRecent !== undefined && typeof value.hiddenFromRecent !== 'boolean') {
    return false
  }
  return parseReadingProgress(JSON.stringify(value)) !== null
}

function isMangaSummary(value: unknown): value is MangaSummary {
  return isRecord(value) &&
    typeof value.uuid === 'string' &&
    typeof value.displayTitle === 'string' &&
    typeof value.originalTitle === 'string' &&
    (value.publishDate === null || typeof value.publishDate === 'string') &&
    (value.cover === null || Number.isInteger(value.cover)) &&
    typeof value.createAt === 'string' &&
    typeof value.updateAt === 'string'
}

function keepCompletedState(
  previous: RecentReadingEntry | undefined,
  pageCount: number,
  pageIndex: number,
): boolean {
  return previous?.state === 'completed' &&
    previous.pageCount === pageCount &&
    pageIndex >= Math.max(0, pageCount - 1)
}

function readingProgressFromEntry(entry: RecentReadingEntry): ReadingProgress {
  return {
    pageIndex: entry.pageIndex,
    mode: entry.mode,
    state: entry.state,
    updatedAt: entry.updatedAt,
  }
}

function cloneMangaSummary(manga: MangaSummary): MangaSummary {
  return {
    uuid: manga.uuid,
    displayTitle: manga.displayTitle,
    originalTitle: manga.originalTitle,
    publishDate: manga.publishDate,
    cover: manga.cover,
    createAt: manga.createAt,
    updateAt: manga.updateAt,
  }
}

function progressIdentity(serverUrl: string, userUuid: string): string {
  return `${encodeURIComponent(serverUrl)}:${encodeURIComponent(userUuid)}`
}

function progressKey(serverUrl: string, userUuid: string, mangaUuid: string): string {
  return [
    PROGRESS_KEY_PREFIX,
    progressIdentity(serverUrl, userUuid),
    encodeURIComponent(mangaUuid),
  ].join(':')
}

function progressIndexKey(serverUrl: string, userUuid: string): string {
  return [PROGRESS_INDEX_KEY_PREFIX, progressIdentity(serverUrl, userUuid)].join(':')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
