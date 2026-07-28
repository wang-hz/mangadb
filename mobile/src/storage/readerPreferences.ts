import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ReaderMode } from '@/utils/reader'

const READER_PREFERENCES_KEY = 'mangadb.readerPreferences.v1'
let writeQueue: Promise<void> = Promise.resolve()

export type PagedDirection = 'ltr' | 'rtl'
export type PagedFit = 'contain' | 'cover'
export type ScrollGap = 0 | 8 | 16
export type ControlsAutoHideMs = 3000 | 5000 | null
export type ReaderDimLevel = 0 | 0.2 | 0.4

export interface ReaderPreferences {
  defaultMode: ReaderMode
  pagedDirection: PagedDirection
  pagedFit: PagedFit
  scrollGap: ScrollGap
  controlsAutoHideMs: ControlsAutoHideMs
  keepAwake: boolean
  readerDimLevel: ReaderDimLevel
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  defaultMode: 'paged',
  pagedDirection: 'ltr',
  pagedFit: 'contain',
  scrollGap: 0,
  controlsAutoHideMs: 3000,
  keepAwake: false,
  readerDimLevel: 0,
}

export async function loadReaderPreferences(): Promise<ReaderPreferences> {
  await writeQueue.catch(() => {})
  const stored = await AsyncStorage.getItem(READER_PREFERENCES_KEY)
  if (!stored) return { ...DEFAULT_READER_PREFERENCES }

  try {
    return normalizeReaderPreferences(JSON.parse(stored))
  } catch {
    return { ...DEFAULT_READER_PREFERENCES }
  }
}

export async function saveReaderPreferences(
  preferences: ReaderPreferences,
): Promise<ReaderPreferences> {
  const normalized = normalizeReaderPreferences(preferences)
  const operation = writeQueue
    .catch(() => {})
    .then(() => AsyncStorage.setItem(READER_PREFERENCES_KEY, JSON.stringify(normalized)))
  writeQueue = operation
  await operation
  return normalized
}

function normalizeReaderPreferences(value: unknown): ReaderPreferences {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...DEFAULT_READER_PREFERENCES }
  }
  const stored = value as Partial<ReaderPreferences>
  return {
    defaultMode: stored.defaultMode === 'paged' || stored.defaultMode === 'scroll'
      ? stored.defaultMode
      : DEFAULT_READER_PREFERENCES.defaultMode,
    pagedDirection: stored.pagedDirection === 'ltr' || stored.pagedDirection === 'rtl'
      ? stored.pagedDirection
      : DEFAULT_READER_PREFERENCES.pagedDirection,
    pagedFit: stored.pagedFit === 'contain' || stored.pagedFit === 'cover'
      ? stored.pagedFit
      : DEFAULT_READER_PREFERENCES.pagedFit,
    scrollGap: stored.scrollGap === 0 || stored.scrollGap === 8 || stored.scrollGap === 16
      ? stored.scrollGap
      : DEFAULT_READER_PREFERENCES.scrollGap,
    controlsAutoHideMs: stored.controlsAutoHideMs === 3000 ||
      stored.controlsAutoHideMs === 5000 || stored.controlsAutoHideMs === null
      ? stored.controlsAutoHideMs
      : DEFAULT_READER_PREFERENCES.controlsAutoHideMs,
    keepAwake: typeof stored.keepAwake === 'boolean'
      ? stored.keepAwake
      : DEFAULT_READER_PREFERENCES.keepAwake,
    readerDimLevel: stored.readerDimLevel === 0 ||
      stored.readerDimLevel === 0.2 || stored.readerDimLevel === 0.4
      ? stored.readerDimLevel
      : DEFAULT_READER_PREFERENCES.readerDimLevel,
  }
}
