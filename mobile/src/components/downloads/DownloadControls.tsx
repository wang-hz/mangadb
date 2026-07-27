import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import type { MangaDetail } from '@/api/types'
import { PrimaryButton } from '@/components/PrimaryButton'
import { useDownloads } from '@/downloads/DownloadContext'
import type { DownloadManifestV1 } from '@/downloads/types'
import { colors } from '@/theme/colors'

type PendingAction = 'enqueue' | 'pause' | 'resume' | 'retry' | 'delete' | null

export function DownloadControls({ manga }: { manga: MangaDetail }) {
  const downloads = useDownloads()
  const manifest = downloads.manifestFor(manga.uuid)
  const [pending, setPending] = useState<PendingAction>(null)
  const [error, setError] = useState<string | null>(null)
  const stale = Boolean(manifest && manifest.manga.updateAt !== manga.updateAt)

  const run = async (
    action: Exclude<PendingAction, null>,
    operation: () => Promise<unknown>,
  ) => {
    if (pending) return
    setPending(action)
    setError(null)
    try {
      await operation()
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : '下载操作失败')
    } finally {
      setPending(null)
    }
  }

  const remove = async () => {
    if (!await confirmDelete(manga.displayTitle || manga.originalTitle)) return
    await run('delete', () => downloads.deleteDownload(manga.uuid))
  }

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Ionicons color={colors.brand} name="download-outline" size={21} />
        <Text style={styles.title}>离线下载</Text>
      </View>
      <Text style={styles.status}>{downloadStatus(manifest, downloads.status, stale)}</Text>
      {manifest ? <DownloadProgress manifest={manifest} /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {stale
        ? (
            <>
              <Text style={styles.warning}>
                服务器内容已有更新。旧版本会继续保留，安全更新功能完成前请先删除再重新下载。
              </Text>
              <PrimaryButton
                loading={pending === 'delete'}
                onPress={() => { void remove() }}
                variant="secondary"
              >
                删除旧版本
              </PrimaryButton>
            </>
          )
        : !manifest
          ? (
              <PrimaryButton
                disabled={downloads.status !== 'ready' || manga.pages.length === 0}
                loading={pending === 'enqueue'}
                onPress={() => { void run('enqueue', () => downloads.enqueue(manga)) }}
                variant="secondary"
              >
                {manga.pages.length === 0 ? '无页面可下载' : '下载到本机'}
              </PrimaryButton>
            )
          : manifest.state === 'queued' || manifest.state === 'downloading'
            ? (
                <PrimaryButton
                  loading={pending === 'pause'}
                  onPress={() => { void run('pause', () => downloads.pause(manga.uuid)) }}
                  variant="secondary"
                >
                  暂停下载
                </PrimaryButton>
              )
            : manifest.state === 'paused'
              ? (
                  <View style={styles.actions}>
                    <View style={styles.action}>
                      <PrimaryButton
                        loading={pending === 'resume'}
                        onPress={() => { void run('resume', () => downloads.resume(manga.uuid)) }}
                        variant="secondary"
                      >
                        继续下载
                      </PrimaryButton>
                    </View>
                    <View style={styles.action}>
                      <PrimaryButton
                        loading={pending === 'delete'}
                        onPress={() => { void remove() }}
                        variant="secondary"
                      >
                        删除
                      </PrimaryButton>
                    </View>
                  </View>
                )
              : manifest.state === 'failed'
                ? (
                    <View style={styles.actions}>
                      <View style={styles.action}>
                        <PrimaryButton
                          loading={pending === 'retry'}
                          onPress={() => { void run('retry', () => downloads.retry(manga.uuid)) }}
                          variant="secondary"
                        >
                          重试
                        </PrimaryButton>
                      </View>
                      <View style={styles.action}>
                        <PrimaryButton
                          loading={pending === 'delete'}
                          onPress={() => { void remove() }}
                          variant="secondary"
                        >
                          删除
                        </PrimaryButton>
                      </View>
                    </View>
                  )
                : (
                    <PrimaryButton
                      loading={pending === 'delete'}
                      onPress={() => { void remove() }}
                      variant="secondary"
                    >
                      删除本机下载
                    </PrimaryButton>
                  )}
    </View>
  )
}

function DownloadProgress({ manifest }: { manifest: DownloadManifestV1 }) {
  const completed = manifest.pages.filter(page => page.state === 'completed').length
  const total = manifest.pages.length
  const percent = total === 0 ? 0 : Math.round(completed / total * 100)
  return (
    <View
      accessibilityLabel={`下载进度 ${completed}/${total}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: completed }}
      style={styles.progressTrack}
    >
      <View style={[styles.progressFill, { width: `${percent}%` }]} />
    </View>
  )
}

function downloadStatus(
  manifest: DownloadManifestV1 | null,
  status: string,
  stale: boolean,
): string {
  if (status === 'loading') return '正在读取本机下载'
  if (status === 'error') return '无法读取本机下载'
  if (!manifest) return '保存整本漫画，断网后仍可阅读。'
  if (stale || manifest.state === 'stale') return '已下载版本需要更新'
  const completed = manifest.pages.filter(page => page.state === 'completed').length
  if (manifest.state === 'queued') return `等待下载 · ${completed}/${manifest.pages.length} 页`
  if (manifest.state === 'downloading') return `正在下载 · ${completed}/${manifest.pages.length} 页`
  if (manifest.state === 'paused') return `已暂停 · ${completed}/${manifest.pages.length} 页`
  if (manifest.state === 'failed') return manifest.failure?.message || '下载失败'
  return `已下载 · ${manifest.pages.length} 页`
}

function confirmDelete(title: string): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      '删除本机下载？',
      `“${title}”的离线页面将被删除，阅读进度仍会保留。`,
      [
        { text: '取消', style: 'cancel', onPress: () => resolve(false) },
        { text: '删除', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  status: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  warning: {
    color: '#b45309',
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  progressTrack: {
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
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  action: {
    flex: 1,
  },
})
