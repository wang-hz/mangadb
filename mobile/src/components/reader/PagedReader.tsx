import { Ionicons } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { PrimaryButton } from '@/components/PrimaryButton'
import { useReaderPagePrefetch } from '@/components/reader/prefetch'
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
  onModeChange: (mode: ReaderMode) => void
  preferences: ReaderPreferences
  settingsVisible: boolean
  onOpenSettings: () => void
  localPageUris?: readonly string[]
  completed: boolean
  onMarkCompleted: () => Promise<void>
  onReturnToDetail: () => void
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
  onModeChange,
  preferences,
  settingsVisible,
  onOpenSettings,
  localPageUris,
  completed,
  onMarkCompleted,
  onReturnToDetail,
}: PagedReaderProps) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const screenReaderEnabled = useScreenReaderEnabled()
  const listRef = useRef<FlatList<number>>(null)
  const previousWidthRef = useRef(width)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [jumpVisible, setJumpVisible] = useState(false)
  const [pageZoomed, setPageZoomed] = useState(false)
  const firstPageReportedRef = useRef(false)
  const visiblePageRef = useRef(pageIndex)
  visiblePageRef.current = pageIndex
  const pageIndexes = useMemo(
    () => pageIndexesForDirection(manga.pages.length, preferences.pagedDirection),
    [manga.pages.length, preferences.pagedDirection],
  )
  const leftTarget = pageIndex + pageDeltaForTap(preferences.pagedDirection, 'left')
  const rightTarget = pageIndex + pageDeltaForTap(preferences.pagedDirection, 'right')
  const validPage = (target: number) => target >= 0 && target < manga.pages.length
  const recordPageLoad = useCallback((index: number, durationMs: number) => {
    if (index !== visiblePageRef.current) return
    reportVisiblePageLoad('paged', index, durationMs, !firstPageReportedRef.current)
    firstPageReportedRef.current = true
  }, [])
  useReaderPagePrefetch({
    api,
    direction: preferences.pagedDirection,
    manga,
    mode: 'paged',
    pageIndex,
    serverUrl,
    userUuid,
    enabled: !localPageUris,
  })

  useEffect(() => {
    if (!controlsVisible || jumpVisible || settingsVisible) return
    if (preferences.controlsAutoHideMs === null) return
    const timeout = setTimeout(() => setControlsVisible(false), preferences.controlsAutoHideMs)
    return () => clearTimeout(timeout)
  }, [controlsVisible, jumpVisible, settingsVisible, pageIndex, preferences.controlsAutoHideMs])

  useEffect(() => {
    if (previousWidthRef.current === width) return
    previousWidthRef.current = width
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: displayIndexForPage(
          pageIndex,
          manga.pages.length,
          preferences.pagedDirection,
        ) * width,
        animated: false,
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [width, pageIndex, manga.pages.length, preferences.pagedDirection])

  const scrollToPage = (nextIndex: number, animated = true) => {
    const clamped = clampPageIndex(nextIndex, manga.pages.length)
    listRef.current?.scrollToIndex({
      index: displayIndexForPage(clamped, manga.pages.length, preferences.pagedDirection),
      animated,
    })
  }

  const handlePageTap = (x: number) => {
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
      {/* A three-viewport window prefetches neighbors with the same authenticated cache key. */}
      <FlatList
        data={pageIndexes}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        horizontal
        initialNumToRender={3}
        initialScrollIndex={displayIndexForPage(
          pageIndex,
          manga.pages.length,
          preferences.pagedDirection,
        )}
        key={preferences.pagedDirection}
        keyExtractor={index => String(index)}
        maxToRenderPerBatch={3}
        onMomentumScrollEnd={event => {
          const displayIndex = clampPageIndex(
            Math.round(event.nativeEvent.contentOffset.x / width),
            manga.pages.length,
          )
          const nextIndex = pageIndexes[displayIndex] ?? 0
          if (nextIndex !== pageIndex) onPageChange(nextIndex)
        }}
        onScrollToIndexFailed={info => {
          listRef.current?.scrollToOffset({ offset: info.index * width, animated: false })
        }}
        pagingEnabled
        ref={listRef}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ item: index }) => (
          <ReaderPage
            api={api}
            contentFit={preferences.pagedFit}
            height={height}
            gesturesEnabled={!screenReaderEnabled}
            index={index}
            manga={manga}
            localUri={localPageUris?.[index]}
            onPageLoad={recordPageLoad}
            onRefreshMetadata={onRefreshMetadata}
            onTap={handlePageTap}
            onZoomChange={zoomed => {
              if (index === visiblePageRef.current) setPageZoomed(zoomed)
            }}
            serverUrl={serverUrl}
            userUuid={userUuid}
            width={width}
          />
        )}
        scrollEnabled={!pageZoomed}
        showsHorizontalScrollIndicator={false}
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
              <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
                <Pressable
                  accessibilityLabel={preferences.pagedDirection === 'rtl' ? '下一页' : '上一页'}
                  accessibilityRole="button"
                  disabled={!validPage(leftTarget)}
                  onPress={() => scrollToPage(leftTarget)}
                  style={[styles.controlButton, !validPage(leftTarget) ? styles.controlDisabled : null]}
                >
                  <Ionicons color="#ffffff" name="chevron-back" size={25} />
                </Pressable>
                <Pressable
                  accessibilityHint="输入要跳转的页码"
                  accessibilityRole="button"
                  onPress={() => setJumpVisible(true)}
                  style={styles.pageIndicator}
                >
                  <Text style={styles.pageIndicatorText}>{pageIndex + 1} / {manga.pages.length}</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={preferences.pagedDirection === 'rtl' ? '上一页' : '下一页'}
                  accessibilityRole="button"
                  disabled={!validPage(rightTarget)}
                  onPress={() => scrollToPage(rightTarget)}
                  style={[
                    styles.controlButton,
                    !validPage(rightTarget) ? styles.controlDisabled : null,
                  ]}
                >
                  <Ionicons color="#ffffff" name="chevron-forward" size={25} />
                </Pressable>
              </View>
              {pageIndex === manga.pages.length - 1
                ? (
                    <View style={[
                      styles.completionPanel,
                      { bottom: Math.max(insets.bottom, 10) + 70 },
                    ]}>
                      <ReaderCompletionPanel
                        completed={completed}
                        onMarkCompleted={onMarkCompleted}
                        onReread={() => {
                          onPageChange(0)
                          scrollToPage(0)
                        }}
                        onReturnToDetail={onReturnToDetail}
                      />
                    </View>
                  )
                : null}
            </>
          )
        : null}

      <PageJumpModal
        currentPage={pageIndex + 1}
        onClose={() => setJumpVisible(false)}
        onJump={page => {
          setJumpVisible(false)
          setControlsVisible(true)
          scrollToPage(page - 1)
        }}
        pageCount={manga.pages.length}
        visible={jumpVisible}
      />
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
  localUri?: string
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
  localUri,
}: ReaderPageProps) {
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [refreshingMetadata, setRefreshingMetadata] = useState(false)
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

  useEffect(() => {
    setFailed(false)
    setLoading(true)
    loadStartedAtRef.current = Date.now()
  }, [source.cacheKey, attempt])

  return (
    <View style={[styles.page, { width, height }]}>
      {!failed
        ? (
            <ZoomableReaderImage
              accessibilityLabel={`第 ${index + 1} 页图片`}
              cachePolicy="memory-disk"
              contentFit={contentFit}
              gesturesEnabled={gesturesEnabled}
              height={height}
              key={attempt}
              onError={() => {
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
                setLoading(false)
                onPageLoad(index, Date.now() - loadStartedAtRef.current)
              }}
              recyclingKey={`${manga.uuid}:${index}:${manga.updateAt}`}
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
                  void onRefreshMetadata().finally(() => setRefreshingMetadata(false))
                }}
              >
                <Text style={styles.metadataRefreshAction}>
                  {refreshingMetadata ? '正在刷新页面信息' : '刷新页面信息'}
                </Text>
              </Pressable>
            </Pressable>
          )}
      {loading && !failed
        ? <ActivityIndicator color="#ffffff" size="large" style={styles.pageLoading} />
        : null}
    </View>
  )
})

function PageJumpModal({
  visible,
  currentPage,
  pageCount,
  onClose,
  onJump,
}: {
  visible: boolean
  currentPage: number
  pageCount: number
  onClose: () => void
  onJump: (page: number) => void
}) {
  const [value, setValue] = useState(String(currentPage))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (visible) {
      setValue(String(currentPage))
      setError(null)
    }
  }, [visible, currentPage])

  const submit = () => {
    if (!/^\d+$/.test(value)) {
      setError('请输入有效页码')
      return
    }
    const page = Number(value)
    if (page < 1 || page > pageCount) {
      setError(`页码范围为 1–${pageCount}`)
      return
    }
    onJump(page)
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>跳转页码</Text>
          <TextInput
            accessibilityLabel="目标页码"
            autoFocus
            keyboardType="number-pad"
            onChangeText={text => {
              setValue(text)
              setError(null)
            }}
            onSubmitEditing={submit}
            selectTextOnFocus
            style={[styles.modalInput, error ? styles.modalInputError : null]}
            value={value}
          />
          <Text style={error ? styles.modalError : styles.modalHelp}>
            {error ?? `共 ${pageCount} 页`}
          </Text>
          <View style={styles.modalActions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>取消</Text>
            </Pressable>
            <View style={styles.modalPrimary}>
              <PrimaryButton onPress={submit}>跳转</PrimaryButton>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

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
  completionPanel: {
    position: 'absolute',
    right: 14,
    left: 14,
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
  bottomBar: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    paddingTop: 7,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  controlButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  controlDisabled: {
    opacity: 0.3,
  },
  pageIndicator: {
    minWidth: 100,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  pageIndicatorText: {
    color: '#ffffff',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    gap: 12,
    padding: 20,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
  },
  modalInput: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    fontSize: 20,
    textAlign: 'center',
    backgroundColor: colors.surface,
  },
  modalInputError: {
    borderColor: colors.danger,
  },
  modalHelp: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  modalError: {
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  modalCancel: {
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  modalCancelText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  modalPrimary: {
    flex: 1,
  },
})
