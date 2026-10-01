export function clampReaderPage(page: number, count: number): number {
  return Math.max(0, Math.min(Number.isFinite(page) ? Math.trunc(page) : 0, count - 1))
}

export function resolveReaderPosition(params: URLSearchParams, saved: { pageIndex: number; mode: 'paged' | 'scroll'; deleted?: boolean } | undefined, count: number) {
  return {
    page: clampReaderPage(params.has('page') ? Number(params.get('page')) : saved && !saved.deleted ? saved.pageIndex : 0, count),
    mode: (params.has('mode') ? params.get('mode') === 'scroll' ? 'scroll' : 'flip'
      : saved && !saved.deleted && saved.mode === 'scroll' ? 'scroll' : 'flip') as 'flip' | 'scroll',
  }
}

export function visibleReaderPage(bounds: { top: number; bottom: number }[], height: number, toolbar = 48): number | null {
  const line = toolbar + Math.max(0, height - toolbar) * 0.25
  const index = bounds.findIndex(rect => rect.bottom > line && rect.top < height)
  return index < 0 ? null : index
}
