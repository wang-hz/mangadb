import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { memo, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  type GestureResponderEvent,
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
import { mangaPageImageSource } from '@/media/images'
import { colors } from '@/theme/colors'
import { clampPageIndex } from '@/utils/reader'

interface PagedReaderProps {
  manga: MangaDetail
  api: ApiClient
  serverUrl: string
  userUuid: string
  pageIndex: number
  onPageChange: (pageIndex: number) => void
  onImageError: () => void
  onBack: () => void
}

export function PagedReader({
  manga,
  api,
  serverUrl,
  userUuid,
  pageIndex,
  onPageChange,
  onImageError,
  onBack,
}: PagedReaderProps) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList<string>>(null)
  const previousWidthRef = useRef(width)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [jumpVisible, setJumpVisible] = useState(false)

  useEffect(() => {
    if (!controlsVisible || jumpVisible) return
    const timeout = setTimeout(() => setControlsVisible(false), 3_000)
    return () => clearTimeout(timeout)
  }, [controlsVisible, jumpVisible, pageIndex])

  useEffect(() => {
    if (previousWidthRef.current === width) return
    previousWidthRef.current = width
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: pageIndex * width, animated: false })
    })
    return () => cancelAnimationFrame(frame)
  }, [width, pageIndex])

  const scrollToPage = (nextIndex: number, animated = true) => {
    const clamped = clampPageIndex(nextIndex, manga.pages.length)
    onPageChange(clamped)
    listRef.current?.scrollToIndex({ index: clamped, animated })
  }

  const handlePageTap = (event: GestureResponderEvent) => {
    const x = event.nativeEvent.locationX
    if (x < width * 0.32) {
      if (pageIndex > 0) scrollToPage(pageIndex - 1)
      else setControlsVisible(true)
    } else if (x > width * 0.68) {
      if (pageIndex < manga.pages.length - 1) scrollToPage(pageIndex + 1)
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
        data={manga.pages}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        horizontal
        initialNumToRender={3}
        initialScrollIndex={pageIndex}
        keyExtractor={(_, index) => String(index)}
        maxToRenderPerBatch={3}
        onMomentumScrollEnd={event => {
          const nextIndex = clampPageIndex(
            Math.round(event.nativeEvent.contentOffset.x / width),
            manga.pages.length,
          )
          if (nextIndex !== pageIndex) onPageChange(nextIndex)
        }}
        onScrollToIndexFailed={info => {
          listRef.current?.scrollToOffset({ offset: info.index * width, animated: false })
        }}
        pagingEnabled
        ref={listRef}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ index }) => (
          <ReaderPage
            api={api}
            height={height}
            index={index}
            manga={manga}
            onImageError={onImageError}
            onTap={handlePageTap}
            serverUrl={serverUrl}
            userUuid={userUuid}
            width={width}
          />
        )}
        showsHorizontalScrollIndicator={false}
        windowSize={3}
      />

      {controlsVisible
        ? (
            <>
              <View style={[styles.topBar, { paddingTop: insets.top }]}>
                <Pressable
                  accessibilityLabel="退出阅读器"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={onBack}
                  style={styles.controlButton}
                >
                  <Ionicons color="#ffffff" name="chevron-back" size={27} />
                </Pressable>
                <Text numberOfLines={1} style={styles.readerTitle}>{manga.displayTitle}</Text>
                <View style={styles.controlSpacer} />
              </View>
              <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
                <Pressable
                  accessibilityLabel="上一页"
                  accessibilityRole="button"
                  disabled={pageIndex === 0}
                  onPress={() => scrollToPage(pageIndex - 1)}
                  style={[styles.controlButton, pageIndex === 0 ? styles.controlDisabled : null]}
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
                  accessibilityLabel="下一页"
                  accessibilityRole="button"
                  disabled={pageIndex === manga.pages.length - 1}
                  onPress={() => scrollToPage(pageIndex + 1)}
                  style={[
                    styles.controlButton,
                    pageIndex === manga.pages.length - 1 ? styles.controlDisabled : null,
                  ]}
                >
                  <Ionicons color="#ffffff" name="chevron-forward" size={25} />
                </Pressable>
              </View>
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
  onImageError: () => void
  onTap: (event: GestureResponderEvent) => void
}

const ReaderPage = memo(function ReaderPage({
  manga,
  api,
  serverUrl,
  userUuid,
  index,
  width,
  height,
  onImageError,
  onTap,
}: ReaderPageProps) {
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const source = mangaPageImageSource(
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
  }, [source.cacheKey, attempt])

  return (
    <Pressable onPress={onTap} style={[styles.page, { width, height }]}>
      {!failed
        ? (
            <Image
              cachePolicy="memory-disk"
              contentFit="contain"
              key={attempt}
              onError={() => {
                setLoading(false)
                setFailed(true)
                onImageError()
              }}
              onLoad={() => setLoading(false)}
              recyclingKey={`${manga.uuid}:${index}:${manga.updateAt}`}
              source={source}
              style={StyleSheet.absoluteFill}
            />
          )
        : (
            <Pressable
              accessibilityRole="button"
              onPress={event => {
                event.stopPropagation()
                setAttempt(value => value + 1)
                setFailed(false)
              }}
              style={styles.pageFailure}
            >
              <Ionicons color="#a3a3a3" name="image-outline" size={42} />
              <Text style={styles.pageFailureTitle}>第 {index + 1} 页加载失败</Text>
              <Text style={styles.pageFailureAction}>点击重试</Text>
            </Pressable>
          )}
      {loading && !failed
        ? <ActivityIndicator color="#ffffff" size="large" style={styles.pageLoading} />
        : null}
    </Pressable>
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
  topBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 6,
    backgroundColor: 'rgba(0,0,0,0.82)',
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
  readerTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  controlSpacer: {
    width: 44,
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
