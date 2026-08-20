import { memo, useEffect, useState } from 'react'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { MangaSummary } from '@/api/types'
import type { ApiClient } from '@/api/client'
import { useDownloadManifest } from '@/downloads/DownloadContext'
import { mangaPageImageSource } from '@/media/images'
import { colors } from '@/theme/colors'
import type { ReadingProgressEntry } from '@/storage/progress'

interface MangaCardProps {
  manga: MangaSummary
  api: ApiClient
  serverUrl: string
  userUuid: string
  width: number
  onPress?: (uuid: string) => void
  progress?: Pick<ReadingProgressEntry, 'pageCount' | 'pageIndex' | 'state'> | null
  favorite?: boolean
}

export const MangaCard = memo(function MangaCard({
  manga,
  api,
  serverUrl,
  userUuid,
  width,
  onPress,
  progress,
  favorite = false,
}: MangaCardProps) {
  const download = useDownloadManifest(manga.uuid)
  const [imageFailed, setImageFailed] = useState(false)
  const coverIndex = manga.cover ?? 0
  const imageSource = mangaPageImageSource(
    api,
    serverUrl,
    userUuid,
    manga.uuid,
    coverIndex,
    manga.updateAt,
    true,
  )
  const downloadBadge = download
    ? download.manga.updateAt !== manga.updateAt || download.state === 'stale'
      ? '需更新'
      : download.state === 'completed'
        ? '已下载'
        : download.state === 'failed'
          ? '下载失败'
          : download.state === 'paused'
            ? '已暂停'
            : `${download.pages.filter(page => page.state === 'completed').length}/${download.pages.length}`
    : null
  const progressPercent = progress && progress.pageCount > 0
    ? Math.min(100, Math.round((progress.pageIndex + 1) / progress.pageCount * 100))
    : 0

  useEffect(() => setImageFailed(false), [imageSource.cacheKey])

  return (
    <Pressable
      accessibilityHint="打开漫画详情"
      accessibilityRole="button"
      disabled={!onPress}
      onPress={() => onPress?.(manga.uuid)}
      style={({ pressed }) => [styles.card, { width }, pressed && onPress ? styles.pressed : null]}
    >
      <View style={styles.coverContainer}>
        {favorite
          ? (
              <View accessibilityLabel="已收藏" style={styles.favoriteBadge}>
                <Ionicons color="#ffffff" name="heart" size={14} />
              </View>
            )
          : null}
        {downloadBadge
          ? (
              <View style={[
                styles.downloadBadge,
                download?.state === 'failed' ? styles.downloadBadgeError : null,
              ]}>
                <Ionicons color="#ffffff" name="download" size={12} />
                <Text style={styles.downloadBadgeText}>{downloadBadge}</Text>
              </View>
            )
          : null}
        {!imageFailed
          ? (
              <Image
                cachePolicy="memory-disk"
                contentFit="cover"
                onError={() => setImageFailed(true)}
                recyclingKey={`${manga.uuid}:${coverIndex}:${manga.updateAt}`}
                source={imageSource}
                style={styles.cover}
                transition={160}
              />
            )
          : (
              <View style={styles.coverFallback}>
                <Ionicons color={colors.muted} name="image-outline" size={34} />
                <Text style={styles.coverFallbackText}>暂无封面</Text>
              </View>
            )}
      </View>
      <View style={styles.details}>
        <Text numberOfLines={2} style={styles.title}>{manga.displayTitle || manga.originalTitle}</Text>
        {manga.originalTitle && manga.originalTitle !== manga.displayTitle
          ? <Text numberOfLines={1} style={styles.originalTitle}>{manga.originalTitle}</Text>
          : null}
        <View style={styles.readingState}>
          <Ionicons
            color={progress?.state === 'completed' ? '#15803d' : colors.muted}
            name={progress?.state === 'completed'
              ? 'checkmark-circle'
              : progress
                ? 'book-outline'
                : 'ellipse-outline'}
            size={14}
          />
          <Text style={[
            styles.readingStateText,
            progress?.state === 'completed' ? styles.readingCompletedText : null,
          ]}>
            {progress?.state === 'completed'
              ? '已完成'
              : progress
                ? `阅读中 · ${progressPercent}%`
                : '未开始'}
          </Text>
        </View>
        <Text style={styles.date}>{displayDate(manga.publishDate)}</Text>
      </View>
    </Pressable>
  )
})

function displayDate(value: string | null): string {
  if (!value) return '出版日期未知'
  const datePart = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  return datePart ? datePart.replace(/-/g, '.') : value
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.76,
  },
  coverContainer: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: '#e9edf3',
  },
  downloadBadge: {
    position: 'absolute',
    zIndex: 1,
    top: 7,
    right: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.76)',
  },
  favoriteBadge: {
    position: 'absolute',
    zIndex: 1,
    top: 7,
    left: 7,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(190,24,93,0.9)',
  },
  downloadBadgeError: {
    backgroundColor: 'rgba(185,28,28,0.9)',
  },
  downloadBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
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
  details: {
    height: 126,
    gap: 5,
    padding: 10,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  originalTitle: {
    color: colors.muted,
    fontSize: 12,
  },
  date: {
    marginTop: 'auto',
    color: colors.muted,
    fontSize: 12,
  },
  readingState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  readingStateText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  readingCompletedText: {
    color: '#15803d',
  },
})
