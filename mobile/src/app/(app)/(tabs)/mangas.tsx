import { Ionicons } from '@expo/vector-icons'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
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
import { getAllTags } from '@/api/tags'
import type { MangaSortBy, MangaSummary, SortOrder } from '@/api/types'
import { MangaCard } from '@/components/MangaCard'
import { CatalogFilterSheet } from '@/components/catalog/CatalogFilterSheet'
import { PrimaryButton } from '@/components/PrimaryButton'
import { RecentReadingSection } from '@/components/RecentReadingSection'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useFavorites } from '@/hooks/useFavorites'
import { useCatalogFilters } from '@/hooks/useCatalogFilters'
import { useAdaptiveGridAnchor } from '@/hooks/useAdaptiveGridAnchor'
import { useRecentReading } from '@/hooks/useRecentReading'
import { useSession } from '@/session/SessionContext'
import { useDownloadedMangaUuids } from '@/downloads/DownloadContext'
import { matchesLocalMangaFilters } from '@/catalog/mangaFilters'
import { activeCatalogFilterCount } from '@/storage/catalogFilters'
import type { RecentReadingEntry } from '@/storage/progress'
import { colors } from '@/theme/colors'
import { adaptiveGridLayout } from '@/utils/grid'

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
  const [filtersVisible, setFiltersVisible] = useState(false)
  const catalog = useCatalogFilters(serverUrl, auth?.user.uuid)
  const { filters } = catalog
  const debouncedSearch = useDebouncedValue(filters.search.trim(), 350)
  const recentReading = useRecentReading(serverUrl, auth?.user.uuid)
  const favorites = useFavorites(serverUrl, auth?.user.uuid)
  const downloadedUuids = useDownloadedMangaUuids()
  const tagsQuery = useQuery({
    queryKey: ['catalog-filter-tags', serverUrl, auth?.user.uuid],
    queryFn: ({ signal }) => getAllTags(api!, signal),
    enabled: Boolean(api && auth && serverUrl && filtersVisible),
    staleTime: 5 * 60 * 1000,
  })
  const grid = useMemo(() => adaptiveGridLayout(width, {
    horizontalPadding: GRID_PADDING,
    gap: GRID_GAP,
  }), [width])

  const query = useInfiniteQuery({
    queryKey: [
      'mangas',
      serverUrl,
      auth?.user.uuid,
      {
        search: debouncedSearch,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        tagUuids: filters.tagUuids,
        publishYearFrom: filters.publishYearFrom,
        publishYearTo: filters.publishYearTo,
      },
    ],
    queryFn: ({ pageParam, signal }) => getMangas(api!, {
      page: pageParam,
      search: debouncedSearch,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      tagUuids: filters.tagUuids,
      publishYearFrom: filters.publishYearFrom ?? undefined,
      publishYearTo: filters.publishYearTo ?? undefined,
    }, signal),
    initialPageParam: 1,
    getNextPageParam: nextMangaPage,
    enabled: Boolean(api && auth && serverUrl && catalog.loaded),
  })

  const serverMangas = useMemo(
    () => uniqueMangas(query.data?.pages ?? []),
    [query.data],
  )
  const progressByManga = useMemo(
    () => new Map(recentReading.allEntries.map(entry => [entry.manga.uuid, entry])),
    [recentReading.allEntries],
  )
  const mangas = useMemo(() => serverMangas.filter(manga =>
    matchesLocalMangaFilters(
      manga.uuid,
      filters,
      progressByManga.get(manga.uuid),
      favorites.uuids.has(manga.uuid),
      downloadedUuids.has(manga.uuid),
    )), [downloadedUuids, favorites.uuids, filters, progressByManga, serverMangas])
  const activeFilterCount = activeCatalogFilterCount(filters)
  const hasLocalFilters = filters.readingState !== 'all' ||
    filters.favoriteOnly ||
    filters.downloadedOnly
  const gridAnchor = useAdaptiveGridAnchor<MangaSummary>(grid.columns, mangas.length)
  const total = query.data?.pages[0]?.total ?? 0
  const cardWidth = grid.cardWidth
  const openManga = useCallback((uuid: string) => {
    router.push({ pathname: '/(app)/manga/[uuid]', params: { uuid } })
  }, [])
  const continueReading = useCallback((entry: RecentReadingEntry) => {
    router.push({
      pathname: '/(app)/reader/[uuid]',
      params: {
        uuid: entry.manga.uuid,
        title: entry.manga.displayTitle || entry.manga.originalTitle,
        page: String(entry.pageIndex),
        mode: entry.mode,
      },
    })
  }, [])

  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
  }
  return (
    <>
      <FlatList
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.content}
      data={mangas}
      initialNumToRender={8}
      key={gridAnchor.key}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      keyExtractor={item => item.uuid}
      ListEmptyComponent={(
        <LibraryState
          error={query.error}
          loading={query.isPending}
          onRetry={() => { void query.refetch() }}
          onContinueLoading={hasLocalFilters && query.hasNextPage
            ? () => { void query.fetchNextPage() }
            : undefined}
          searching={Boolean(debouncedSearch || activeFilterCount)}
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
          api={api!}
          activeFilterCount={activeFilterCount}
          countLabel={hasLocalFilters
            ? `已显示 ${mangas.length} 本 · 服务器筛选匹配 ${total} 本`
            : total > 0 ? `共 ${total} 本` : '漫画库'}
          onChangeSearch={search => catalog.updateFilters({ ...filters, search })}
          onChangeSort={sortBy => catalog.updateFilters({ ...filters, sortBy })}
          onOpenFilters={() => setFiltersVisible(true)}
          onToggleOrder={() => catalog.updateFilters({
            ...filters,
            sortOrder: filters.sortOrder === 'desc' ? 'asc' : 'desc',
          })}
          onContinueReading={continueReading}
          recentEntries={recentReading.entries}
          search={filters.search}
          sortBy={filters.sortBy}
          sortOrder={filters.sortOrder}
          serverUrl={serverUrl!}
          userUuid={auth!.user.uuid}
        />
      )}
      maxToRenderPerBatch={8}
      numColumns={grid.columns}
      onEndReached={loadMore}
      onEndReachedThreshold={0.45}
      onScrollToIndexFailed={gridAnchor.onScrollToIndexFailed}
      onViewableItemsChanged={gridAnchor.onViewableItemsChanged}
      ref={gridAnchor.listRef}
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
          favorite={favorites.uuids.has(item.uuid)}
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
      <CatalogFilterSheet
        filters={filters}
        onApply={catalog.updateFilters}
        onClose={() => setFiltersVisible(false)}
        tags={tagsQuery.data ?? []}
        tagsLoading={tagsQuery.isPending}
        visible={filtersVisible}
      />
    </>
  )
}

interface LibraryHeaderProps {
  api: Parameters<typeof RecentReadingSection>[0]['api']
  search: string
  sortBy: MangaSortBy
  sortOrder: SortOrder
  activeFilterCount: number
  countLabel: string
  recentEntries: readonly RecentReadingEntry[]
  serverUrl: string
  userUuid: string
  onChangeSearch: (value: string) => void
  onChangeSort: (value: MangaSortBy) => void
  onOpenFilters: () => void
  onToggleOrder: () => void
  onContinueReading: (entry: RecentReadingEntry) => void
}

function LibraryHeader({
  api,
  activeFilterCount,
  countLabel,
  search,
  sortBy,
  sortOrder,
  recentEntries,
  serverUrl,
  userUuid,
  onChangeSearch,
  onChangeSort,
  onOpenFilters,
  onToggleOrder,
  onContinueReading,
}: LibraryHeaderProps) {
  return (
    <View style={styles.header}>
      <RecentReadingSection
        api={api}
        entries={recentEntries}
        onContinue={onContinueReading}
        serverUrl={serverUrl}
        userUuid={userUuid}
      />
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
        <Pressable
          accessibilityLabel={`筛选${activeFilterCount > 0 ? `，已启用 ${activeFilterCount} 项` : ''}`}
          accessibilityRole="button"
          onPress={onOpenFilters}
          style={[styles.filterButton, activeFilterCount > 0 ? styles.filterButtonActive : null]}
        >
          <Ionicons
            color={activeFilterCount > 0 ? '#ffffff' : colors.brand}
            name="options-outline"
            size={17}
          />
          <Text style={[
            styles.filterButtonText,
            activeFilterCount > 0 ? styles.filterButtonTextActive : null,
          ]}>
            筛选{activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.count}>{countLabel}</Text>
    </View>
  )
}

interface LibraryStateProps {
  loading: boolean
  error: Error | null
  searching: boolean
  onRetry: () => void
  onContinueLoading?: () => void
}

function LibraryState({
  loading,
  error,
  searching,
  onRetry,
  onContinueLoading,
}: LibraryStateProps) {
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
      {onContinueLoading
        ? <PrimaryButton onPress={onContinueLoading}>继续加载并筛选</PrimaryButton>
        : null}
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
    flexWrap: 'wrap',
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
  filterButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: 999,
  },
  filterButtonActive: {
    backgroundColor: colors.brand,
  },
  filterButtonText: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: '700',
  },
  filterButtonTextActive: {
    color: '#ffffff',
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
