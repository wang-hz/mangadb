import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useQuery } from '@tanstack/react-query'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { ApiError } from '@/api/client'
import { getManga } from '@/api/mangas'
import type { MangaDetail, MangaTagItem } from '@/api/types'
import { DownloadControls } from '@/components/downloads/DownloadControls'
import { PrimaryButton } from '@/components/PrimaryButton'
import { ScreenHeader } from '@/components/ScreenHeader'
import { mangaPageImageSource } from '@/media/images'
import { useSession } from '@/session/SessionContext'
import { loadReadingProgress, type ReadingProgress } from '@/storage/progress'
import { colors } from '@/theme/colors'
import { validCoverIndex } from '@/utils/manga'

export default function MangaDetailScreen() {
  const params = useLocalSearchParams<{ uuid?: string | string[] }>()
  const mangaUuid = firstParam(params.uuid)
  const insets = useSafeAreaInsets()
  const { api, auth, serverUrl } = useSession()
  const query = useQuery({
    queryKey: ['manga', serverUrl, auth?.user.uuid, mangaUuid],
    queryFn: ({ signal }) => getManga(api!, mangaUuid!, signal),
    enabled: Boolean(api && auth && serverUrl && mangaUuid),
  })

  const manga = query.data
  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <ScreenHeader
          onBack={goBackOrLibrary}
          subtitle={manga ? `${manga.pages.length} 页` : undefined}
          title={manga?.displayTitle || '漫画详情'}
        />
      </SafeAreaView>
      {!mangaUuid
        ? <DetailState message="漫画地址无效。" title="无法打开漫画" />
        : query.isPending
          ? <DetailState loading message="正在读取漫画信息" title="加载中" />
          : query.isError
            ? (
                <DetailState
                  action={query.error instanceof ApiError && query.error.status === 404
                    ? () => router.replace('/(app)/(tabs)/mangas')
                    : () => { void query.refetch() }}
                  actionLabel={query.error instanceof ApiError && query.error.status === 404
                    ? '返回漫画库'
                    : '重试'}
                  message={detailErrorMessage(query.error)}
                  title="漫画加载失败"
                />
              )
            : manga
              ? (
                  <ScrollView
                    contentContainerStyle={[
                      styles.content,
                      { paddingBottom: Math.max(28, insets.bottom + 16) },
                    ]}
                    refreshControl={(
                      <RefreshControl
                        colors={[colors.brand]}
                        onRefresh={() => { void query.refetch() }}
                        refreshing={query.isRefetching}
                        tintColor={colors.brand}
                      />
                    )}
                  >
                    <MangaMetadata manga={manga} />
                  </ScrollView>
                )
              : null}
    </View>
  )
}

function MangaMetadata({ manga }: { manga: MangaDetail }) {
  const { api, auth, serverUrl } = useSession()
  const [coverFailed, setCoverFailed] = useState(false)
  const progressIdentity = [serverUrl, auth?.user.uuid, manga.uuid, manga.pages.length].join(':')
  const [loadedProgress, setLoadedProgress] = useState<{
    identity: string
    value: ReadingProgress | null
  } | null>(null)
  const progress = loadedProgress?.identity === progressIdentity ? loadedProgress.value : null
  const coverIndex = validCoverIndex(manga.cover, manga.pages.length)
  const coverSource = manga.pages.length > 0
    ? mangaPageImageSource(
        api!,
        serverUrl!,
        auth!.user.uuid,
        manga.uuid,
        coverIndex,
        manga.updateAt,
        true,
      )
    : null

  useEffect(() => setCoverFailed(false), [coverSource?.cacheKey])

  useFocusEffect(useCallback(() => {
    let active = true
    loadReadingProgress(serverUrl!, auth!.user.uuid, manga.uuid, manga.pages.length)
      .then(value => {
        if (active) setLoadedProgress({ identity: progressIdentity, value })
      })
      .catch(() => {
        if (active) setLoadedProgress({ identity: progressIdentity, value: null })
      })
    return () => { active = false }
  }, [serverUrl, auth?.user.uuid, manga.uuid, manga.pages.length, progressIdentity]))

  const openReader = () => {
    router.push({
      pathname: '/(app)/reader/[uuid]',
      params: { uuid: manga.uuid, title: manga.displayTitle },
    })
  }

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.coverFrame}>
          {coverSource && !coverFailed
            ? (
                <Image
                  cachePolicy="memory-disk"
                  contentFit="cover"
                  onError={() => setCoverFailed(true)}
                  recyclingKey={`${manga.uuid}:${coverIndex}:${manga.updateAt}`}
                  source={coverSource}
                  style={styles.cover}
                  transition={180}
                />
              )
            : (
                <View style={styles.coverFallback}>
                  <Ionicons color={colors.muted} name="image-outline" size={44} />
                  <Text style={styles.coverFallbackText}>封面不可用</Text>
                </View>
              )}
        </View>
        <View style={styles.heroText}>
          <Text selectable style={styles.title}>{manga.displayTitle || manga.originalTitle}</Text>
          {manga.originalTitle && manga.originalTitle !== manga.displayTitle
            ? <Text selectable style={styles.originalTitle}>{manga.originalTitle}</Text>
            : null}
          <MetadataLine icon="calendar-outline" label="出版日期" value={displayDate(manga.publishDate)} />
          <MetadataLine icon="documents-outline" label="页数" value={`${manga.pages.length} 页`} />
          <MetadataLine icon="refresh-outline" label="更新" value={displayDate(manga.updateAt)} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>标签</Text>
        {manga.mangaTags.length > 0
          ? (
              <View style={styles.tags}>
                {[...manga.mangaTags]
                  .sort((a, b) => `${a.tag.tagType.name}\u0000${a.tag.name}`
                    .localeCompare(`${b.tag.tagType.name}\u0000${b.tag.name}`, 'zh-CN'))
                  .map(item => <MangaTag key={item.tag.uuid} item={item} />)}
              </View>
            )
          : <Text style={styles.emptyText}>暂无标签</Text>}
      </View>

      <View style={styles.readSection}>
        <PrimaryButton disabled={manga.pages.length === 0} onPress={openReader}>
          {manga.pages.length === 0
            ? '暂无可阅读页面'
            : progress
              ? `继续阅读 · 第 ${progress.pageIndex + 1} 页`
              : '开始阅读'}
        </PrimaryButton>
        {manga.pages.length > 0
          ? (
              <Text style={styles.readHint}>
                {progress
                  ? `上次使用${progress.mode === 'paged' ? '翻页' : '滚动'}模式，本机独立保存。`
                  : '阅读位置只保存在本机。'}
              </Text>
            )
          : <Text style={styles.readHint}>请联系管理员为此漫画添加页面。</Text>}
      </View>

      <DownloadControls manga={manga} />
    </>
  )
}

function MangaTag({ item }: { item: MangaTagItem }) {
  const { tag } = item
  return (
    <Pressable
      accessibilityHint="打开此标签下的漫画"
      accessibilityRole="button"
      onPress={() => router.push({
        pathname: '/(app)/tag/[uuid]',
        params: { uuid: tag.uuid, name: tag.name },
      })}
      style={({ pressed }) => [styles.tag, pressed ? styles.tagPressed : null]}
    >
      <Text style={styles.tagType}>{tag.tagType.name}</Text>
      <Text style={styles.tagName}>{tag.name}</Text>
    </Pressable>
  )
}

function MetadataLine({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.metadataLine}>
      <Ionicons color={colors.muted} name={icon} size={15} />
      <Text style={styles.metadataLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metadataValue}>{value}</Text>
    </View>
  )
}

function DetailState({
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
  return (
    <View style={styles.state}>
      {loading ? <ActivityIndicator color={colors.brand} size="large" /> : null}
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {action && actionLabel ? <PrimaryButton onPress={action}>{actionLabel}</PrimaryButton> : null}
    </View>
  )
}

function displayDate(value: string | null): string {
  if (!value) return '未知'
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]?.replace(/-/g, '.') ?? value
}

function detailErrorMessage(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return '该漫画不存在或已被删除。'
    if (error.status === 403) return '当前账号没有浏览权限。'
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
    backgroundColor: colors.background,
  },
  headerSafeArea: {
    backgroundColor: colors.header,
  },
  content: {
    gap: 18,
    padding: 16,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  coverFrame: {
    width: 132,
    aspectRatio: 2 / 3,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#e9edf3',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  coverFallbackText: {
    color: colors.muted,
    fontSize: 12,
  },
  heroText: {
    flex: 1,
    gap: 8,
    paddingTop: 2,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  originalTitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  metadataLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metadataLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  metadataValue: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
  },
  section: {
    gap: 10,
    padding: 15,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#b7d7ff',
    borderRadius: 999,
  },
  tagPressed: {
    opacity: 0.65,
  },
  tagType: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: colors.brand,
  },
  tagName: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    color: colors.brand,
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: '#e8f2ff',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
  },
  readSection: {
    gap: 9,
  },
  readHint: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 28,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateMessage: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
})
