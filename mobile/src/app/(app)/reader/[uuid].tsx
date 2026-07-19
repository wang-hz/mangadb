import { useQuery } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ApiError } from '@/api/client'
import { getManga } from '@/api/mangas'
import type { MangaDetail } from '@/api/types'
import { PrimaryButton } from '@/components/PrimaryButton'
import { PagedReader } from '@/components/reader/PagedReader'
import { useSession } from '@/session/SessionContext'
import { colors } from '@/theme/colors'
import { clampPageIndex, parsePageIndexParam } from '@/utils/reader'

export default function ReaderScreen() {
  const params = useLocalSearchParams<{
    uuid?: string | string[]
    title?: string | string[]
    page?: string | string[]
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
                    initialPageIndex={parsePageIndexParam(params.page)}
                    manga={query.data}
                    onImageError={() => { void query.refetch() }}
                  />
                )
              : null}
    </View>
  )
}

function ReaderContent({
  manga,
  initialPageIndex,
  onImageError,
}: {
  manga: MangaDetail
  initialPageIndex: number
  onImageError: () => void
}) {
  const { api, auth, serverUrl } = useSession()
  const [pageIndex, setPageIndex] = useState(() => clampPageIndex(initialPageIndex, manga.pages.length))

  useEffect(() => {
    setPageIndex(index => clampPageIndex(index, manga.pages.length))
  }, [manga.pages.length])

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

  return (
    <PagedReader
      api={api!}
      manga={manga}
      onBack={goBackOrLibrary}
      onImageError={onImageError}
      onPageChange={setPageIndex}
      pageIndex={pageIndex}
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
