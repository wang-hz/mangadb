import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useDownloads } from '@/downloads/DownloadContext'
import type { DownloadManifestV1, DownloadState } from '@/downloads/types'
import { colors } from '@/theme/colors'

type DownloadFilter = 'all' | 'active' | 'attention' | 'completed'

const FILTERS: Array<{ value: DownloadFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '进行中' },
  { value: 'attention', label: '待处理' },
  { value: 'completed', label: '已完成' },
]

export default function DownloadsScreen() {
  const downloads = useDownloads()
  const [filter, setFilter] = useState<DownloadFilter>('all')
  const manifests = useMemo(
    () => downloads.snapshot.manifests.filter(manifest => matchesFilter(manifest, filter)),
    [downloads.snapshot.manifests, filter],
  )

  if (downloads.status === 'loading') {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.stateTitle}>正在读取本机下载</Text>
      </View>
    )
  }
  if (downloads.status === 'error') {
    return (
      <View style={styles.state}>
        <Ionicons color={colors.danger} name="alert-circle-outline" size={42} />
        <Text style={styles.stateTitle}>无法读取本机下载</Text>
        <Text style={styles.stateMessage}>{downloads.error || '请重新打开应用后重试。'}</Text>
      </View>
    )
  }

  return (
    <FlatList
      contentContainerStyle={styles.content}
      data={manifests}
      keyExtractor={manifest => manifest.manga.uuid}
      ListEmptyComponent={(
        <View style={styles.state}>
          <Ionicons color={colors.muted} name="cloud-download-outline" size={44} />
          <Text style={styles.stateTitle}>
            {downloads.snapshot.manifests.length === 0 ? '还没有离线漫画' : '当前筛选没有项目'}
          </Text>
          <Text style={styles.stateMessage}>
            {downloads.snapshot.manifests.length === 0
              ? '在漫画详情中选择“下载到本机”。'
              : '切换筛选条件查看其他下载。'}
          </Text>
        </View>
      )}
      ListHeaderComponent={(
        <View style={styles.header}>
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>本机下载</Text>
            <Text style={styles.summaryCount}>{downloads.snapshot.manifests.length} 本</Text>
          </View>
          <View style={styles.filters}>
            {FILTERS.map(item => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: filter === item.value }}
                key={item.value}
                onPress={() => setFilter(item.value)}
                style={[styles.filter, filter === item.value ? styles.filterActive : null]}
              >
                <Text style={filter === item.value ? styles.filterTextActive : styles.filterText}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {!downloads.snapshot.eligible && downloads.snapshot.manifests.some(manifest =>
            manifest.state === 'queued' || manifest.state === 'downloading')
            ? (
                <View style={styles.policyNotice}>
                  <Ionicons color="#b45309" name="wifi-outline" size={17} />
                  <Text style={styles.policyNoticeText}>等待符合下载设置的网络连接</Text>
                </View>
              )
            : null}
        </View>
      )}
      renderItem={({ item }) => <DownloadRow manifest={item} />}
      style={styles.list}
    />
  )
}

function DownloadRow({ manifest }: { manifest: DownloadManifestV1 }) {
  const downloads = useDownloads()
  const completed = manifest.pages.filter(page => page.state === 'completed').length
  const total = manifest.pages.length
  const percent = total === 0 ? 0 : Math.round(completed / total * 100)

  const runDelete = () => {
    Alert.alert(
      '删除本机下载？',
      `将删除“${manifest.manga.displayTitle}”的离线页面。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => { void downloads.deleteDownload(manifest.manga.uuid) },
        },
      ],
    )
  }

  return (
    <Pressable
      accessibilityHint="打开漫画详情"
      accessibilityRole="button"
      onPress={() => router.push({
        pathname: '/(app)/manga/[uuid]',
        params: { uuid: manifest.manga.uuid },
      })}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <View style={styles.rowHeading}>
        <View style={styles.rowText}>
          <Text numberOfLines={2} style={styles.rowTitle}>
            {manifest.manga.displayTitle || manifest.manga.originalTitle}
          </Text>
          <Text style={[
            styles.rowStatus,
            manifest.state === 'failed' ? styles.rowStatusError : null,
          ]}>
            {stateLabel(manifest.state)} · {completed}/{total} 页
          </Text>
        </View>
        <Ionicons color={colors.muted} name="chevron-forward" size={20} />
      </View>
      <View
        accessibilityLabel={`下载进度 ${completed}/${total}`}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: completed }}
        style={styles.progress}
      >
        <View style={[styles.progressFill, { width: `${percent}%` }]} />
      </View>
      {manifest.failure
        ? <Text style={styles.failure} numberOfLines={2}>{manifest.failure.message}</Text>
        : null}
      <View style={styles.actions}>
        {manifest.state === 'queued' || manifest.state === 'downloading'
          ? (
              <RowAction
                label="暂停"
                onPress={() => { void downloads.pause(manifest.manga.uuid) }}
              />
            )
          : manifest.state === 'paused'
            ? (
                <RowAction
                  label="继续"
                  onPress={() => { void downloads.resume(manifest.manga.uuid) }}
                />
              )
            : manifest.state === 'failed'
              ? (
                  <RowAction
                    label="重试"
                    onPress={() => { void downloads.retry(manifest.manga.uuid) }}
                  />
                )
              : null}
        <RowAction danger label="删除" onPress={runDelete} />
      </View>
    </Pressable>
  )
}

function RowAction({
  label,
  danger = false,
  onPress,
}: {
  label: string
  danger?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={event => {
        event.stopPropagation()
        onPress()
      }}
      style={styles.rowAction}
    >
      <Text style={[styles.rowActionText, danger ? styles.rowActionDanger : null]}>{label}</Text>
    </Pressable>
  )
}

function matchesFilter(manifest: DownloadManifestV1, filter: DownloadFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'active') {
    return manifest.state === 'queued' || manifest.state === 'downloading'
  }
  if (filter === 'attention') {
    return manifest.state === 'paused' ||
      manifest.state === 'failed' ||
      manifest.state === 'stale'
  }
  return manifest.state === 'completed'
}

function stateLabel(state: DownloadState): string {
  if (state === 'queued') return '等待下载'
  if (state === 'downloading') return '正在下载'
  if (state === 'paused') return '已暂停'
  if (state === 'failed') return '下载失败'
  if (state === 'stale') return '需要更新'
  return '已完成'
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    flexGrow: 1,
    gap: 10,
    padding: 12,
    paddingBottom: 28,
  },
  header: {
    gap: 12,
    marginBottom: 2,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  summaryCount: {
    color: colors.muted,
    fontSize: 13,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  filter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e9edf3',
  },
  filterActive: {
    backgroundColor: colors.brand,
  },
  filterText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  policyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#fffbeb',
  },
  policyNoticeText: {
    flex: 1,
    color: '#92400e',
    fontSize: 13,
  },
  row: {
    gap: 11,
    padding: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    opacity: 0.78,
  },
  rowHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowText: {
    flex: 1,
    gap: 5,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  rowStatus: {
    color: colors.muted,
    fontSize: 13,
  },
  rowStatusError: {
    color: colors.danger,
  },
  progress: {
    overflow: 'hidden',
    height: 7,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.brand,
  },
  failure: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  rowAction: {
    minWidth: 58,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: '#f3f4f6',
  },
  rowActionText: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: '700',
  },
  rowActionDanger: {
    color: colors.danger,
  },
  state: {
    minHeight: 360,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 28,
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
})
