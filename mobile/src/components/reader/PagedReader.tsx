import { Ionicons } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { ReaderCompletionPanel } from '@/components/reader/ReaderCompletionPanel'
import { ReaderControls } from '@/components/reader/ReaderControls'
import { ZoomableReaderImage } from '@/components/reader/ZoomableReaderImage'
import {
  reportReaderTelemetry,
  reportVisiblePageLoad,
} from '@/components/reader/telemetry'
import { localPageImageSource, mangaPageImageSource } from '@/media/images'
import { useScreenReaderEnabled } from '@/hooks/useScreenReaderEnabled'
import type { StableViewport } from '@/hooks/useStableViewport'
import type { ReaderPreferences } from '@/storage/readerPreferences'
import { colors } from '@/theme/colors'
import {
  clampPageIndex,
  displayIndexForPage,
  pageDeltaForTap,
  pageIndexesForDirection,
  type ReaderMode,
} from '@/utils/reader'

interface PagedReaderProps {
  manga: MangaDetail
  api: ApiClient
  serverUrl: string
  userUuid: string
  pageIndex: number
  onPageChange: (pageIndex: number) => void
  onBack: () => void
  onRefreshMetadata: () => Promise<void>
  mode: ReaderMode
  preferences: ReaderPreferences
  settingsVisible: boolean
  onOpenSettings: () => void
  localPageUris?: readonly string[]
  completed: boolean
  onMarkCompleted: () => Promise<void>
  onReturnToDetail: () => void
  onReturnToList: () => void
  onReread: () => Promise<void>
  completionPending: boolean
  completionError: string | null
  viewport: StableViewport
}

export function PagedReader({
  manga,
  api,
  serverUrl,
  userUuid,
  pageIndex,
  onPageChange,
  onBack,
  onRefreshMetadata,
  mode,
  preferences,
  settingsVisible,
  onOpenSettings,
  localPageUris,
  completed,
  onMarkCompleted,
  onReturnToDetail,
  onReturnToList,
  onReread,
  completionPending,
  completionError,
  viewport,
}: PagedReaderProps) {
  const { width, height, scale, epoch } = viewport
  const insets = useSafeAreaInsets()
  const screenReaderEnabled = useScreenReaderEnabled()
  const listRef = useRef<FlatList<number>>(null)
  const mountedRef = useRef(true)
  const epochRef = useRef(epoch)
  epochRef.current = epoch
  const [controlsVisible, setControlsVisible] = useState(true)
  const [progressInteracting, setProgressInteracting] = useState(false)
  const explicitJumpRef = useRef(false)
  const [pageZoomed, setPageZoomed] = useState(false)
  const firstPageReportedRef = useRef(false)
  const visiblePageRef = useRef(pageIndex)
  visiblePageRef.current = pageIndex
  const isCurrentEpoch = useCallback(
    (callbackEpoch: number) => mountedRef.current && epochRef.current === callbackEpoch,
    [],
  )
  const pageIndexes = useMemo(
    () => pageIndexesForDirection(manga.pages.length, preferences.pagedDirection),
    [manga.pages.length, preferences.pagedDirection],
  )
  const leftTarget = pageIndex + pageDeltaForTap(preferences.pagedDirection, 'left')
  const rightTarget = pageIndex + pageDeltaForTap(preferences.pagedDirection, 'right')
  const validPage = (target: number) => target >= 0 && target < manga.pages.length
  const recordPageLoad = useCallback((index: number, durationMs: number) => {
    if (!isCurrentEpoch(epoch)) return
    if (index !== visiblePageRef.current) return
    reportVisiblePageLoad('paged', index, durationMs, !firstPageReportedRef.current)
    firstPageReportedRef.current = true
  }, [epoch, isCurrentEpoch])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    setPageZoomed(false)
  }, [epoch])

  useEffect(() => {
    if (!controlsVisible || progressInteracting || settingsVisible) return
    if (preferences.controlsAutoHideMs === null) return
    const timeout = setTimeout(() => setControlsVisible(false), preferences.controlsAutoHideMs)
    return () => clearTimeout(timeout)
  }, [controlsVisible, progressInteracting, settingsVisible, pageIndex, preferences.controlsAutoHideMs])

  const scrollToPage = (nextIndex: number, animated = true) => {
    if (!isCurrentEpoch(epoch)) return
    explicitJumpRef.current = false
    const clamped = clampPageIndex(nextIndex, manga.pages.length)
    listRef.current?.scrollToIndex({
      index: displayIndexForPage(clamped, manga.pages.length, preferences.pagedDirection),
      animated,
    })
  }

  const jumpToPage = (nextIndex: number) => {
    if (!isCurrentEpoch(epoch)) return
    const clamped = clampPageIndex(nextIndex, manga.pages.length)
    setPageZoomed(false)
    scrollToPage(clamped, false)
    explicitJumpRef.current = true
    onPageChange(clamped)
    setControlsVisible(true)
  }

  const handlePageTap = (x: number) => {
    if (!isCurrentEpoch(epoch)) return
    if (x < width * 0.32) {
      if (validPage(leftTarget)) scrollToPage(leftTarget)
      else setControlsVisible(true)
    } else if (x > width * 0.68) {
      if (validPage(rightTarget)) scrollToPage(rightTarget)
      else setControlsVisible(true)
    } else {
      setControlsVisible(visible => !visible)
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar hidden={!controlsVisible} style="light" />
      <FlatList
        data={pageIndexes}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        horizontal
        initialNumToRender={1}
        initialScrollIndex={displayIndexForPage(
          pageIndex,
          manga.pages.length,
          preferences.pagedDirection,
        )}
        key={`${preferences.pagedDirection}:${epoch}`}
        keyExtractor={index => String(index)}
        maxToRenderPerBatch={1}
        onScrollBeginDrag={() => { if (isCurrentEpoch(epoch)) explicitJumpRef.current = false }}
        onMomentumScrollEnd={event => {
          if (!isCurrentEpoch(epoch) || explicitJumpRef.current) return
          const displayIndex = clampPageIndex(
            Math.round(event.nativeEvent.contentOffset.x / width),
            manga.pages.length,
          )
          const nextIndex = pageIndexes[displayIndex] ?? 0
          if (nextIndex !== pageIndex) onPageChange(nextIndex)
        }}
        pagingEnabled
        ref={listRef}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ item: index }) => (
          <ReaderPage
            api={api}
            contentFit={preferences.pagedFit}
            doubleTapScale={preferences.doubleTapZoomScale}
            height={height}
            gesturesEnabled={!screenReaderEnabled}
            index={index}
            manga={manga}
            localUri={localPageUris?.[index]}
            onPageLoad={recordPageLoad}
            onRefreshMetadata={onRefreshMetadata}
            onTap={handlePageTap}
            onZoomChange={zoomed => {
              if (isCurrentEpoch(epoch) && index === visiblePageRef.current) {
                setPageZoomed(zoomed)
              }
            }}
            pixelScale={scale}
            viewportEpoch={epoch}
            serverUrl={serverUrl}
            userUuid={userUuid}
            width={width}
          />
        )}
        scrollEnabled={!pageZoomed}
        showsHorizontalScrollIndicator={false}
        windowSize={3}
        testID={`paged-reader-list-${epoch}`}
      />
      {controlsVisible ? (
        <ReaderControls
          key={epoch}
          title={manga.displayTitle} mode={mode} direction={preferences.pagedDirection}
          pageIndex={pageIndex} pageCount={manga.pages.length}
          onBack={onBack} onOpenSettings={onOpenSettings}
          onJump={jumpToPage}
          onInteractionChange={setProgressInteracting}
            completion={pageIndex === manga.pages.length - 1 ? (
              <ReaderCompletionPanel
                completed={completed} onMarkCompleted={onMarkCompleted} onReread={onReread}
                onReturnToDetail={onReturnToDetail} onReturnToList={onReturnToList}
                pending={completionPending} error={completionError}
              />
            ) : null}
        />
      ) : null}
    </View>
  )
}

interface ReaderPageProps {
  manga: MangaDetail
  api: ApiClient
  serverUrl: string
  userUuid: string
  index: number
  width: number
  height: number
  gesturesEnabled: boolean
  onPageLoad: (index: number, durationMs: number) => void
  onRefreshMetadata: () => Promise<void>
  onTap: (x: number) => void
  onZoomChange: (zoomed: boolean) => void
  contentFit: 'contain' | 'cover'
  doubleTapScale: ReaderPreferences['doubleTapZoomScale']
  localUri?: string
  pixelScale: number
  viewportEpoch: number
}

const ReaderPage = memo(function ReaderPage({
  manga,
  api,
  serverUrl,
  userUuid,
  index,
  width,
  height,
  gesturesEnabled,
  onPageLoad,
  onRefreshMetadata,
  onTap,
  onZoomChange,
  contentFit,
  doubleTapScale,
  localUri,
  pixelScale,
  viewportEpoch,
}: ReaderPageProps) {
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [refreshingMetadata, setRefreshingMetadata] = useState(false)
  const [metadataRefreshError, setMetadataRefreshError] = useState(false)
  const mountedRef = useRef(true)
  const loadStartedAtRef = useRef(Date.now())
  const source = localUri
    ? localPageImageSource(localUri)
    : mangaPageImageSource(
        api,
        serverUrl,
        userUuid,
        manga.uuid,
        index,
        manga.updateAt,
      )
  const requestKey = `${source.cacheKey ?? source.uri ?? ''}:${attempt}:${viewportEpoch}`
  const requestGenerationRef = useRef({ key: requestKey, generation: 0 })
  if (requestGenerationRef.current.key !== requestKey) {
    requestGenerationRef.current = {
      key: requestKey,
      generation: requestGenerationRef.current.generation + 1,
    }
  }
  const requestGeneration = requestGenerationRef.current.generation

  useEffect(() => {
    setFailed(false)
    setLoading(true)
    loadStartedAtRef.current = Date.now()
  }, [requestKey])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  return (
    <View style={[styles.page, { width, height }]}>
      {!failed
        ? (
            <ZoomableReaderImage
              allowDownscaling
              accessibilityLabel={`第 ${index + 1} 页图片`}
              cachePolicy={localUri ? 'none' : 'disk'}
              contentFit={contentFit}
              doubleTapScale={doubleTapScale}
              gesturesEnabled={gesturesEnabled}
              height={height}
              enforceEarlyResizing={Platform.OS === 'ios'}
              key={attempt}
              onError={() => {
                if (
                  !mountedRef.current ||
                  requestGeneration !== requestGenerationRef.current.generation
                ) return
                setLoading(false)
                setFailed(true)
                reportReaderTelemetry({
                  type: 'page-failure',
                  mode: 'paged',
                  pageIndex: index,
                  attempt,
                })
              }}
              onLoad={() => {
                if (
                  !mountedRef.current ||
                  requestGeneration !== requestGenerationRef.current.generation
                ) return
                setLoading(false)
                onPageLoad(index, Date.now() - loadStartedAtRef.current)
              }}
              recyclingKey={`${manga.uuid}:${index}:${manga.updateAt}:${viewportEpoch}`}
              pixelScale={pixelScale}
              resetKey={viewportEpoch}
              source={source}
              onTap={onTap}
              onZoomChange={onZoomChange}
              width={width}
            />
          )
        : (
            <Pressable
              onPress={event => onTap(event.nativeEvent.locationX)}
              style={styles.pageFailure}
            >
              <Ionicons color="#a3a3a3" name="image-outline" size={42} />
              <Text style={styles.pageFailureTitle}>第 {index + 1} 页加载失败</Text>
              <Pressable
                accessibilityRole="button"
                onPress={event => {
                  event.stopPropagation()
                  reportReaderTelemetry({
                    type: 'page-retry',
                    mode: 'paged',
                    pageIndex: index,
                    attempt: attempt + 1,
                  })
                  setAttempt(value => value + 1)
                  setFailed(false)
                  setMetadataRefreshError(false)
                }}
              >
                <Text style={styles.pageFailureAction}>点击重试</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={refreshingMetadata}
                onPress={event => {
                  event.stopPropagation()
                  setRefreshingMetadata(true)
                  setMetadataRefreshError(false)
                  void onRefreshMetadata()
                    .catch(() => {
                      if (mountedRef.current) setMetadataRefreshError(true)
                    })
                    .finally(() => {
                      if (mountedRef.current) setRefreshingMetadata(false)
                    })
                }}
              >
                <Text style={styles.metadataRefreshAction}>
                  {refreshingMetadata ? '正在刷新页面信息' : '刷新页面信息'}
                </Text>
              </Pressable>
              {metadataRefreshError
                ? <Text style={styles.metadataRefreshError}>刷新失败，请检查网络后重试</Text>
                : null}
            </Pressable>
          )}
      {loading && !failed
        ? <ActivityIndicator color="#ffffff" size="large" style={styles.pageLoading} />
        : null}
    </View>
  )
})

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.reader,
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.reader,
  },
  pageLoading: {
    position: 'absolute',
    alignSelf: 'center',
  },
  pageFailure: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    padding: 24,
  },
  pageFailureTitle: {
    color: '#d4d4d4',
    fontSize: 15,
    fontWeight: '600',
  },
  pageFailureAction: {
    color: '#60a5fa',
    fontSize: 13,
  },
  metadataRefreshAction: {
    color: '#a3a3a3',
    fontSize: 12,
  },
  metadataRefreshError: {
    color: '#fca5a5',
    fontSize: 12,
  },
})
