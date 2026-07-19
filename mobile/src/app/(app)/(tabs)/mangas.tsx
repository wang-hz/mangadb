import { Ionicons } from '@expo/vector-icons'
import { useInfiniteQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
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
import { ApiError } from '@/api/client'
import { getMangas, nextMangaPage, uniqueMangas } from '@/api/mangas'
import type { MangaSortBy, MangaSummary, SortOrder } from '@/api/types'
import { MangaCard } from '@/components/MangaCard'
import { PrimaryButton } from '@/components/PrimaryButton'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useSession } from '@/session/SessionContext'
import { colors } from '@/theme/colors'

const GRID_PADDING = 12
const GRID_GAP = 12

const SORT_OPTIONS: Array<{ label: string; value: MangaSortBy }> = [
  { label: '最近更新', value: 'updateAt' },
  { label: '最近添加', value: 'createAt' },
  { label: '出版日期', value: 'publishDate' },
]

export default function MangasScreen() {
  const { width } = useWindowDimensions()
  const { api, auth, serverUrl } = useSession()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<MangaSortBy>('updateAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const debouncedSearch = useDebouncedValue(search.trim(), 350)

  const query = useInfiniteQuery({
    queryKey: [
      'mangas',
      serverUrl,
      auth?.user.uuid,
      { search: debouncedSearch, sortBy, sortOrder },
    ],
    queryFn: ({ pageParam, signal }) => getMangas(api!, {
      page: pageParam,
      search: debouncedSearch,
      sortBy,
      sortOrder,
    }, signal),
    initialPageParam: 1,
    getNextPageParam: nextMangaPage,
    enabled: Boolean(api && auth && serverUrl),
  })

  const mangas = useMemo(
    () => uniqueMangas(query.data?.pages ?? []),
    [query.data],
  )
  const total = query.data?.pages[0]?.total ?? 0
  const cardWidth = (width - GRID_PADDING * 2 - GRID_GAP) / 2
  const openManga = useCallback((uuid: string) => {
    router.push({ pathname: '/(app)/manga/[uuid]', params: { uuid } })
  }, [])

  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
  }

  return (
    <FlatList
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.content}
      data={mangas}
      initialNumToRender={8}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      keyExtractor={item => item.uuid}
      ListEmptyComponent={(
        <LibraryState
          error={query.error}
          loading={query.isPending}
          onRetry={() => { void query.refetch() }}
          searching={Boolean(debouncedSearch)}
        />
      )}
      ListFooterComponent={query.isFetchingNextPage
        ? <ActivityIndicator color={colors.brand} style={styles.footer} />
        : query.isFetchNextPageError
          ? (
              <View style={styles.pageError}>
                <Text style={styles.pageErrorText}>下一页加载失败</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => { void query.fetchNextPage() }}
                  style={styles.pageRetry}
                >
                  <Text style={styles.pageRetryText}>重试</Text>
                </Pressable>
              </View>
            )
          : mangas.length > 0 && !query.hasNextPage
            ? <Text style={styles.endText}>已加载全部 {total} 本漫画</Text>
            : null}
      ListHeaderComponent={(
        <LibraryHeader
          onChangeSearch={setSearch}
          onChangeSort={setSortBy}
          onToggleOrder={() => setSortOrder(order => order === 'desc' ? 'asc' : 'desc')}
          search={search}
          sortBy={sortBy}
          sortOrder={sortOrder}
          total={total}
        />
      )}
      maxToRenderPerBatch={8}
      numColumns={2}
      onEndReached={loadMore}
      onEndReachedThreshold={0.45}
      refreshControl={(
        <RefreshControl
          colors={[colors.brand]}
          onRefresh={() => { void query.refetch() }}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          tintColor={colors.brand}
        />
      )}
      removeClippedSubviews={Platform.OS === 'android'}
      renderItem={({ item }) => (
        <MangaCard
          api={api!}
          manga={item}
          onPress={openManga}
          serverUrl={serverUrl!}
          userUuid={auth!.user.uuid}
          width={cardWidth}
        />
      )}
      style={styles.list}
      windowSize={7}
    />
  )
}

interface LibraryHeaderProps {
  search: string
  sortBy: MangaSortBy
  sortOrder: SortOrder
  total: number
  onChangeSearch: (value: string) => void
  onChangeSort: (value: MangaSortBy) => void
  onToggleOrder: () => void
}

function LibraryHeader({
  search,
  sortBy,
  sortOrder,
  total,
  onChangeSearch,
  onChangeSort,
  onToggleOrder,
}: LibraryHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.searchBox}>
        <Ionicons color={colors.muted} name="search" size={20} />
        <TextInput
          accessibilityLabel="搜索漫画"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={onChangeSearch}
          placeholder="搜索标题"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          style={styles.searchInput}
          value={search}
        />
      </View>
      <View style={styles.sortRow}>
        <View style={styles.sortOptions}>
          {SORT_OPTIONS.map(option => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: sortBy === option.value }}
              key={option.value}
              onPress={() => onChangeSort(option.value)}
              style={[styles.sortChip, sortBy === option.value ? styles.sortChipActive : null]}
            >
              <Text style={sortBy === option.value ? styles.sortTextActive : styles.sortText}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={onToggleOrder} style={styles.orderButton}>
          <Ionicons
            color={colors.brand}
            name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
            size={17}
          />
          <Text style={styles.orderText}>{sortOrder === 'desc' ? '降序' : '升序'}</Text>
        </Pressable>
      </View>
      <Text style={styles.count}>{total > 0 ? `共 ${total} 本` : '漫画库'}</Text>
    </View>
  )
}

interface LibraryStateProps {
  loading: boolean
  error: Error | null
  searching: boolean
  onRetry: () => void
}

function LibraryState({ loading, error, searching, onRetry }: LibraryStateProps) {
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
      <View style={styles.state}>
        <Ionicons color={colors.danger} name="cloud-offline-outline" size={42} />
        <Text style={styles.stateTitle}>漫画加载失败</Text>
        <Text style={styles.stateMessage}>{libraryErrorMessage(error)}</Text>
        <PrimaryButton onPress={onRetry}>重试</PrimaryButton>
      </View>
    )
  }
  return (
    <View style={styles.state}>
      <Ionicons color={colors.muted} name="library-outline" size={42} />
      <Text style={styles.stateTitle}>{searching ? '没有匹配的漫画' : '漫画库还是空的'}</Text>
      <Text style={styles.stateMessage}>
        {searching ? '换个关键词再试试。' : '服务器中添加漫画后，可在这里下拉刷新。'}
      </Text>
    </View>
  )
}

function libraryErrorMessage(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return '当前账号没有浏览漫画的权限。'
    if (error.status === 404) return '服务器不支持移动端漫画列表接口。'
    return error.message
  }
  return '请检查网络连接后重试。'
}

const styles = StyleSheet.create({
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
  header: {
    gap: 12,
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
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sortOptions: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#e9edf3',
  },
  sortChipActive: {
    backgroundColor: colors.brand,
  },
  sortText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  sortTextActive: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  orderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
  },
  orderText: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: '600',
  },
  count: {
    color: colors.muted,
    fontSize: 13,
  },
  state: {
    minHeight: 340,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 28,
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
  pageError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  pageErrorText: {
    color: colors.danger,
    fontSize: 13,
  },
  pageRetry: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#e8f2ff',
  },
  pageRetryText: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: '700',
  },
  endText: {
    paddingVertical: 14,
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },
})
