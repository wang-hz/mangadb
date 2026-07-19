export type ReaderMode = 'paged' | 'scroll'

export interface ReaderPageLayout {
  offset: number
  length: number
}

export function clampPageIndex(pageIndex: number, pageCount: number): number {
  if (pageCount <= 0 || !Number.isFinite(pageIndex)) return 0
  return Math.min(pageCount - 1, Math.max(0, Math.trunc(pageIndex)))
}

export function parsePageIndexParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  return raw && /^\d+$/.test(raw) ? Number(raw) : 0
}

export function parseReaderMode(value: string | string[] | undefined): ReaderMode | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === 'scroll') return 'scroll'
  if (raw === 'paged' || raw === 'flip') return 'paged'
  return undefined
}

export function pageIndexAtViewportCenter(
  layouts: ReaderPageLayout[],
  scrollOffset: number,
  viewportHeight: number,
): number {
  if (layouts.length === 0) return 0
  const center = Math.max(0, scrollOffset) + Math.max(0, viewportHeight) / 2
  let low = 0
  let high = layouts.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const layout = layouts[middle]
    if (center < layout.offset + layout.length) high = middle
    else low = middle + 1
  }
  return low
}
