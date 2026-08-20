export type ReaderMode = 'paged' | 'scroll'

export interface ReaderPageLayout {
  index: number
  offset: number
  length: number
}

export type ReaderPageDirection = 'ltr' | 'rtl'

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

export function resolveInitialReaderMode(
  requestedMode: string | undefined,
  progressMode: ReaderMode | undefined,
  defaultMode: ReaderMode,
): ReaderMode {
  return parseReaderMode(requestedMode) ?? progressMode ?? defaultMode
}

export function pageIndexesForDirection(
  pageCount: number,
  direction: ReaderPageDirection,
): number[] {
  const indexes = Array.from({ length: Math.max(0, pageCount) }, (_, index) => index)
  return direction === 'rtl' ? indexes.reverse() : indexes
}

export function displayIndexForPage(
  pageIndex: number,
  pageCount: number,
  direction: ReaderPageDirection,
): number {
  const clamped = clampPageIndex(pageIndex, pageCount)
  return direction === 'rtl' ? Math.max(0, pageCount - 1 - clamped) : clamped
}

export function pageDeltaForTap(
  direction: ReaderPageDirection,
  side: 'left' | 'right',
): -1 | 1 {
  if (direction === 'rtl') return side === 'left' ? 1 : -1
  return side === 'left' ? -1 : 1
}

export function buildScrollingPageLayouts(
  aspectRatios: number[],
  imageWidth: number,
  gap: number,
): ReaderPageLayout[] {
  let offset = 0
  return aspectRatios.map((ratio, index) => {
    const pageGap = index === aspectRatios.length - 1 ? 0 : Math.max(0, gap)
    const length = imageWidth / ratio + pageGap
    const layout = { index, length, offset }
    offset += length
    return layout
  })
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
    if (layout === undefined) {
      high = middle
      continue
    }
    if (center < layout.offset + layout.length) high = middle
    else low = middle + 1
  }
  return low
}
