import { Ionicons } from '@expo/vector-icons'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { ApiError } from '@/api/client'
import { nextMangaPage, uniqueMangas } from '@/api/mangas'
import { getMangasByTag, getTag } from '@/api/tags'
import type { MangaSummary } from '@/api/types'
import { MangaCard } from '@/components/MangaCard'
import { PrimaryButton } from '@/components/PrimaryButton'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAdaptiveGridAnchor } from '@/hooks/useAdaptiveGridAnchor'
import { useRecentReading } from '@/hooks/useRecentReading'
import { useSession } from '@/session/SessionContext'
import { colors } from '@/theme/colors'
import { adaptiveGridLayout } from '@/utils/grid'

const GRID_PADDING = 12
const GRID_GAP = 12

export default function TagMangasScreen() {
  const params = useLocalSearchParams<{ uuid?: string | string[]; name?: string | string[] }>()
  const tagUuid = firstParam(params.uuid)
  const fallbackName = firstParam(params.name)
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { api, auth, serverUrl } = useSession()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim(), 350)
  const recentReading = useRecentReading(serverUrl, auth?.user.uuid)
  const grid = useMemo(() => adaptiveGridLayout(width, {
    horizontalPadding: GRID_PADDING,
    gap: GRID_GAP,
  }), [width])
  const enabled = Boolean(api && auth && serverUrl && tagUuid)

  const tagQuery = useQuery({
    queryKey: ['tag', serverUrl, auth?.user.uuid, tagUuid],
    queryFn: ({ signal }) => getTag(api!, tagUuid!, signal),
    enabled,
  })
  const mangasQuery = useInfiniteQuery({
    queryKey: ['tag-mangas', serverUrl, auth?.user.uuid, tagUuid, { search: debouncedSearch }],
    queryFn: ({ pageParam, signal }) => getMangasByTag(api!, {
      tagUuid: tagUuid!,
      page: pageParam,
      search: debouncedSearch,
    }, signal),
    initialPageParam: 1,
    getNextPageParam: nextMangaPage,
    enabled,
  })

  const mangas = useMemo(() => uniqueMangas(mangasQuery.data?.pages ?? []), [mangasQuery.data])
  const total = mangasQuery.data?.pages[0]?.total ?? 0
  const cardWidth = grid.cardWidth
  const progressByManga = useMemo(
    () => new Map(recentReading.allEntries.map(entry => [entry.manga.uuid, entry])),
    [recentReading.allEntries],
  )
  const gridAnchor = useAdaptiveGridAnchor<MangaSummary>(grid.columns, mangas.length)
  const title = tagQuery.data?.name ?? fallbackName ?? '标签漫画'
  const subtitle = tagQuery.data?.tagType.name
  const openManga = useCallback((uuid: string) => {
    router.push({ pathname: '/(app)/manga/[uuid]', params: { uuid } })
  }, [])

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <ScreenHeader onBack={() => router.back()} subtitle={subtitle} title={title} />
      </SafeAreaView>
      {!tagUuid
        ? (
            <MessageState message="标签地址无效。" title="无法打开标签" />
          )
        : tagQuery.isError && !tagQuery.data
          ? (
              <MessageState
                action={() => { void tagQuery.refetch() }}
                actionLabel="重试"
                message={tagDetailError(tagQuery.error)}
                title="标签加载失败"
              />
            )
          : (
              <FlatList
                columnWrapperStyle={styles.row}
                contentContainerStyle={[
                  styles.content,
                  { paddingBottom: Math.max(28, insets.bottom + 12) },
                ]}
                data={mangas}
                initialNumToRender={8}
                key={gridAnchor.key}
                keyboardDismissMode="on-drag"
                keyExtractor={item => item.uuid}
                ListEmptyComponent={(
                  <MangaListState
                    error={mangasQuery.error}
                    loading={mangasQuery.isPending}
                    onRetry={() => { void mangasQuery.refetch() }}
                    searching={Boolean(debouncedSearch)}
                  />
                )}
                ListFooterComponent={mangasQuery.isFetchingNextPage
                  ? <ActivityIndicator color={colors.brand} style={styles.footer} />
                  : mangasQuery.isFetchNextPageError
                    ? (
                        <Pressable
                          onPress={() => { void mangasQuery.fetchNextPage() }}
                          style={styles.footerRetry}
                        >
                          <Text style={styles.footerRetryText}>下一页加载失败，点击重试</Text>
                        </Pressable>
                      )
                    : mangas.length > 0 && !mangasQuery.hasNextPage
                      ? <Text style={styles.endText}>已加载全部 {total} 本漫画</Text>
                      : null}
                ListHeaderComponent={(
                  <View style={styles.listHeader}>
                    <View style={styles.searchBox}>
                      <Ionicons color={colors.muted} name="search" size={20} />
                      <TextInput
                        accessibilityLabel="搜索标签下的漫画"
                        autoCorrect={false}
                        clearButtonMode="while-editing"
                        onChangeText={setSearch}
                        placeholder="搜索此标签下的标题"
                        placeholderTextColor={colors.muted}
                        returnKeyType="search"
                        style={styles.searchInput}
                        value={search}
                      />
                    </View>
                    <Text style={styles.count}>{total > 0 ? `共 ${total} 本` : '标签漫画'}</Text>
                  </View>
                )}
                maxToRenderPerBatch={8}
                numColumns={grid.columns}
                onEndReached={() => {
                  if (mangasQuery.hasNextPage && !mangasQuery.isFetchingNextPage) {
                    void mangasQuery.fetchNextPage()
                  }
                }}
                onEndReachedThreshold={0.45}
                onScrollToIndexFailed={gridAnchor.onScrollToIndexFailed}
                onViewableItemsChanged={gridAnchor.onViewableItemsChanged}
                ref={gridAnchor.listRef}
                refreshControl={(
                  <RefreshControl
                    colors={[colors.brand]}
                    onRefresh={() => { void Promise.all([mangasQuery.refetch(), tagQuery.refetch()]) }}
                    refreshing={mangasQuery.isRefetching || tagQuery.isRefetching}
                    tintColor={colors.brand}
                  />
                )}
                removeClippedSubviews={Platform.OS === 'android'}
                renderItem={({ item }) => (
                  <MangaCard
                    api={api!}
                    manga={item}
                    onPress={openManga}
                    progress={progressByManga.get(item.uuid)}
                    serverUrl={serverUrl!}
                    userUuid={auth!.user.uuid}
                    width={cardWidth}
                  />
                )}
                style={styles.list}
                windowSize={7}
              />
            )}
    </View>
  )
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function MessageState({
  title,
  message,
  action,
  actionLabel,
}: {
  title: string
  message: string
  action?: () => void
  actionLabel?: string
}) {
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {action && actionLabel ? <PrimaryButton onPress={action}>{actionLabel}</PrimaryButton> : null}
    </View>
  )
}

function MangaListState({
  loading,
  error,
  searching,
  onRetry,
}: {
  loading: boolean
  error: Error | null
  searching: boolean
  onRetry: () => void
}) {
  if (loading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.stateTitle}>正在加载漫画</Text>
      </View>
    )
  }
  if (error) {
    return (
      <MessageState
        action={onRetry}
        actionLabel="重试"
        message={tagDetailError(error)}
        title="漫画加载失败"
      />
    )
  }
  return (
    <MessageState
      message={searching ? '换个关键词再试试。' : '该标签下暂时没有漫画。'}
      title={searching ? '没有匹配的漫画' : '暂无漫画'}
    />
  )
}

function tagDetailError(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return '该标签不存在或已被删除。'
    if (error.status === 403) return '当前账号没有浏览权限。'
    return error.message
  }
  return '请检查网络连接后重试。'
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerSafeArea: {
    backgroundColor: colors.header,
  },
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    gap: GRID_GAP,
    padding: GRID_PADDING,
    paddingBottom: 28,
  },
  row: {
    gap: GRID_GAP,
  },
  listHeader: {
    gap: 10,
    marginBottom: 2,
  },
  searchBox: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
  },
  count: {
    color: colors.muted,
    fontSize: 13,
  },
  state: {
    flex: 1,
    minHeight: 330,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 28,
    backgroundColor: colors.background,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateMessage: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  footer: {
    paddingVertical: 18,
  },
  footerRetry: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  footerRetryText: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: '600',
  },
  endText: {
    paddingVertical: 14,
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },
})
