import type { ReaderMode } from '@/utils/reader'

export type ReaderTelemetryEvent =
  | {
      type: 'first-page-display' | 'page-stall'
      mode: ReaderMode
      pageIndex: number
      durationMs: number
    }
  | {
      type: 'page-failure' | 'page-retry'
      mode: ReaderMode
      pageIndex: number
      attempt: number
    }

export type ReaderTelemetryReporter = (event: ReaderTelemetryEvent) => void

const PAGE_STALL_THRESHOLD_MS = 300
let reporter: ReaderTelemetryReporter | null = null

export function reportVisiblePageLoad(
  mode: ReaderMode,
  pageIndex: number,
  durationMs: number,
  firstPage: boolean,
): void {
  const normalizedDuration = Math.max(0, Math.round(durationMs))
  if (firstPage) {
    reportReaderTelemetry({
      type: 'first-page-display',
      mode,
      pageIndex,
      durationMs: normalizedDuration,
    })
  }
  if (normalizedDuration >= PAGE_STALL_THRESHOLD_MS) {
    reportReaderTelemetry({
      type: 'page-stall',
      mode,
      pageIndex,
      durationMs: normalizedDuration,
    })
  }
}

export function reportReaderTelemetry(event: ReaderTelemetryEvent): void {
  try { reporter?.(event) } catch {}
}

export function setReaderTelemetryReporter(
  nextReporter: ReaderTelemetryReporter | null,
): () => void {
  reporter = nextReporter
  return () => {
    if (reporter === nextReporter) reporter = null
  }
}
