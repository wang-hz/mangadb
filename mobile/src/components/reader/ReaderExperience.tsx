import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { PagedReader } from '@/components/reader/PagedReader'
import { ScrollingReader } from '@/components/reader/ScrollingReader'
import { saveReadingProgress } from '@/storage/progress'
import { clampPageIndex, type ReaderMode } from '@/utils/reader'

interface ReaderExperienceProps {
  manga: MangaDetail
  api: ApiClient
  serverUrl: string
  userUuid: string
  initialPageIndex: number
  initialMode: ReaderMode
  onBack: () => void
  onImageError: () => void
  onReaderReady: () => void
}

export function ReaderExperience({
  manga,
  api,
  serverUrl,
  userUuid,
  initialPageIndex,
  initialMode,
  onBack,
  onImageError,
  onReaderReady,
}: ReaderExperienceProps) {
  const [pageIndex, setPageIndex] = useState(initialPageIndex)
  const [mode, setMode] = useState<ReaderMode>(initialMode)
  const pageIndexRef = useRef(initialPageIndex)
  const modeRef = useRef<ReaderMode>(initialMode)
  const initialStateRef = useRef({ pageIndex: initialPageIndex, mode: initialMode })

  const persist = useCallback((nextPageIndex: number, nextMode: ReaderMode) => {
    void saveReadingProgress(
      serverUrl,
      userUuid,
      manga.uuid,
      manga.pages.length,
      nextPageIndex,
      nextMode,
    ).catch(() => {})
  }, [serverUrl, userUuid, manga.uuid, manga.pages.length])

  useEffect(() => {
    persist(initialStateRef.current.pageIndex, initialStateRef.current.mode)
    onReaderReady()
  }, [persist, onReaderReady])

  const changePage = useCallback((nextPageIndex: number) => {
    const clamped = clampPageIndex(nextPageIndex, manga.pages.length)
    if (clamped === pageIndexRef.current) return
    pageIndexRef.current = clamped
    setPageIndex(clamped)
    persist(clamped, modeRef.current)
  }, [manga.pages.length, persist])

  const changeMode = useCallback((nextMode: ReaderMode) => {
    if (nextMode === modeRef.current) return
    modeRef.current = nextMode
    setMode(nextMode)
    persist(pageIndexRef.current, nextMode)
  }, [persist])

  const commonProps = {
    api,
    manga,
    mode,
    onBack,
    onImageError,
    onModeChange: changeMode,
    onPageChange: changePage,
    pageIndex,
    serverUrl,
    userUuid,
  }

  return mode === 'paged'
    ? <PagedReader {...commonProps} />
    : <ScrollingReader {...commonProps} />
}
