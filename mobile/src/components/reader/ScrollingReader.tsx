import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { useReaderPagePrefetch } from '@/components/reader/prefetch'
import { ReaderTopBar } from '@/components/reader/ReaderTopBar'
import {
  reportReaderTelemetry,
  reportVisiblePageLoad,
} from '@/components/reader/telemetry'
import { mangaPageImageSource } from '@/media/images'
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
}: ScrollingReaderProps) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList<string>>(null)
  const callbackRef = useRef(onPageChange)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initializationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initializingRef = useRef(pageIndex > 0)
  const previousWidthRef = useRef(width)
  const scrollOffsetRef = useRef(0)
  const firstPageReportedRef = useRef(false)
  const visiblePageRef = useRef(pageIndex)
  visiblePageRef.current = pageIndex
  const [aspectRatios, setAspectRatios] = useState<Record<number, number>>({})
  const [controlsVisible, setControlsVisible] = useState(true)
  const imageWidth = Math.min(width, 900)
  useReaderPagePrefetch({
    api,
    manga,
    mode: 'scroll',
    pageIndex,
    serverUrl,
    userUuid,
  })
  const layouts = useMemo(() => buildScrollingPageLayouts(
    manga.pages.map((_, index) => aspectRatios[index] ?? 2 / 3),
    imageWidth,
    preferences.scrollGap,
  ), [manga.pages, aspectRatios, imageWidth, preferences.scrollGap])
  const layoutsRef = useRef(layouts)
  layoutsRef.current = layouts
  const recordPageLoad = useCallback((index: number, durationMs: number) => {
    if (index !== visiblePageRef.current) return
    reportVisiblePageLoad('scroll', index, durationMs, !firstPageReportedRef.current)
    firstPageReportedRef.current = true
  }, [])

  useEffect(() => { callbackRef.current = onPageChange }, [onPageChange])

  useEffect(() => {
    if (!controlsVisible || settingsVisible) return
    if (preferences.controlsAutoHideMs === null) return
    const timeout = setTimeout(() => setControlsVisible(false), preferences.controlsAutoHideMs)
    return () => clearTimeout(timeout)
  }, [controlsVisible, settingsVisible, pageIndex, preferences.controlsAutoHideMs])

  useEffect(() => {
    if (previousWidthRef.current === width) return
    previousWidthRef.current = width
    initializingRef.current = true
    retryCountRef.current = 0
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: pageIndex, animated: false })
      finishInitializationAfterDelay()
    })
    return () => cancelAnimationFrame(frame)
  }, [width, pageIndex])

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    if (initializationTimerRef.current) clearTimeout(initializationTimerRef.current)
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
  }, [])

  const finishInitializationAfterDelay = () => {
    if (initializationTimerRef.current) clearTimeout(initializationTimerRef.current)
    initializationTimerRef.current = setTimeout(() => {
      initializingRef.current = false
    }, 500)
  }

  useEffect(() => {
    finishInitializationAfterDelay()
  }, [])

  const cancelSettle = () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = null
  }

  const settleVisiblePage = () => {
    cancelSettle()
    settleTimerRef.current = setTimeout(() => {
      if (initializingRef.current) return
      callbackRef.current(pageIndexAtViewportCenter(
        layoutsRef.current,
        scrollOffsetRef.current,
        height,
      ))
    }, 250)
  }

  const updateAspectRatio = useCallback((index: number, ratio: number) => {
    setAspectRatios(current => Math.abs((current[index] ?? 0) - ratio) < 0.001
      ? current
      : { ...current, [index]: ratio })
  }, [])

  return (
    <View style={styles.root}>
      <StatusBar hidden={!controlsVisible} style="light" />
      <FlatList
        data={manga.pages}
        extraData={layouts}
        getItemLayout={(_, index) => layouts[index]}
        initialNumToRender={3}
        initialScrollIndex={pageIndex}
        keyExtractor={(_, index) => String(index)}
        ListFooterComponent={<View style={{ height: Math.max(24, insets.bottom + 12) }} />}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        maxToRenderPerBatch={3}
        onScrollBeginDrag={() => {
          initializingRef.current = false
          cancelSettle()
          setControlsVisible(false)
        }}
        onMomentumScrollBegin={cancelSettle}
        onMomentumScrollEnd={settleVisiblePage}
        onScroll={event => { scrollOffsetRef.current = event.nativeEvent.contentOffset.y }}
        onScrollEndDrag={settleVisiblePage}
        onScrollToIndexFailed={info => {
          const estimatedLayout = layoutsRef.current[info.index]
          listRef.current?.scrollToOffset({
            offset: estimatedLayout?.offset ?? Math.max(0, info.averageItemLength * info.index),
            animated: false,
          })
          if (retryCountRef.current < 4) {
            retryCountRef.current += 1
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
            retryTimerRef.current = setTimeout(() => {
              listRef.current?.scrollToIndex({ index: info.index, animated: false })
              finishInitializationAfterDelay()
            }, 80)
          } else {
            finishInitializationAfterDelay()
          }
        }}
        ref={listRef}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ index }) => (
          <ScrollingPage
            api={api}
            aspectRatio={aspectRatios[index] ?? 2 / 3}
            index={index}
            manga={manga}
            onAspectRatio={updateAspectRatio}
            onPageLoad={recordPageLoad}
            onRefreshMetadata={onRefreshMetadata}
            onTap={() => setControlsVisible(visible => !visible)}
            pageGap={index === manga.pages.length - 1 ? 0 : preferences.scrollGap}
            serverUrl={serverUrl}
            userUuid={userUuid}
            viewportWidth={width}
          />
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        windowSize={5}
      />

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
  serverUrl: string
  userUuid: string
  index: number
  viewportWidth: number
  onTap: () => void
  onAspectRatio: (index: number, aspectRatio: number) => void
  onPageLoad: (index: number, durationMs: number) => void
  onRefreshMetadata: () => Promise<void>
  pageGap: number
}

const ScrollingPage = memo(function ScrollingPage({
  manga,
  api,
  aspectRatio,
  serverUrl,
  userUuid,
  index,
  viewportWidth,
  onTap,
  onAspectRatio,
  onPageLoad,
  onRefreshMetadata,
  pageGap,
}: ScrollingPageProps) {
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [refreshingMetadata, setRefreshingMetadata] = useState(false)
  const loadStartedAtRef = useRef(Date.now())
  const imageWidth = Math.min(viewportWidth, 900)
  const imageHeight = imageWidth / aspectRatio
  const source = mangaPageImageSource(
    api,
    serverUrl,
    userUuid,
    manga.uuid,
    index,
    manga.updateAt,
  )

  useEffect(() => {
    setLoading(true)
    setFailed(false)
    loadStartedAtRef.current = Date.now()
  }, [source.cacheKey, attempt])

  return (
    <Pressable
      onPress={onTap}
      style={[styles.scrollPage, { width: viewportWidth, paddingBottom: pageGap }]}
    >
      {!failed
        ? (
            <Image
              cachePolicy="memory-disk"
              contentFit="contain"
              key={attempt}
              onError={() => {
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
                const { width, height } = event.source
                if (width > 0 && height > 0) {
                  const nextAspectRatio = Math.min(4, Math.max(0.05, width / height))
                  onAspectRatio(index, nextAspectRatio)
                }
                setLoading(false)
                onPageLoad(index, Date.now() - loadStartedAtRef.current)
              }}
              recyclingKey={`${manga.uuid}:${index}:${manga.updateAt}`}
              source={source}
              style={{ width: imageWidth, height: imageHeight }}
            />
          )
        : (
            <View style={[styles.scrollFailure, { width: imageWidth, height: imageHeight }]}>
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
                  void onRefreshMetadata().finally(() => setRefreshingMetadata(false))
                }}
              >
                <Text style={styles.metadataRefreshAction}>
                  {refreshingMetadata ? '正在刷新页面信息' : '刷新页面信息'}
                </Text>
              </Pressable>
            </View>
          )}
      {loading && !failed
        ? <ActivityIndicator color="#ffffff" size="large" style={styles.loading} />
        : null}
    </Pressable>
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
