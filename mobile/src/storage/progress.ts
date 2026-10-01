import * as Crypto from 'expo-crypto'
import { calibrate, emptySyncState, mergeRemote, newer, queueOperation, type ProgressOperation, type RemoteProgress, type SyncState, type SyncStore } from '@/sync/protocol'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { MangaSummary } from '@/api/types'
import { clampPageIndex, type ReaderMode } from '@/utils/reader'

const PROGRESS_KEY_PREFIX = 'mangadb.readingProgress.v1'
const PROGRESS_INDEX_V1_KEY_PREFIX = 'mangadb.readingProgressIndex.v1'
const PROGRESS_INDEX_V2_KEY_PREFIX = 'mangadb.readingProgressIndex.v2'
const PROGRESS_DELETION_TOMBSTONE = JSON.stringify({ schemaVersion: 1, deleted: true })
export const RECENT_READING_LIMIT = 100
const identityWriteQueues = new Map<string, Promise<unknown>>()

export type ReadingState = 'reading' | 'completed'

export interface ReadingProgress {
  pageIndex: number
  mode: ReaderMode
  state: ReadingState
  updatedAt: string
}

export interface ReadingProgressEntry extends ReadingProgress {
  mangaUuid: string
  pageCount: number
  hiddenFromRecent: boolean
}

export interface RecentReadingEntry extends ReadingProgress {
  manga: MangaSummary
  pageCount: number
  hiddenFromRecent: boolean
}

interface StoredProgressEntryV2 extends ReadingProgress {
  pageCount: number
  hiddenFromRecent: boolean
}

interface ProgressIndexV2 {
  schemaVersion: 2
  entries: Record<string, StoredProgressEntryV2>
  recentMangas: Record<string, MangaSummary>
  sync: SyncState
}

interface LegacyRecentReadingEntry extends Omit<RecentReadingEntry, 'state' | 'hiddenFromRecent'> {
  state?: ReadingState
  hiddenFromRecent?: boolean
}

interface RestoredReadingProgress extends Omit<ReadingProgress, 'state'> {
  state?: ReadingState
}

interface ProgressIndexV1 {
  schemaVersion: 1
  entries: Record<string, LegacyRecentReadingEntry>
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
  const indexForRead = await loadProgressIndex(serverUrl, userUuid)
  const syncedRecord = indexForRead.sync.records[mangaUuid]
  if (syncedRecord?.deleted) return null
  const value = indexForRead.entries[mangaUuid] ?? parseReadingProgress(stored)
  if (!value) return null

  const pageIndex = clampPageIndex(value.pageIndex, pageCount)
  if (pageIndex !== value.pageIndex) {
    const clamped = { ...value, pageIndex }
    try {
      await enqueueIdentityWrite(identity, async () => {
        const index = await loadProgressIndex(serverUrl, userUuid)
        const indexed = index.entries[mangaUuid]
        if (indexed) {
          index.entries[mangaUuid] = {
            ...indexed,
            pageIndex,
            pageCount: Math.max(0, Math.trunc(pageCount)),
          }
          await AsyncStorage.multiSet([
            [key, JSON.stringify(clamped)],
            [progressIndexV2Key(serverUrl, userUuid), JSON.stringify(index)],
          ])
        } else {
          await AsyncStorage.setItem(key, JSON.stringify(clamped))
        }
      })
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
    const index = await loadProgressIndex(serverUrl, userUuid)
    const previousEntry = index?.entries[mangaUuid]
    const clampedPageIndex = clampPageIndex(pageIndex, pageCount)
    const progress: ReadingProgress = {
      pageIndex: clampedPageIndex,
      mode,
      state: keepCompletedState(previousEntry, pageCount, clampedPageIndex)
        ? 'completed'
        : 'reading',
      updatedAt: progressNow(index, mangaUuid),
    }
    const progressStorageKey = progressKey(serverUrl, userUuid, mangaUuid)
    index.entries[mangaUuid] = {
      ...progress, pageCount: Math.max(0, Math.trunc(pageCount)), hiddenFromRecent: false,
    }
    if (manga) index.recentMangas[mangaUuid] = cloneMangaSummary(manga)
    recordLocalOperation(index, mangaUuid)
    pruneRecentMangas(index)
    await AsyncStorage.multiSet([
      [progressStorageKey, JSON.stringify(progress)],
      [progressIndexV2Key(serverUrl, userUuid), JSON.stringify(index)],
    ])
    notifyProgress(serverUrl, userUuid)
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
  return Object.entries(index.recentMangas)
    .flatMap(([mangaUuid, manga]) => {
      const entry = index.entries[mangaUuid]
      if (!entry || entry.hiddenFromRecent) return []
      return [{ ...entry, manga: cloneMangaSummary(manga) }]
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function listReadingProgress(
  serverUrl: string,
  userUuid: string,
): Promise<ReadingProgressEntry[]> {
  const identity = progressIdentity(serverUrl, userUuid)
  await identityWriteQueues.get(identity)?.catch(() => {})
  const index = await loadProgressIndex(serverUrl, userUuid)
  return Object.entries(index.entries)
    .map(([mangaUuid, entry]) => ({ ...entry, mangaUuid }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function markMangaCompleted(
  serverUrl: string,
  userUuid: string,
  manga: MangaSummary,
  pageCount: number,
  mode: ReaderMode,
): Promise<RecentReadingEntry> {
  return writeMangaReadingState(serverUrl, userUuid, manga, pageCount, mode, 'completed')
}

export async function restartMangaReading(
  serverUrl: string,
  userUuid: string,
  manga: MangaSummary,
  pageCount: number,
  mode: ReaderMode,
): Promise<RecentReadingEntry> {
  return writeMangaReadingState(serverUrl, userUuid, manga, pageCount, mode, 'reading')
}

async function writeMangaReadingState(
  serverUrl: string,
  userUuid: string,
  manga: MangaSummary,
  pageCount: number,
  mode: ReaderMode,
  state: ReadingState,
): Promise<RecentReadingEntry> {
  const identity = progressIdentity(serverUrl, userUuid)
  return enqueueIdentityWrite(identity, async () => {
    const index = await loadProgressIndex(serverUrl, userUuid)
    const now = progressNow(index, manga.uuid)
    const entry: RecentReadingEntry = {
      manga: cloneMangaSummary(manga),
      pageCount: Math.max(0, Math.trunc(pageCount)),
      pageIndex: state === 'completed' ? clampPageIndex(pageCount - 1, pageCount) : 0,
      mode,
      state,
      updatedAt: now,
      hiddenFromRecent: false,
    }
    index.entries[manga.uuid] = progressEntryFromRecent(entry)
    index.recentMangas[manga.uuid] = cloneMangaSummary(manga)
    recordLocalOperation(index, manga.uuid)
    pruneRecentMangas(index)
    await AsyncStorage.multiSet([
      [
        progressKey(serverUrl, userUuid, manga.uuid),
        JSON.stringify(readingProgressFromEntry(entry)),
      ],
      [progressIndexV2Key(serverUrl, userUuid), JSON.stringify(index)],
    ])
    notifyProgress(serverUrl, userUuid)
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
    recordLocalOperation(index, mangaUuid, true)
    delete index.entries[mangaUuid]
    delete index.recentMangas[mangaUuid]
    await AsyncStorage.multiSet([
      [progressKey(serverUrl, userUuid, mangaUuid), PROGRESS_DELETION_TOMBSTONE],
      [progressIndexV2Key(serverUrl, userUuid), JSON.stringify(index)],
    ])
    notifyProgress(serverUrl, userUuid)
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
    index.entries[mangaUuid] = { ...entry, hiddenFromRecent: true, updatedAt: progressNow(index, mangaUuid) }
    recordLocalOperation(index, mangaUuid)
    delete index.recentMangas[mangaUuid]
    await saveProgressIndex(serverUrl, userUuid, index)
    notifyProgress(serverUrl, userUuid)
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
): Promise<ProgressIndexV2> {
  const storedV2 = await AsyncStorage.getItem(progressIndexV2Key(serverUrl, userUuid))
  if (storedV2) {
    try {
      const normalized = normalizeProgressIndexV2(JSON.parse(storedV2))
      if (normalized) return normalized
    } catch {}
  }

  const storedV1 = await AsyncStorage.getItem(progressIndexV1Key(serverUrl, userUuid))
  if (!storedV1) return emptyProgressIndex()
  let value: unknown
  try {
    value = JSON.parse(storedV1)
  } catch {
    return emptyProgressIndex()
  }
  const migrated = migrateProgressIndexV1(value)
  if (!migrated) return emptyProgressIndex()
  await saveProgressIndex(serverUrl, userUuid, migrated)
  try {
    await AsyncStorage.removeItem(progressIndexV1Key(serverUrl, userUuid))
  } catch {}
  return migrated
}

async function saveProgressIndex(
  serverUrl: string,
  userUuid: string,
  index: ProgressIndexV2,
): Promise<void> {
  await AsyncStorage.setItem(
    progressIndexV2Key(serverUrl, userUuid),
    JSON.stringify(index),
  )
}

function emptyProgressIndex(): ProgressIndexV2 {
  return { schemaVersion: 2, entries: {}, recentMangas: {}, sync: emptySyncState() }
}

function normalizeProgressIndexV2(value: unknown): ProgressIndexV2 | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    !isRecord(value.entries) ||
    !isRecord(value.recentMangas)
  ) return null
  const index = emptyProgressIndex()
  if (isRecord(value.sync) && isRecord(value.sync.pending) && isRecord(value.sync.records) &&
      isRecord(value.sync.uncalibrated) && typeof value.sync.imported === 'boolean' &&
      typeof value.sync.calibrated === 'boolean' && typeof value.sync.offset === 'number') {
    index.sync = value.sync as unknown as SyncState
  }
  for (const [mangaUuid, entry] of Object.entries(value.entries)) {
    if (mangaUuid && isStoredProgressEntryV2(entry)) index.entries[mangaUuid] = { ...entry }
  }
  for (const [mangaUuid, manga] of Object.entries(value.recentMangas)) {
    if (
      index.entries[mangaUuid] &&
      !index.entries[mangaUuid].hiddenFromRecent &&
      isMangaSummary(manga) &&
      manga.uuid === mangaUuid
    ) index.recentMangas[mangaUuid] = cloneMangaSummary(manga)
  }
  pruneRecentMangas(index)
  return index
}

function migrateProgressIndexV1(value: unknown): ProgressIndexV2 | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.entries)) return null
  const legacy: ProgressIndexV1 = { schemaVersion: 1, entries: {} }
  for (const [mangaUuid, entry] of Object.entries(value.entries)) {
    if (isRecentReadingEntryV1(entry) && entry.manga.uuid === mangaUuid) {
      legacy.entries[mangaUuid] = entry
    }
  }
  const migrated = emptyProgressIndex()
  Object.entries(legacy.entries).forEach(([mangaUuid, entry]) => {
    migrated.entries[mangaUuid] = {
      pageIndex: entry.pageIndex,
      mode: entry.mode,
      state: entry.state ?? 'reading',
      updatedAt: entry.updatedAt,
      pageCount: entry.pageCount,
      hiddenFromRecent: entry.hiddenFromRecent ?? false,
    }
    if (!entry.hiddenFromRecent) {
      migrated.recentMangas[mangaUuid] = cloneMangaSummary(entry.manga)
    }
  })
  pruneRecentMangas(migrated)
  return migrated
}

function pruneRecentMangas(index: ProgressIndexV2): void {
  const retained = Object.keys(index.recentMangas)
    .filter(mangaUuid => {
      const entry = index.entries[mangaUuid]
      return Boolean(entry && !entry.hiddenFromRecent)
    })
    .sort((a, b) => {
      const updated = (index.entries[b]?.updatedAt ?? '')
        .localeCompare(index.entries[a]?.updatedAt ?? '')
      return updated || a.localeCompare(b)
    })
    .slice(0, RECENT_READING_LIMIT)
  const recentMangas: Record<string, MangaSummary> = {}
  retained.forEach(mangaUuid => {
    const manga = index.recentMangas[mangaUuid]
    if (manga) recentMangas[mangaUuid] = cloneMangaSummary(manga)
  })
  index.recentMangas = recentMangas
}

function parseReadingProgress(stored: string | null): ReadingProgress | null {
  if (!stored) return null
  let value: unknown
  try {
    value = JSON.parse(stored)
  } catch {
    return null
  }
  if (isProgressDeletionTombstone(value)) return null
  if (!isReadingProgress(value)) return null
  return {
    pageIndex: Number(value.pageIndex),
    mode: value.mode,
    state: value.state ?? 'reading',
    updatedAt: value.updatedAt,
  }
}

function isProgressDeletionTombstone(value: unknown): boolean {
  return isRecord(value) && value.schemaVersion === 1 && value.deleted === true
}

function isReadingProgress(value: unknown): value is RestoredReadingProgress {
  return isRecord(value) &&
    Number.isInteger(value.pageIndex) &&
    Number(value.pageIndex) >= 0 &&
    (value.mode === 'paged' || value.mode === 'scroll') &&
    typeof value.updatedAt === 'string' &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    (
      value.state === undefined ||
      value.state === 'reading' ||
      value.state === 'completed'
    )
}

function isStoredProgressEntryV2(value: unknown): value is StoredProgressEntryV2 {
  return isRecord(value) &&
    isReadingProgress(value) &&
    (value.state === 'reading' || value.state === 'completed') &&
    Number.isInteger(value.pageCount) &&
    Number(value.pageCount) >= 0 &&
    typeof value.hiddenFromRecent === 'boolean'
}

function isRecentReadingEntryV1(value: unknown): value is LegacyRecentReadingEntry {
  if (!isRecord(value) || !isMangaSummary(value.manga)) return false
  if (!Number.isInteger(value.pageCount) || Number(value.pageCount) < 0) return false
  if (value.hiddenFromRecent !== undefined && typeof value.hiddenFromRecent !== 'boolean') {
    return false
  }
  return isReadingProgress(value)
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
  previous: StoredProgressEntryV2 | undefined,
  pageCount: number,
  pageIndex: number,
): boolean {
  return previous?.state === 'completed' &&
    previous.pageCount === pageCount &&
    pageIndex >= Math.max(0, pageCount - 1)
}

function progressEntryFromRecent(entry: RecentReadingEntry): StoredProgressEntryV2 {
  return {
    pageIndex: entry.pageIndex,
    mode: entry.mode,
    state: entry.state,
    updatedAt: entry.updatedAt,
    pageCount: entry.pageCount,
    hiddenFromRecent: entry.hiddenFromRecent,
  }
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

function progressIndexV1Key(serverUrl: string, userUuid: string): string {
  return [PROGRESS_INDEX_V1_KEY_PREFIX, progressIdentity(serverUrl, userUuid)].join(':')
}

function progressIndexV2Key(serverUrl: string, userUuid: string): string {
  return [PROGRESS_INDEX_V2_KEY_PREFIX, progressIdentity(serverUrl, userUuid)].join(':')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const progressListeners = new Set<(serverUrl: string, userUuid: string) => void>()
export function subscribeProgress(listener: (serverUrl: string, userUuid: string) => void): () => void {
  progressListeners.add(listener)
  return () => { progressListeners.delete(listener) }
}
function notifyProgress(serverUrl: string, userUuid: string): void {
  for (const listener of progressListeners) {
    try { listener(serverUrl, userUuid) } catch {}
  }
}
function progressNow(index: ProgressIndexV2, mangaUuid: string): string {
  const previous = index.sync.pending[mangaUuid]?.updatedAt ?? index.entries[mangaUuid]?.updatedAt
    ?? index.sync.records[mangaUuid]?.updatedAt
  return new Date(Math.max(Date.now() + index.sync.offset, previous ? Date.parse(previous) + 1 : 0)).toISOString()
}
function recordLocalOperation(index: ProgressIndexV2, mangaUuid: string, deleted = false): void {
  const entry = index.entries[mangaUuid]
  const operation: ProgressOperation = {
    mangaUuid, pageIndex: deleted ? 0 : entry?.pageIndex ?? 0,
    mode: entry?.mode ?? 'paged', state: deleted ? 'reading' : entry?.state ?? 'reading',
    hiddenFromRecent: deleted || (entry?.hiddenFromRecent ?? false), deleted,
    updatedAt: deleted ? progressNow(index, mangaUuid) : entry!.updatedAt,
    operationId: Crypto.randomUUID(),
  }
  queueOperation(index.sync, operation)
  const manga = index.recentMangas[mangaUuid] ?? index.sync.records[mangaUuid]?.manga
  if (manga) index.sync.records[mangaUuid] = { ...operation, manga, pageCount: entry?.pageCount ?? 0 }
}

export function createProgressSyncStore(serverUrl: string, userUuid: string): SyncStore {
  const mutate = <T,>(operation: (index: ProgressIndexV2) => Promise<T> | T): Promise<T> =>
    enqueueIdentityWrite(progressIdentity(serverUrl, userUuid), async () => {
      const index = await loadProgressIndex(serverUrl, userUuid)
      const result = await operation(index)
      // This envelope is authoritative for both progress and its upload queue.
      await saveProgressIndex(serverUrl, userUuid, index)
      notifyProgress(serverUrl, userUuid)
      return result
    })
  return {
    prepare: () => mutate(async index => {
      if (index.sync.imported) return
      // Older standalone per-manga keys may predate the recent-reading index.
      const prefix = `${PROGRESS_KEY_PREFIX}:${progressIdentity(serverUrl, userUuid)}:`
      for (const key of await AsyncStorage.getAllKeys()) {
        if (!key.startsWith(prefix)) continue
        const uuid = decodeURIComponent(key.slice(prefix.length))
        if (index.entries[uuid] || index.sync.pending[uuid]) continue
        const progress = parseReadingProgress(await AsyncStorage.getItem(key))
        if (progress) index.entries[uuid] = { ...progress, pageCount: 0, hiddenFromRecent: false }
      }
      for (const [uuid, entry] of Object.entries(index.entries)) {
        if (index.sync.pending[uuid]) continue
        queueOperation(index.sync, {
          mangaUuid: uuid, pageIndex: entry.pageIndex, mode: entry.mode, state: entry.state,
          updatedAt: entry.updatedAt, hiddenFromRecent: entry.hiddenFromRecent,
          deleted: false, operationId: Crypto.randomUUID(),
        }, true)
      }
      index.sync.imported = true
    }),
    calibrate: serverTime => mutate(index => {
      calibrate(index.sync, serverTime)
      for (const [uuid, pending] of Object.entries(index.sync.pending)) {
        const entry = index.entries[uuid]
        if (entry && !pending.deleted) entry.updatedAt = pending.updatedAt
      }
    }),
    pending: async () => {
      await identityWriteQueues.get(progressIdentity(serverUrl, userUuid))?.catch(() => {})
      return Object.values((await loadProgressIndex(serverUrl, userUuid)).sync.pending)
    },
    apply: (items, sent = [], missing = []) => mutate(async index => {
      for (const item of items) {
        const pending = index.sync.pending[item.mangaUuid]
        const entry = index.entries[item.mangaUuid]
        if (entry && entry.updatedAt > item.updatedAt) continue
        if (!mergeRemote(index.sync, item)) continue
        if (pending && !newer(pending, item)) {
          delete index.sync.pending[item.mangaUuid]
          delete index.sync.uncalibrated[item.mangaUuid]
        }
        if (item.deleted) {
          delete index.entries[item.mangaUuid]
          delete index.recentMangas[item.mangaUuid]
        } else {
          index.entries[item.mangaUuid] = {
            pageIndex: item.pageIndex, mode: item.mode, state: item.state,
            updatedAt: item.updatedAt, pageCount: item.pageCount,
            hiddenFromRecent: item.hiddenFromRecent,
          }
          if (item.hiddenFromRecent) delete index.recentMangas[item.mangaUuid]
          else index.recentMangas[item.mangaUuid] = cloneMangaSummary(item.manga)
        }
      }
      for (const operation of sent) {
        if (!missing.includes(operation.mangaUuid)) continue
        if (index.sync.pending[operation.mangaUuid]?.operationId !== operation.operationId) continue
        delete index.sync.pending[operation.mangaUuid]
        delete index.sync.records[operation.mangaUuid]
        delete index.sync.uncalibrated[operation.mangaUuid]
        // Remove the legacy fallback too, so offline metadata cannot revive it.
        await AsyncStorage.removeItem(progressKey(serverUrl, userUuid, operation.mangaUuid))
        delete index.entries[operation.mangaUuid]
        delete index.recentMangas[operation.mangaUuid]
      }
      pruneRecentMangas(index)
    }),
  }
}
