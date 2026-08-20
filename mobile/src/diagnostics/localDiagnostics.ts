import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { setReaderTelemetryReporter } from '@/components/reader/telemetry'
import { setDownloadTelemetryReporter } from '@/downloads/telemetry'

const STORAGE_KEY = 'mangadb.localDiagnostics.v1'
const MAX_RECORDS = 50

export type DiagnosticCategory =
  | 'js-error'
  | 'reader'
  | 'download'
  | 'network'
  | 'storage'

export interface LocalDiagnosticRecord {
  schemaVersion: 1
  id: string
  timestamp: string
  appVersion: string
  platform: string
  category: DiagnosticCategory
  code: string
  route: string
  viewport: string
  downloadState?: string
}

interface DiagnosticContext {
  route: string
  viewport: string
}

let context: DiagnosticContext = { route: 'unknown', viewport: 'unknown' }
let writeQueue: Promise<void> = Promise.resolve()
let sequence = 0

export function setDiagnosticContext(next: Partial<DiagnosticContext>): void {
  context = {
    route: next.route === undefined ? context.route : sanitizeRoute(next.route),
    viewport: next.viewport === undefined ? context.viewport : safeToken(next.viewport),
  }
}

export function viewportBucket(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'unknown'
  }
  const orientation = width > height ? 'landscape' : 'portrait'
  const bucketWidth = Math.max(100, Math.round(width / 100) * 100)
  const bucketHeight = Math.max(100, Math.round(height / 100) * 100)
  return `${orientation}-${bucketWidth}x${bucketHeight}`
}

export function recordDiagnostic(
  category: DiagnosticCategory,
  code: string,
  details: { downloadState?: string } = {},
): Promise<void> {
  const capturedContext = { ...context }
  const record: LocalDiagnosticRecord = {
    schemaVersion: 1,
    id: `${Date.now().toString(36)}-${(sequence += 1).toString(36)}`,
    timestamp: new Date().toISOString(),
    appVersion: safeToken(Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? 'unknown'),
    platform: safeToken(Platform.OS),
    category,
    code: safeToken(code),
    route: capturedContext.route,
    viewport: capturedContext.viewport,
    ...(details.downloadState
      ? { downloadState: safeToken(details.downloadState) }
      : {}),
  }
  const operation = writeQueue.catch(() => {}).then(async () => {
    const records = await readDiagnosticsUnsafe()
    records.push(record)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS)))
  })
  writeQueue = operation.catch(() => {})
  return operation
}

export async function loadDiagnostics(): Promise<LocalDiagnosticRecord[]> {
  await writeQueue
  return readDiagnosticsUnsafe()
}

export async function clearDiagnostics(): Promise<void> {
  const operation = writeQueue.catch(() => {}).then(() => AsyncStorage.removeItem(STORAGE_KEY))
  writeQueue = operation.catch(() => {})
  await operation
}

export function installLocalDiagnosticReporters(): () => void {
  const removeReaderReporter = setReaderTelemetryReporter(event => {
    if (event.type === 'first-page-display' || event.type === 'page-retry') return
    void recordDiagnostic('reader', `${event.type}.${event.mode}`).catch(() => {})
  })
  setDownloadTelemetryReporter(event => {
    if (event.outcome === 'completed') return
    void recordDiagnostic('download', 'page-transfer', {
      downloadState: event.failureCode ?? event.outcome,
    }).catch(() => {})
  })
  return () => {
    removeReaderReporter()
    setDownloadTelemetryReporter(null)
  }
}

function safeToken(value: string): string {
  const normalized = value.trim().slice(0, 64)
  return /^[a-z0-9._:-]+$/i.test(normalized) ? normalized : 'unknown'
}

function sanitizeRoute(route: string): string {
  const allowed = new Set([
    'app', 'tabs', 'reader', 'manga', 'tag', 'downloads', 'mangas', 'tags',
    'settings', 'login', 'connect', 'index',
  ])
  const segments = route.split('/').filter(Boolean).map(segment => {
    const normalized = segment.replace(/[()]/g, '')
    return allowed.has(normalized) ? normalized : ':id'
  })
  return segments.length > 0 ? `/${segments.join('/')}` : '/'
}

async function readDiagnosticsUnsafe(): Promise<LocalDiagnosticRecord[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  return value.filter(isDiagnosticRecord).slice(-MAX_RECORDS)
}

function isDiagnosticRecord(value: unknown): value is LocalDiagnosticRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Partial<LocalDiagnosticRecord>
  return record.schemaVersion === 1 &&
    typeof record.id === 'string' &&
    typeof record.timestamp === 'string' &&
    typeof record.appVersion === 'string' &&
    typeof record.platform === 'string' &&
    isDiagnosticCategory(record.category) &&
    typeof record.code === 'string' &&
    typeof record.route === 'string' &&
    typeof record.viewport === 'string' &&
    (record.downloadState === undefined || typeof record.downloadState === 'string')
}

function isDiagnosticCategory(value: unknown): value is DiagnosticCategory {
  return value === 'js-error' || value === 'reader' || value === 'download' ||
    value === 'network' || value === 'storage'
}
