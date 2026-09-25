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
import { ReaderDimmer } from '@/components/reader/ReaderDimmer'
import { ReaderTopBar } from '@/components/reader/ReaderTopBar'
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
  buildScrollingPageLayouts,
  pageIndexAtViewportCenter,
  type ReaderMode,
} from '@/utils/reader'

interface ScrollingReaderProps {
  manga: MangaDetail
  api: ApiClient
  serverUrl: string
  userUuid: string
  pageIndex: number
  onPageChange: (pageIndex: number) => void
  onBack: () => void
  onRefreshMetadata: () => Promise<void>
  mode: ReaderMode
  onModeChange: (mode: ReaderMode) => void
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

export function ScrollingReader({
  manga,
  api,
  serverUrl,
  userUuid,
  pageIndex,
  onPageChange,
  onBack,
  onRefreshMetadata,
  mode,
  onModeChange,
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
}: ScrollingReaderProps) {
  const { width, height, scale, epoch } = viewport
  const insets = useSafeAreaInsets()
  const screenReaderEnabled = useScreenReaderEnabled()
  const listRef = useRef<FlatList<string>>(null)
  const callbackRef = useRef(onPageChange)
  const mountedRef = useRef(true)
  const epochRef = useRef(epoch)
  epochRef.current = epoch
  const userInteractingRef = useRef(false)
  const scrollOffsetRef = useRef(0)
  const firstPageReportedRef = useRef(false)
  const visiblePageRef = useRef(pageIndex)
  const pendingAspectRatiosRef = useRef<Record<number, number>>({})
  const aspectRatioFrameRef = useRef<number | null>(null)
  visiblePageRef.current = pageIndex
  const [aspectRatios, setAspectRatios] = useState<Record<number, number>>({})
  const [controlsVisible, setControlsVisible] = useState(true)
  const [zoomedPageIndex, setZoomedPageIndex] = useState<number | null>(null)
  const isCurrentEpoch = useCallback(
    (callbackEpoch: number) => mountedRef.current && epochRef.current === callbackEpoch,
    [],
  )
  const imageWidth = Math.min(width, 900)
  const layouts = useMemo(() => buildScrollingPageLayouts(
    manga.pages.map((_, index) => aspectRatios[index] ?? 2 / 3),
    imageWidth,
    preferences.scrollGap,
  ), [manga.pages, aspectRatios, imageWidth, preferences.scrollGap])
  const layoutsRef = useRef(layouts)
  layoutsRef.current = layouts
  const recordPageLoad = useCallback((index: number, durationMs: number) => {
    if (!isCurrentEpoch(epoch)) return
    if (index !== visiblePageRef.current) return
    reportVisiblePageLoad('scroll', index, durationMs, !firstPageReportedRef.current)
    firstPageReportedRef.current = true
  }, [epoch, isCurrentEpoch])

  useEffect(() => { callbackRef.current = onPageChange }, [onPageChange])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (aspectRatioFrameRef.current !== null) cancelAnimationFrame(aspectRatioFrameRef.current)
      aspectRatioFrameRef.current = null
      pendingAspectRatiosRef.current = {}
    }
  }, [])

  useEffect(() => {
    setZoomedPageIndex(null)
    userInteractingRef.current = false
    scrollOffsetRef.current = layouts[pageIndex]?.offset ?? 0
  }, [epoch])

  useEffect(() => {
    if (!controlsVisible || settingsVisible) return
    if (preferences.controlsAutoHideMs === null) return
    const timeout = setTimeout(() => setControlsVisible(false), preferences.controlsAutoHideMs)
    return () => clearTimeout(timeout)
  }, [controlsVisible, settingsVisible, pageIndex, preferences.controlsAutoHideMs])

  const settleVisiblePage = () => {
    if (!isCurrentEpoch(epoch) || !userInteractingRef.current) return
    callbackRef.current(pageIndexAtViewportCenter(
      layoutsRef.current,
      scrollOffsetRef.current,
      height,
    ))
  }

  const updateAspectRatio = useCallback((index: number, ratio: number) => {
    const callbackEpoch = epoch
    if (!isCurrentEpoch(callbackEpoch)) return
    pendingAspectRatiosRef.current[index] = ratio
    if (aspectRatioFrameRef.current !== null) return
    aspectRatioFrameRef.current = requestAnimationFrame(() => {
      aspectRatioFrameRef.current = null
      if (!isCurrentEpoch(callbackEpoch)) {
        pendingAspectRatiosRef.current = {}
        return
      }
      const pending = pendingAspectRatiosRef.current
      pendingAspectRatiosRef.current = {}
      setAspectRatios(current => {
        let changed = false
        const next = { ...current }
        Object.entries(pending).forEach(([key, value]) => {
          const index = Number(key)
          if (Math.abs((current[index] ?? 0) - value) < 0.001) return
          next[index] = value
          changed = true
        })
        return changed ? next : current
      })
    })
  }, [epoch, isCurrentEpoch])
  const toggleControls = useCallback(() => {
    if (!isCurrentEpoch(epoch)) return
    setControlsVisible(visible => !visible)
  }, [epoch, isCurrentEpoch])
  const updateZoomedPage = useCallback((index: number, zoomed: boolean) => {
    const callbackEpoch = epoch
    if (!isCurrentEpoch(callbackEpoch)) return
    setZoomedPageIndex(current => {
      if (zoomed) return index
      return current === index ? null : current
    })
  }, [epoch, isCurrentEpoch])

  return (
    <View style={styles.root}>
      <StatusBar hidden={!controlsVisible} style="light" />
      <FlatList
        data={manga.pages}
        extraData={layouts}
        getItemLayout={(_, index) => layouts[index] ?? {
          index,
          length: 0,
          offset: 0,
        }}
        initialNumToRender={1}
        initialScrollIndex={pageIndex}
        key={`scroll:${epoch}`}
        keyExtractor={(_, index) => String(index)}
        ListFooterComponent={pageIndex === manga.pages.length - 1 ? (
          <View style={[
            styles.completionFooter,
            { paddingBottom: Math.max(24, insets.bottom + 12) },
          ]}>
            <ReaderCompletionPanel
              completed={completed}
              onMarkCompleted={onMarkCompleted}
              onReread={onReread}
              onReturnToDetail={onReturnToDetail}
              onReturnToList={onReturnToList}
              pending={completionPending}
              error={completionError}
            />
          </View>
        ) : null}
        maxToRenderPerBatch={1}
        onScrollBeginDrag={() => {
          if (!isCurrentEpoch(epoch)) return
          userInteractingRef.current = true
          setControlsVisible(false)
        }}
        onMomentumScrollEnd={settleVisiblePage}
        onScroll={event => {
          if (isCurrentEpoch(epoch)) {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.y
          }
        }}
        onScrollEndDrag={settleVisiblePage}
        ref={listRef}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ index }) => (
          <ScrollingPage
            api={api}
            aspectRatio={aspectRatios[index] ?? 2 / 3}
            doubleTapScale={preferences.doubleTapZoomScale}
            index={index}
            gesturesEnabled={!screenReaderEnabled}
            manga={manga}
            localUri={localPageUris?.[index]}
            onAspectRatio={updateAspectRatio}
            onPageLoad={recordPageLoad}
            onRefreshMetadata={onRefreshMetadata}
            onTap={toggleControls}
            onZoomChange={updateZoomedPage}
            pageGap={index === manga.pages.length - 1 ? 0 : preferences.scrollGap}
            pixelScale={scale}
            serverUrl={serverUrl}
            userUuid={userUuid}
            viewportWidth={width}
            viewportEpoch={epoch}
          />
        )}
        scrollEventThrottle={16}
        scrollEnabled={zoomedPageIndex === null}
        showsVerticalScrollIndicator={false}
        testID={`scrolling-reader-list-${epoch}`}
        windowSize={3}
      />
      <ReaderDimmer level={preferences.readerDimLevel} />

      {controlsVisible
        ? (
            <>
              <ReaderTopBar
                mode={mode}
                onBack={onBack}
                onModeChange={onModeChange}
                onOpenSettings={onOpenSettings}
                title={manga.displayTitle}
                topInset={insets.top}
              />
              <View style={[styles.pageBadge, { bottom: Math.max(insets.bottom, 12) }]}>
                <Text style={styles.pageBadgeText}>{pageIndex + 1} / {manga.pages.length}</Text>
              </View>
            </>
          )
        : null}
    </View>
  )
}

interface ScrollingPageProps {
  manga: MangaDetail
  api: ApiClient
  aspectRatio: number
  doubleTapScale: ReaderPreferences['doubleTapZoomScale']
  serverUrl: string
  userUuid: string
  index: number
  gesturesEnabled: boolean
  viewportWidth: number
  onTap: () => void
  onZoomChange: (index: number, zoomed: boolean) => void
  onAspectRatio: (index: number, aspectRatio: number) => void
  onPageLoad: (index: number, durationMs: number) => void
  onRefreshMetadata: () => Promise<void>
  pageGap: number
  localUri?: string
  pixelScale: number
  viewportEpoch: number
}

const ScrollingPage = memo(function ScrollingPage({
  manga,
  api,
  aspectRatio,
  doubleTapScale,
  serverUrl,
  userUuid,
  index,
  gesturesEnabled,
  viewportWidth,
  onTap,
  onZoomChange,
  onAspectRatio,
  onPageLoad,
  onRefreshMetadata,
  pageGap,
  localUri,
  pixelScale,
  viewportEpoch,
}: ScrollingPageProps) {
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [refreshingMetadata, setRefreshingMetadata] = useState(false)
  const [metadataRefreshError, setMetadataRefreshError] = useState(false)
  const mountedRef = useRef(true)
  const loadStartedAtRef = useRef(Date.now())
  const imageWidth = Math.min(viewportWidth, 900)
  const imageHeight = imageWidth / aspectRatio
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
    setLoading(true)
    setFailed(false)
    loadStartedAtRef.current = Date.now()
  }, [requestKey])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  return (
    <View style={[styles.scrollPage, { width: viewportWidth, paddingBottom: pageGap }]}>
      {!failed
        ? (
            <ZoomableReaderImage
              allowDownscaling
              accessibilityLabel={`第 ${index + 1} 页图片`}
              cachePolicy={localUri ? 'none' : 'disk'}
              contentFit="contain"
              doubleTapScale={doubleTapScale}
              gesturesEnabled={gesturesEnabled}
              height={imageHeight}
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
                  mode: 'scroll',
                  pageIndex: index,
                  attempt,
                })
              }}
              onLoad={event => {
                if (
                  !mountedRef.current ||
                  requestGeneration !== requestGenerationRef.current.generation
                ) return
                const { width, height } = event.source
                if (width > 0 && height > 0) {
                  const nextAspectRatio = Math.min(4, Math.max(0.05, width / height))
                  onAspectRatio(index, nextAspectRatio)
                }
                setLoading(false)
                onPageLoad(index, Date.now() - loadStartedAtRef.current)
              }}
              recyclingKey={`${manga.uuid}:${index}:${manga.updateAt}:${viewportEpoch}`}
              pixelScale={pixelScale}
              resetKey={viewportEpoch}
              source={source}
              onTap={() => onTap()}
              onZoomChange={zoomed => onZoomChange(index, zoomed)}
              width={imageWidth}
            />
          )
        : (
            <Pressable
              onPress={onTap}
              style={[styles.scrollFailure, { width: imageWidth, height: imageHeight }]}
            >
              <Ionicons color="#a3a3a3" name="image-outline" size={38} />
              <Text style={styles.failureTitle}>第 {index + 1} 页加载失败</Text>
              <Pressable
                accessibilityRole="button"
                onPress={event => {
                  event.stopPropagation()
                  reportReaderTelemetry({
                    type: 'page-retry',
                    mode: 'scroll',
                    pageIndex: index,
                    attempt: attempt + 1,
                  })
                  setAttempt(value => value + 1)
                  setFailed(false)
                  setMetadataRefreshError(false)
                }}
              >
                <Text style={styles.failureAction}>点击重试</Text>
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
        ? <ActivityIndicator color="#ffffff" size="large" style={styles.loading} />
        : null}
    </View>
  )
})

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.reader,
  },
  scrollPage: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.reader,
  },
  loading: {
    position: 'absolute',
    alignSelf: 'center',
  },
  completionFooter: {
    padding: 14,
    backgroundColor: colors.reader,
  },
  scrollFailure: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1f1f1f',
  },
  failureTitle: {
    color: '#d4d4d4',
    fontSize: 14,
    fontWeight: '600',
  },
  failureAction: {
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
  pageBadge: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  pageBadgeText: {
    color: '#ffffff',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
})
