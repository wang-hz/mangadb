import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useKeepAwake } from 'expo-keep-awake'
import { AppState } from 'react-native'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { PagedReader } from '@/components/reader/PagedReader'
import { ReaderSettingsModal } from '@/components/reader/ReaderSettingsModal'
import { ScrollingReader } from '@/components/reader/ScrollingReader'
import { markMangaCompleted } from '@/storage/progress'
import { ReadingProgressWriter } from '@/storage/progressWriter'
import type { ReaderPreferences } from '@/storage/readerPreferences'
import { clampPageIndex, type ReaderMode } from '@/utils/reader'

interface ReaderExperienceProps {
  manga: MangaDetail
  api: ApiClient
  serverUrl: string
  userUuid: string
  initialPageIndex: number
  initialMode: ReaderMode
  preferences: ReaderPreferences
  localPageUris?: readonly string[]
  onBack: () => void
  onRefreshMetadata: () => Promise<void>
  onReaderReady: () => void
  onReturnToDetail: () => void
  initialCompleted?: boolean
}

export function ReaderExperience({
  manga,
  api,
  serverUrl,
  userUuid,
  initialPageIndex,
  initialMode,
  preferences,
  localPageUris,
  onBack,
  onRefreshMetadata,
  onReaderReady,
  onReturnToDetail,
  initialCompleted = false,
}: ReaderExperienceProps) {
  const [pageIndex, setPageIndex] = useState(initialPageIndex)
  const [mode, setMode] = useState<ReaderMode>(initialMode)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [completed, setCompleted] = useState(initialCompleted)
  const pageIndexRef = useRef(initialPageIndex)
  const modeRef = useRef<ReaderMode>(initialMode)
  const initialStateRef = useRef({ pageIndex: initialPageIndex, mode: initialMode })
  const progressWriter = useMemo(() => new ReadingProgressWriter(), [
    manga.uuid,
    serverUrl,
    userUuid,
  ])

  const persist = useCallback((nextPageIndex: number, nextMode: ReaderMode) => {
    progressWriter.schedule({
      serverUrl,
      userUuid,
      mangaUuid: manga.uuid,
      pageCount: manga.pages.length,
      pageIndex: nextPageIndex,
      mode: nextMode,
      manga,
    })
  }, [manga, progressWriter, serverUrl, userUuid])

  useEffect(() => {
    persist(initialStateRef.current.pageIndex, initialStateRef.current.mode)
    void progressWriter.flush().catch(() => {})
    onReaderReady()
    return () => { void progressWriter.flush().catch(() => {}) }
  }, [persist, onReaderReady, progressWriter])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') void progressWriter.flush().catch(() => {})
    })
    return () => subscription.remove()
  }, [progressWriter])

  const changePage = useCallback((nextPageIndex: number) => {
    const clamped = clampPageIndex(nextPageIndex, manga.pages.length)
    if (clamped === pageIndexRef.current) return
    pageIndexRef.current = clamped
    setPageIndex(clamped)
    if (clamped < manga.pages.length - 1) setCompleted(false)
    persist(clamped, modeRef.current)
  }, [manga.pages.length, persist])

  const complete = useCallback(async () => {
    progressWriter.cancel()
    await markMangaCompleted(
      serverUrl,
      userUuid,
      manga,
      manga.pages.length,
      modeRef.current,
    )
    setCompleted(true)
  }, [manga, progressWriter, serverUrl, userUuid])

  const changeMode = useCallback((nextMode: ReaderMode) => {
    if (nextMode === modeRef.current) return
    modeRef.current = nextMode
    setMode(nextMode)
    persist(pageIndexRef.current, nextMode)
  }, [persist])

  const commonProps = {
    api,
    completed,
    manga,
    localPageUris,
    mode,
    onBack,
    onMarkCompleted: complete,
    onRefreshMetadata,
    onModeChange: changeMode,
    onPageChange: changePage,
    pageIndex,
    serverUrl,
    userUuid,
    preferences,
    settingsVisible,
    onOpenSettings: () => setSettingsVisible(true),
    onReturnToDetail,
  }

  const reader = mode === 'paged'
    ? <PagedReader {...commonProps} />
    : <ScrollingReader {...commonProps} />

  return (
    <>
      {preferences.keepAwake ? <ReaderWakeLock /> : null}
      {reader}
      <ReaderSettingsModal
        onClose={() => setSettingsVisible(false)}
        onDefaultModeChange={changeMode}
        visible={settingsVisible}
      />
    </>
  )
}

function ReaderWakeLock() {
  useKeepAwake('mangadb-reader')
  return null
}
