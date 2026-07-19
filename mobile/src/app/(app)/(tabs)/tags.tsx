import { Ionicons } from '@expo/vector-icons'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { ApiError } from '@/api/client'
import { getAllTagTypes, getTags, nextTagPage, uniqueTags } from '@/api/tags'
import type { Tag } from '@/api/types'
import { PrimaryButton } from '@/components/PrimaryButton'
import { TagRow } from '@/components/TagRow'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useSession } from '@/session/SessionContext'
import { colors } from '@/theme/colors'

export default function TagsScreen() {
  const { api, auth, serverUrl } = useSession()
  const [search, setSearch] = useState('')
  const [tagTypeName, setTagTypeName] = useState<string | undefined>()
  const debouncedSearch = useDebouncedValue(search.trim(), 350)
  const identity = [serverUrl, auth?.user.uuid]

  const tagTypesQuery = useQuery({
    queryKey: ['tag-types', ...identity],
    queryFn: ({ signal }) => getAllTagTypes(api!, signal),
    enabled: Boolean(api && auth && serverUrl),
  })
  const tagsQuery = useInfiniteQuery({
    queryKey: ['tags', ...identity, { search: debouncedSearch, tagTypeName }],
    queryFn: ({ pageParam, signal }) => getTags(api!, {
      page: pageParam,
      search: debouncedSearch,
      tagTypeName,
    }, signal),
    initialPageParam: 1,
    getNextPageParam: nextTagPage,
    enabled: Boolean(api && auth && serverUrl),
  })

  const tags = useMemo(() => uniqueTags(tagsQuery.data?.pages ?? []), [tagsQuery.data])
  const total = tagsQuery.data?.pages[0]?.total ?? 0
  const openTag = useCallback((tag: Tag) => {
    router.push({
      pathname: '/(app)/tag/[uuid]',
      params: { uuid: tag.uuid, name: tag.name },
    })
  }, [])

  const refresh = () => {
    void Promise.all([tagsQuery.refetch(), tagTypesQuery.refetch()])
  }

  return (
    <FlatList
      contentContainerStyle={styles.content}
      data={tags}
      initialNumToRender={12}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      keyExtractor={item => item.uuid}
      ListEmptyComponent={(
        <TagListState
          error={tagsQuery.error}
          filtered={Boolean(debouncedSearch || tagTypeName)}
          loading={tagsQuery.isPending}
          onRetry={() => { void tagsQuery.refetch() }}
        />
      )}
      ListFooterComponent={tagsQuery.isFetchingNextPage
        ? <ActivityIndicator color={colors.brand} style={styles.footer} />
        : tagsQuery.isFetchNextPageError
          ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => { void tagsQuery.fetchNextPage() }}
                style={styles.footerRetry}
              >
                <Text style={styles.footerRetryText}>下一页加载失败，点击重试</Text>
              </Pressable>
            )
          : tags.length > 0 && !tagsQuery.hasNextPage
            ? <Text style={styles.endText}>已加载全部 {total} 个标签</Text>
            : null}
      ListHeaderComponent={(
        <View style={styles.header}>
          <View style={styles.searchBox}>
            <Ionicons color={colors.muted} name="search" size={20} />
            <TextInput
              accessibilityLabel="搜索标签"
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={setSearch}
              placeholder="搜索标签名称"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              style={styles.searchInput}
              value={search}
            />
          </View>
          <ScrollView
            contentContainerStyle={styles.filters}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            <FilterChip
              active={!tagTypeName}
              label="全部类型"
              onPress={() => setTagTypeName(undefined)}
            />
            {tagTypesQuery.data?.map(tagType => (
              <FilterChip
                active={tagTypeName === tagType.name}
                key={tagType.uuid}
                label={tagType.name}
                onPress={() => setTagTypeName(tagType.name)}
              />
            ))}
            {tagTypesQuery.isPending ? <ActivityIndicator color={colors.brand} /> : null}
          </ScrollView>
          {tagTypesQuery.isError
            ? (
                <Pressable onPress={() => { void tagTypesQuery.refetch() }}>
                  <Text style={styles.typeError}>类型筛选加载失败，点击重试</Text>
                </Pressable>
              )
            : null}
          <Text style={styles.count}>{total > 0 ? `共 ${total} 个标签` : '浏览标签'}</Text>
        </View>
      )}
      maxToRenderPerBatch={12}
      onEndReached={() => {
        if (tagsQuery.hasNextPage && !tagsQuery.isFetchingNextPage) void tagsQuery.fetchNextPage()
      }}
      onEndReachedThreshold={0.4}
      refreshControl={(
        <RefreshControl
          colors={[colors.brand]}
          onRefresh={refresh}
          refreshing={tagsQuery.isRefetching || tagTypesQuery.isRefetching}
          tintColor={colors.brand}
        />
      )}
      renderItem={({ item }) => <TagRow onPress={openTag} tag={item} />}
      style={styles.list}
      windowSize={8}
    />
  )
}

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.filterChip, active ? styles.filterChipActive : null]}
    >
      <Text style={active ? styles.filterTextActive : styles.filterText}>{label}</Text>
    </Pressable>
  )
}

function TagListState({
  loading,
  error,
  filtered,
  onRetry,
}: {
  loading: boolean
  error: Error | null
  filtered: boolean
  onRetry: () => void
}) {
  if (loading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.stateTitle}>正在加载标签</Text>
      </View>
    )
  }
  if (error) {
    return (
      <View style={styles.state}>
        <Ionicons color={colors.danger} name="cloud-offline-outline" size={42} />
        <Text style={styles.stateTitle}>标签加载失败</Text>
        <Text style={styles.stateMessage}>{tagErrorMessage(error)}</Text>
        <PrimaryButton onPress={onRetry}>重试</PrimaryButton>
      </View>
    )
  }
  return (
    <View style={styles.state}>
      <Ionicons color={colors.muted} name="pricetags-outline" size={42} />
      <Text style={styles.stateTitle}>{filtered ? '没有匹配的标签' : '服务器中还没有标签'}</Text>
      <Text style={styles.stateMessage}>{filtered ? '调整关键词或类型后再试。' : '下拉即可重新加载。'}</Text>
    </View>
  )
}

function tagErrorMessage(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return '当前账号没有浏览标签的权限。'
    if (error.status === 404) return '服务器不支持标签列表接口。'
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
    gap: 10,
    padding: 12,
    paddingBottom: 28,
  },
  header: {
    gap: 11,
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
  filters: {
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e9edf3',
  },
  filterChipActive: {
    backgroundColor: colors.brand,
  },
  filterText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  typeError: {
    color: colors.danger,
    fontSize: 12,
  },
  count: {
    color: colors.muted,
    fontSize: 13,
  },
  state: {
    minHeight: 330,
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
