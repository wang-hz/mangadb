import { useCallback, useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'

type PageSizeKey = 'mangaListPageSize' | 'tagListPageSize' | 'tagMangaListPageSize'

function parsePageSize(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined
  const size = Number(value)
  return Number.isSafeInteger(size) && size > 0 ? size : undefined
}

export function usePageSize(
  storageKey: PageSizeKey,
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
) {
  const [savedSize, setSavedSize] = useState(() => {
    try {
      return parsePageSize(localStorage.getItem(storageKey)) ?? 10
    } catch {
      return 10
    }
  })
  const pageSize = parsePageSize(searchParams.get('limit')) ?? savedSize

  const handlePageChange = useCallback((page: number, size: number) => {
    const sizeChanged = size !== pageSize
    if (sizeChanged) {
      setSavedSize(size)
      try {
        localStorage.setItem(storageKey, String(size))
      } catch {
        // Keep pagination usable when browser storage is unavailable.
      }
    }
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('page', String(sizeChanged ? 1 : page))
      if (sizeChanged) next.set('limit', String(size))
      return next
    }, { replace: true })
  }, [pageSize, setSearchParams, storageKey])

  return [pageSize, handlePageChange] as const
}
