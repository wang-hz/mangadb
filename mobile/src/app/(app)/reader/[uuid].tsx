import { useQuery } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ApiError } from '@/api/client'
import { getManga } from '@/api/mangas'
import type { MangaDetail } from '@/api/types'
import { PrimaryButton } from '@/components/PrimaryButton'
import { ReaderExperience } from '@/components/reader/ReaderExperience'
import { useLocalDownload } from '@/downloads/useLocalDownload'
import { useReaderPreferences } from '@/providers/ReaderPreferencesContext'
import { useSession } from '@/session/SessionContext'
import {
  loadReadingProgress,
  type ReadingProgress,
} from '@/storage/progress'
import { colors } from '@/theme/colors'
import {
  clampPageIndex,
  parsePageIndexParam,
  resolveInitialReaderMode,
} from '@/utils/reader'
import { createSingleFlight } from '@/utils/singleFlight'

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
  const metadataRefresh = useRef(createSingleFlight()).current
  const localDownload = useLocalDownload(mangaUuid)
  const query = useQuery({
    queryKey: ['manga', serverUrl, auth?.user.uuid, mangaUuid],
    queryFn: ({ signal }) => getManga(api!, mangaUuid!, signal),
    enabled: Boolean(api && auth && serverUrl && mangaUuid),
  })
  const refreshMetadata = useCallback(
    () => metadataRefresh.run(async () => {
      await query.refetch({ cancelRefetch: false })
    }),
    [metadataRefresh, query],
  )
  const manga = localDownload.status === 'loading'
    ? null
    : query.data ?? localDownload.manga
  const localPageUris = localDownload.status === 'available'
    ? localDownload.pageUris
    : null

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
        : manga
          ? (
              <ReaderContent
                localPageUris={localPageUris ?? undefined}
                manga={manga}
                onReturnToDetail={() => {
                  router.replace({
                    pathname: '/(app)/manga/[uuid]',
                    params: { uuid: manga.uuid },
                  })
                }}
                onRefreshMetadata={refreshMetadata}
                requestedMode={firstParam(params.mode)}
                requestedPage={firstParam(params.page)}
              />
            )
          : (query.isPending && query.fetchStatus !== 'paused') ||
              localDownload.status === 'loading'
          ? <ReaderState loading message="正在准备漫画页面" title={fallbackTitle || '加载阅读器'} />
          : query.isError ||
              query.fetchStatus === 'paused' ||
              localDownload.status === 'error'
            ? (
                <ReaderState
                  action={query.error instanceof ApiError && query.error.status === 404
                    ? goBackOrLibrary
                    : () => { void query.refetch() }}
                  actionLabel={query.error instanceof ApiError && query.error.status === 404 ? '返回漫画库' : '重试'}
                  message={localDownload.error ||
                    (query.fetchStatus === 'paused'
                      ? '当前处于离线状态，且本机没有可用的完整下载。'
                      : query.error
                        ? readerErrorMessage(query.error)
                        : '本机下载不可用，请联网后重试。')}
                  title="阅读器加载失败"
                />
              )
            : null}
    </View>
  )
}

function ReaderContent({
  manga,
  onRefreshMetadata,
  requestedPage,
  requestedMode,
  localPageUris,
  onReturnToDetail,
}: {
  manga: MangaDetail
  onRefreshMetadata: () => Promise<void>
  requestedPage?: string
  requestedMode?: string
  localPageUris?: readonly string[]
  onReturnToDetail: () => void
}) {
  const { api, auth, serverUrl } = useSession()
  const { preferences, status: preferencesStatus } = useReaderPreferences()
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

  if (preferencesStatus === 'loading') {
    return <ReaderState loading message="正在加载阅读设置" title={manga.displayTitle} />
  }

  const progress = loadedProgress.value
  const hasPendingOverride = consumedOverrideIdentityRef.current !== sessionIdentity &&
    (requestedPage !== undefined || requestedMode !== undefined)
  const initialPageIndex = !hasPendingOverride || requestedPage === undefined
    ? progress?.pageIndex ?? 0
    : parsePageIndexParam(requestedPage)
  const initialMode = resolveInitialReaderMode(
    hasPendingOverride ? requestedMode : undefined,
    progress?.mode,
    preferences.defaultMode,
  )

  return (
    <ReaderExperience
      api={api!}
      initialMode={initialMode}
      initialCompleted={progress?.state === 'completed'}
      initialPageIndex={clampPageIndex(initialPageIndex, manga.pages.length)}
      key={JSON.stringify([
        serverUrl,
        auth!.user.uuid,
        manga.uuid,
        manga.pages.length,
        progress?.updatedAt ?? 'new',
      ])}
      manga={manga}
      localPageUris={localPageUris}
      onBack={goBackOrLibrary}
      onRefreshMetadata={onRefreshMetadata}
      onReaderReady={markOverrideConsumed}
      onReturnToDetail={onReturnToDetail}
      preferences={preferences}
      serverUrl={serverUrl!}
      userUuid={auth!.user.uuid}
    />
  )
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
