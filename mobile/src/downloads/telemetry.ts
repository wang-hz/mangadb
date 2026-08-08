import type { DownloadFailureCode } from '@/downloads/types'

export type DownloadTelemetryEvent = {
  type: 'page-transfer'
  outcome: 'completed' | 'cancelled' | 'failed'
  pageIndex: number
  bytesWritten: number
  expectedBytes: number | null
  durationMs: number
  failureCode?: DownloadFailureCode
}

type DownloadTelemetryReporter = (event: DownloadTelemetryEvent) => void

let reporter: DownloadTelemetryReporter | null = null

export function setDownloadTelemetryReporter(
  nextReporter: DownloadTelemetryReporter | null,
): void {
  reporter = nextReporter
}

export function reportDownloadTelemetry(event: DownloadTelemetryEvent): void {
  try { reporter?.(event) } catch {}
}
