export function clampPageIndex(pageIndex: number, pageCount: number): number {
  if (pageCount <= 0 || !Number.isFinite(pageIndex)) return 0
  return Math.min(pageCount - 1, Math.max(0, Math.trunc(pageIndex)))
}

export function parsePageIndexParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  return raw && /^\d+$/.test(raw) ? Number(raw) : 0
}
