import { useQuery } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ApiError, type ApiClient } from '@/api/client'
import { getManga } from '@/api/mangas'
import type { MangaDetail } from '@/api/types'
import { PrimaryButton } from '@/components/PrimaryButton'
import { PagedReader } from '@/components/reader/PagedReader'
import { ScrollingReader } from '@/components/reader/ScrollingReader'
import { useSession } from '@/session/SessionContext'
import {
  loadReadingProgress,
  type ReadingProgress,
  saveReadingProgress,
} from '@/storage/progress'
import { colors } from '@/theme/colors'
import {
  clampPageIndex,
  parsePageIndexParam,
  parseReaderMode,
  type ReaderMode,
} from '@/utils/reader'

export default function ReaderScreen() {
  const params = useLocalSearchParams<{
    uuid?: string | string[]
    title?: string | string[]
    page?: string | string[]
    mode?: string | string[]
  }>()
  const mangaUuid = firstParam(params.uuid)
  const fallbackTitle = firstParam(params.title)
  const { api, auth, serverUrl } = useSession()
  const query = useQuery({
    queryKey: ['manga', serverUrl, auth?.user.uuid, mangaUuid],
    queryFn: ({ signal }) => getManga(api!, mangaUuid!, signal),
    enabled: Boolean(api && auth && serverUrl && mangaUuid),
  })

  return (
    <View style={styles.root}>
      <StatusBar hidden style="light" />
      {!mangaUuid
        ? (
            <ReaderState
              action={goBackOrLibrary}
              actionLabel="返回漫画库"
              message="漫画地址无效。"
              title="无法打开阅读器"
            />
          )
        : query.isPending
          ? <ReaderState loading message="正在准备漫画页面" title={fallbackTitle || '加载阅读器'} />
          : query.isError
            ? (
                <ReaderState
                  action={query.error instanceof ApiError && query.error.status === 404
                    ? goBackOrLibrary
                    : () => { void query.refetch() }}
                  actionLabel={query.error instanceof ApiError && query.error.status === 404 ? '返回漫画库' : '重试'}
                  message={readerErrorMessage(query.error)}
                  title="阅读器加载失败"
                />
              )
            : query.data
              ? (
                  <ReaderContent
                    manga={query.data}
                    onImageError={() => { void query.refetch() }}
                    requestedMode={firstParam(params.mode)}
                    requestedPage={firstParam(params.page)}
                  />
                )
              : null}
    </View>
  )
}

function ReaderContent({
  manga,
  onImageError,
  requestedPage,
  requestedMode,
}: {
  manga: MangaDetail
  onImageError: () => void
  requestedPage?: string
  requestedMode?: string
}) {
  const { api, auth, serverUrl } = useSession()
  const sessionIdentity = [serverUrl, auth?.user.uuid, manga.uuid].join(':')
  const progressIdentity = [serverUrl, auth?.user.uuid, manga.uuid, manga.pages.length].join(':')
  const [loadedProgress, setLoadedProgress] = useState<{
    identity: string
    value: ReadingProgress | null
  } | null>(null)
  const consumedOverrideIdentityRef = useRef<string | null>(null)
  const markOverrideConsumed = useCallback(() => {
    if (requestedPage !== undefined || requestedMode !== undefined) {
      consumedOverrideIdentityRef.current = sessionIdentity
    }
  }, [requestedPage, requestedMode, sessionIdentity])

  useEffect(() => {
    let active = true
    loadReadingProgress(
      serverUrl!,
      auth!.user.uuid,
      manga.uuid,
      manga.pages.length,
    )
      .then(value => {
        if (active) setLoadedProgress({ identity: progressIdentity, value })
      })
      .catch(() => {
        if (active) setLoadedProgress({ identity: progressIdentity, value: null })
      })
    return () => { active = false }
  }, [serverUrl, auth?.user.uuid, manga.uuid, manga.pages.length, progressIdentity])

  if (manga.pages.length === 0) {
    return (
      <ReaderState
        action={goBackOrLibrary}
        actionLabel="返回"
        message="此漫画没有可阅读的页面。"
        title={manga.displayTitle}
      />
    )
  }

  if (loadedProgress?.identity !== progressIdentity) {
    return <ReaderState loading message="正在恢复本机阅读位置" title={manga.displayTitle} />
  }

  const progress = loadedProgress.value
  const hasPendingOverride = consumedOverrideIdentityRef.current !== sessionIdentity &&
    (requestedPage !== undefined || requestedMode !== undefined)
  const initialPageIndex = !hasPendingOverride || requestedPage === undefined
    ? progress?.pageIndex ?? 0
    : parsePageIndexParam(requestedPage)
  const initialMode = (hasPendingOverride ? parseReaderMode(requestedMode) : undefined) ??
    progress?.mode ??
    'paged'

  return (
    <ReaderExperience
      api={api!}
      initialMode={initialMode}
      initialPageIndex={clampPageIndex(initialPageIndex, manga.pages.length)}
      key={JSON.stringify([
        serverUrl,
        auth!.user.uuid,
        manga.uuid,
        manga.pages.length,
        progress?.updatedAt ?? 'new',
      ])}
      manga={manga}
      onImageError={onImageError}
      onReaderReady={markOverrideConsumed}
      serverUrl={serverUrl!}
      userUuid={auth!.user.uuid}
    />
  )
}

function ReaderExperience({
  manga,
  api,
  serverUrl,
  userUuid,
  initialPageIndex,
  initialMode,
  onImageError,
  onReaderReady,
}: {
  manga: MangaDetail
  api: ApiClient
  serverUrl: string
  userUuid: string
  initialPageIndex: number
  initialMode: ReaderMode
  onImageError: () => void
  onReaderReady: () => void
}) {
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
    onBack: goBackOrLibrary,
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

function ReaderState({
  title,
  message,
  loading = false,
  action,
  actionLabel,
}: {
  title: string
  message: string
  loading?: boolean
  action?: () => void
  actionLabel?: string
}) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.state, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      {loading ? <ActivityIndicator color="#ffffff" size="large" /> : null}
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {action && actionLabel
        ? <View style={styles.action}><PrimaryButton onPress={action}>{actionLabel}</PrimaryButton></View>
        : null}
    </View>
  )
}

function readerErrorMessage(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return '该漫画不存在或已被删除。'
    if (error.status === 403) return '当前账号没有阅读权限。'
    return error.message
  }
  return '请检查网络连接后重试。'
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function goBackOrLibrary() {
  if (router.canGoBack()) router.back()
  else router.replace('/(app)/(tabs)/mangas')
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.reader,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 28,
    backgroundColor: colors.reader,
  },
  stateTitle: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateMessage: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  action: {
    minWidth: 180,
    marginTop: 6,
  },
})
