import { useState } from 'react'

type ViewMode = 'list' | 'grid'

const VIEW_MODE_KEY = 'mangaViewMode'

export function useViewMode() {
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null) ?? 'list',
  )

  const setViewModeAndPersist = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem(VIEW_MODE_KEY, mode)
  }

  return [viewMode, setViewModeAndPersist] as const
}