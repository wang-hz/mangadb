import AsyncStorage from '@react-native-async-storage/async-storage'
import { clampPageIndex, type ReaderMode } from '@/utils/reader'

const PROGRESS_KEY_PREFIX = 'mangadb.readingProgress.v1'
const writeQueues = new Map<string, Promise<void>>()

export interface ReadingProgress {
  pageIndex: number
  mode: ReaderMode
  updatedAt: string
}

export async function loadReadingProgress(
  serverUrl: string,
  userUuid: string,
  mangaUuid: string,
  pageCount: number,
): Promise<ReadingProgress | null> {
  const key = progressKey(serverUrl, userUuid, mangaUuid)
  await writeQueues.get(key)?.catch(() => {})
  const stored = await AsyncStorage.getItem(key)
  if (!stored) return null

  let value: unknown
  try {
    value = JSON.parse(stored)
  } catch {
    return null
  }
  if (!isReadingProgress(value)) return null

  const pageIndex = clampPageIndex(value.pageIndex, pageCount)
  if (pageIndex !== value.pageIndex) {
    const clamped = { ...value, pageIndex }
    try { await enqueueWrite(key, JSON.stringify(clamped)) } catch {}
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
): Promise<ReadingProgress> {
  const progress: ReadingProgress = {
    pageIndex: clampPageIndex(pageIndex, pageCount),
    mode,
    updatedAt: new Date().toISOString(),
  }
  const key = progressKey(serverUrl, userUuid, mangaUuid)
  await enqueueWrite(key, JSON.stringify(progress))
  return progress
}

function enqueueWrite(key: string, value: string): Promise<void> {
  const operation = (writeQueues.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(() => AsyncStorage.setItem(key, value))
  writeQueues.set(key, operation)
  void operation.finally(() => {
    if (writeQueues.get(key) === operation) writeQueues.delete(key)
  }).catch(() => {})
  return operation
}

function progressKey(serverUrl: string, userUuid: string, mangaUuid: string): string {
  return [
    PROGRESS_KEY_PREFIX,
    encodeURIComponent(serverUrl),
    encodeURIComponent(userUuid),
    encodeURIComponent(mangaUuid),
  ].join(':')
}

function isReadingProgress(value: unknown): value is ReadingProgress {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const progress = value as Partial<ReadingProgress>
  return Number.isInteger(progress.pageIndex) &&
    Number(progress.pageIndex) >= 0 &&
    (progress.mode === 'paged' || progress.mode === 'scroll') &&
    typeof progress.updatedAt === 'string' &&
    Number.isFinite(Date.parse(progress.updatedAt))
}
