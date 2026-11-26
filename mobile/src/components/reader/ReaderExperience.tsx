import { synchronizeProgress } from '@/sync/registry'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useKeepAwake } from 'expo-keep-awake'
import { StatusBar } from 'expo-status-bar'
import { AppState, StyleSheet, View } from 'react-native'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { PagedReader } from '@/components/reader/PagedReader'
import { ReaderInfoModal } from '@/components/reader/ReaderInfoModal'
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
  const [activeModal, setActiveModal] = useState<'settings' | 'info' | null>(null)
  const returnRevision = useRef(0)
  const closeModal = useCallback(() => {
    returnRevision.current += 1
    setActiveModal(null)
  }, [])
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
    return () => {
      returnRevision.current += 1
      void progressWriter.flush().then(() => synchronizeProgress(serverUrl, userUuid, true)).catch(() => {})
    }
  }, [persist, progressWriter])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        closeModal()
        void progressWriter.flush().then(() => synchronizeProgress(serverUrl, userUuid, true)).catch(() => {})
      }
    })
    return () => subscription.remove()
  }, [progressWriter, closeModal])

  useEffect(() => {
    if (viewport.isTransitioning) closeModal()
  }, [viewport.isTransitioning, closeModal])

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
  })

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

  const returnFromInfo = async (destination: 'detail' | 'list') => {
    const revision = returnRevision.current
    // A fresh write also makes retry possible after a previous flush failed.
    persist(pageIndexRef.current, modeRef.current)
    await progressWriter.flush()
    if (pageIndexRef.current === mangaRef.current.pages.length - 1) {
      await completion.complete()
    }
    if (revision !== returnRevision.current) return
    closeModal()
    if (destination === 'detail') onReturnToDetail()
    else onReturnToList()
  }

  const commonProps = {
    api,
    manga,
    localPageUris,
    mode,
    onBack,
    onRefreshMetadata,
    onPageChange: changePage,
    pageIndex: currentPageIndex,
    serverUrl,
    userUuid,
    preferences,
    modalVisible: activeModal !== null,
    viewport,
    onOpenSettings: () => setActiveModal('settings'),
    onOpenInfo: () => setActiveModal('info'),
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
            key={`paged:${viewport.epoch}:${manga.pages.length}`}
          />
        )
      : (
          <ScrollingReader
            {...commonProps}
            key={`scroll:${viewport.epoch}:${manga.pages.length}`}
          />
        )

  return (
    <View style={styles.root}>
      {preferences.keepAwake ? <ReaderWakeLock /> : null}
      {reader}
      <ReaderSettingsModal
        currentMode={mode}
        onClose={closeModal}
        onDefaultModeChange={changeMode}
        visible={activeModal === 'settings' && !viewport.isTransitioning}
      />
      <ReaderInfoModal
        manga={manga}
        onClose={closeModal}
        onReturnToDetail={() => returnFromInfo('detail')}
        onReturnToList={() => returnFromInfo('list')}
        visible={activeModal === 'info' && !viewport.isTransitioning}
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
