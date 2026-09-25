import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ApiClient } from '@/api/client'
import { mangaPageImageSource } from '@/media/images'
import type { RecentReadingEntry } from '@/storage/progress'
import { colors } from '@/theme/colors'

interface RecentReadingSectionProps {
  entries: readonly RecentReadingEntry[]
  api: ApiClient
  serverUrl: string
  userUuid: string
  onContinue: (entry: RecentReadingEntry) => void
}

export function RecentReadingSection({
  entries,
  api,
  serverUrl,
  userUuid,
  onContinue,
}: RecentReadingSectionProps) {
  if (entries.length === 0) return null
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View style={styles.headingTitle}>
          <Ionicons color={colors.brand} name="time-outline" size={20} />
          <Text style={styles.title}>继续阅读</Text>
        </View>
        <Text style={styles.count}>最近 {Math.min(entries.length, 10)} 本</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.items}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {entries.slice(0, 10).map(entry => (
          <RecentReadingCard
            api={api}
            entry={entry}
            key={entry.manga.uuid}
            onPress={onContinue}
            serverUrl={serverUrl}
            userUuid={userUuid}
          />
        ))}
      </ScrollView>
    </View>
  )
}

export function RecentReadingCard({
  entry,
  api,
  serverUrl,
  userUuid,
  onPress,
  fullWidth = false,
}: {
  entry: RecentReadingEntry
  api: ApiClient
  serverUrl: string
  userUuid: string
  onPress: (entry: RecentReadingEntry) => void
  fullWidth?: boolean
}) {
  const coverIndex = validCoverIndex(entry.manga.cover, entry.pageCount)
  const source = mangaPageImageSource(
    api,
    serverUrl,
    userUuid,
    entry.manga.uuid,
    coverIndex,
    entry.manga.updateAt,
    true,
  )
  const completed = entry.state === 'completed'
  const percent = entry.pageCount <= 0
    ? 0
    : Math.min(100, Math.round((entry.pageIndex + 1) / entry.pageCount * 100))
  return (
    <Pressable
      accessibilityHint="直接打开阅读器并恢复本机阅读位置"
      accessibilityLabel={`继续阅读 ${entry.manga.displayTitle || entry.manga.originalTitle}`}
      accessibilityRole="button"
      onPress={() => onPress(entry)}
      style={({ pressed }) => [styles.card, fullWidth ? { width: '100%' } : null, pressed ? styles.cardPressed : null]}
    >
      <Image
        cachePolicy="memory-disk"
        contentFit="cover"
        recyclingKey={`recent:${entry.manga.uuid}:${entry.manga.updateAt}`}
        source={source}
        style={styles.cover}
      />
      <View style={styles.cardBody}>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {entry.manga.displayTitle || entry.manga.originalTitle}
        </Text>
        <Text style={[styles.progressText, completed ? styles.completedText : null]}>
          {completed
            ? '已完成'
            : `第 ${entry.pageIndex + 1} / ${entry.pageCount} 页`}
        </Text>
        <Text style={styles.meta}>
          {entry.mode === 'paged' ? '翻页' : '滚动'} · {displayUpdatedAt(entry.updatedAt)}
        </Text>
        <View
          accessibilityLabel={`阅读进度 ${percent}%`}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          style={styles.progressTrack}
        >
          <View style={[
            styles.progressFill,
            completed ? styles.completedFill : null,
            { width: `${percent}%` },
          ]} />
        </View>
      </View>
    </Pressable>
  )
}

function validCoverIndex(cover: number | null, pageCount: number): number {
  if (pageCount <= 0 || cover === null || !Number.isInteger(cover)) return 0
  return Math.min(pageCount - 1, Math.max(0, cover))
}

function displayUpdatedAt(value: string): string {
  const date = value.match(/^\d{4}-(\d{2})-(\d{2})/)
  return date ? `${date[1]}.${date[2]}` : '最近'
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
    marginBottom: 4,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headingTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  count: {
    color: colors.muted,
    fontSize: 12,
  },
  items: {
    gap: 10,
    paddingRight: 4,
  },
  card: {
    overflow: 'hidden',
    width: 238,
    height: 116,
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  cardPressed: {
    opacity: 0.76,
  },
  cover: {
    width: 76,
    height: '100%',
    backgroundColor: '#e9edf3',
  },
  cardBody: {
    flex: 1,
    gap: 5,
    padding: 10,
  },
  cardTitle: {
    minHeight: 36,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  progressText: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: '700',
  },
  completedText: {
    color: '#15803d',
  },
  meta: {
    color: colors.muted,
    fontSize: 11,
  },
  progressTrack: {
    overflow: 'hidden',
    height: 4,
    marginTop: 'auto',
    borderRadius: 99,
    backgroundColor: '#e5e7eb',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: colors.brand,
  },
  completedFill: {
    backgroundColor: '#16a34a',
  },
})
