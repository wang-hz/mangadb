import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useKeepAwake } from 'expo-keep-awake'
import { StatusBar } from 'expo-status-bar'
import { AppState, StyleSheet, View } from 'react-native'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { PagedReader } from '@/components/reader/PagedReader'
import { ReaderSettingsModal } from '@/components/reader/ReaderSettingsModal'
import { ScrollingReader } from '@/components/reader/ScrollingReader'
import { useStableViewport } from '@/hooks/useStableViewport'
import { useReaderCompletion } from '@/hooks/useReaderCompletion'
import { ReadingProgressWriter } from '@/storage/progressWriter'
import type { ReaderPreferences } from '@/storage/readerPreferences'
import { colors } from '@/theme/colors'
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
  onReturnToList: () => void
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
  onReturnToList,
  initialCompleted = false,
}: ReaderExperienceProps) {
  const viewport = useStableViewport()
  const [pageIndex, setPageIndex] = useState(initialPageIndex)
  const [mode, setMode] = useState<ReaderMode>(initialMode)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [readingRun, setReadingRun] = useState(0)
  const pageIndexRef = useRef(initialPageIndex)
  const modeRef = useRef<ReaderMode>(initialMode)
  const initialStateRef = useRef({ pageIndex: initialPageIndex, mode: initialMode })
  const mangaRef = useRef(manga)
  const pageCountRef = useRef(manga.pages.length)
  const onReaderReadyRef = useRef(onReaderReady)
  mangaRef.current = manga
  onReaderReadyRef.current = onReaderReady
  const progressWriter = useMemo(() => new ReadingProgressWriter(), [
    manga.uuid,
    serverUrl,
    userUuid,
  ])

  const persist = useCallback((nextPageIndex: number, nextMode: ReaderMode) => {
    const latestManga = mangaRef.current
    progressWriter.schedule({
      serverUrl,
      userUuid,
      mangaUuid: latestManga.uuid,
      pageCount: latestManga.pages.length,
      pageIndex: nextPageIndex,
      mode: nextMode,
      manga: latestManga,
    })
  }, [progressWriter, serverUrl, userUuid])

  useEffect(() => {
    persist(initialStateRef.current.pageIndex, initialStateRef.current.mode)
    void progressWriter.flush().catch(() => {})
    onReaderReadyRef.current()
    return () => { void progressWriter.flush().catch(() => {}) }
  }, [persist, progressWriter])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        setSettingsVisible(false)
        void progressWriter.flush().catch(() => {})
      }
    })
    return () => subscription.remove()
  }, [progressWriter])

  useEffect(() => {
    if (viewport.isTransitioning) setSettingsVisible(false)
  }, [viewport.isTransitioning])

  const currentPageIndex = clampPageIndex(pageIndex, manga.pages.length)

  useEffect(() => {
    if (pageCountRef.current === manga.pages.length) return
    pageCountRef.current = manga.pages.length
    const clamped = clampPageIndex(pageIndexRef.current, manga.pages.length)
    if (clamped === pageIndexRef.current) return
    pageIndexRef.current = clamped
    setPageIndex(clamped)
    persist(clamped, modeRef.current)
  }, [manga.pages.length, persist])

  const completion = useReaderCompletion({
    manga, serverUrl, userUuid, pageIndex: currentPageIndex, mode,
    initialCompleted: initialCompleted && initialPageIndex === manga.pages.length - 1,
    writer: progressWriter,
    onRestart: () => {
      pageIndexRef.current = 0
      setPageIndex(0)
      setReadingRun(value => value + 1)
    },
  })

  const changePage = useCallback((nextPageIndex: number) => {
    if (completion.restarting.current) return
    const clamped = clampPageIndex(nextPageIndex, manga.pages.length)
    if (clamped === pageIndexRef.current) return
    pageIndexRef.current = clamped
    setPageIndex(clamped)
    persist(clamped, modeRef.current)
  }, [manga.pages.length, persist, completion.restarting])

  const changeMode = useCallback((nextMode: ReaderMode) => {
    if (completion.restarting.current || nextMode === modeRef.current) return
    modeRef.current = nextMode
    setMode(nextMode)
    persist(pageIndexRef.current, nextMode)
  }, [persist, completion.restarting])

  const commonProps = {
    api,
    completed: completion.completed,
    completionPending: completion.pending,
    completionError: completion.error,
    onReread: completion.reread,
    manga,
    localPageUris,
    mode,
    onBack,
    onMarkCompleted: completion.complete,
    onRefreshMetadata,
    onModeChange: changeMode,
    onPageChange: changePage,
    pageIndex: currentPageIndex,
    serverUrl,
    userUuid,
    preferences,
    settingsVisible,
    viewport,
    onOpenSettings: () => setSettingsVisible(true),
    onReturnToDetail,
    onReturnToList,
  }

  const reader = viewport.isTransitioning
    ? (
        <View style={styles.viewportTransition} testID="reader-viewport-transition">
          <StatusBar hidden style="light" />
        </View>
      )
    : mode === 'paged'
      ? (
          <PagedReader
            {...commonProps}
            key={`paged:${viewport.epoch}:${manga.pages.length}:${readingRun}`}
          />
        )
      : (
          <ScrollingReader
            {...commonProps}
            key={`scroll:${viewport.epoch}:${manga.pages.length}:${readingRun}`}
          />
        )

  return (
    <View style={styles.root}>
      {preferences.keepAwake ? <ReaderWakeLock /> : null}
      {reader}
      <ReaderSettingsModal
        onClose={() => setSettingsVisible(false)}
        onDefaultModeChange={changeMode}
        visible={settingsVisible && !viewport.isTransitioning}
      />
    </View>
  )
}

function ReaderWakeLock() {
  useKeepAwake('mangadb-reader')
  return null
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.reader,
  },
  viewportTransition: {
    flex: 1,
    backgroundColor: colors.reader,
  },
})
