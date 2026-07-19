import { memo, useEffect, useState } from 'react'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import type { MangaSummary } from '@/api/types'
import type { ApiClient } from '@/api/client'
import { mangaPageImageSource } from '@/media/images'
import { colors } from '@/theme/colors'

interface MangaCardProps {
  manga: MangaSummary
  api: ApiClient
  serverUrl: string
  userUuid: string
  width: number
}

export const MangaCard = memo(function MangaCard({ manga, api, serverUrl, userUuid, width }: MangaCardProps) {
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

  useEffect(() => setImageFailed(false), [imageSource.cacheKey])

  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.coverContainer}>
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
        <Text style={styles.date}>{displayDate(manga.publishDate)}</Text>
      </View>
    </View>
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
  coverContainer: {
    width: '100%',
    aspectRatio: 2 / 3,
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
  details: {
    minHeight: 100,
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
})
