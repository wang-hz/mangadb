export type ImportStatus = 'pending' | 'uploading' | 'paused' | 'processing' | 'done' | 'error'

export interface ImportStatusSummary {
  total: number
  pending: number
  active: number
  success: number
  failed: number
}

export function summarizeImportStatuses(statuses: ImportStatus[]): ImportStatusSummary {
  return statuses.reduce<ImportStatusSummary>((summary, status) => {
    summary.total += 1
    if (status === 'pending' || status === 'paused') summary.pending += 1
    else if (status === 'uploading' || status === 'processing') summary.active += 1
    else if (status === 'done') summary.success += 1
    else if (status === 'error') summary.failed += 1
    return summary
  }, { total: 0, pending: 0, active: 0, success: 0, failed: 0 })
}
