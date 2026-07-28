import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { MangaSummary } from '@/api/types'
import {
  markMangaCompleted,
  markMangaUnread,
  removeFromRecentReading,
  type ReadingProgress,
} from '@/storage/progress'
import { colors } from '@/theme/colors'

type ProgressAction = 'completed' | 'unread' | 'remove-recent' | null

interface ReadingProgressControlsProps {
  manga: MangaSummary
  pageCount: number
  progress: ReadingProgress | null
  serverUrl: string
  userUuid: string
  onChange: (progress: ReadingProgress | null) => void
}

export function ReadingProgressControls({
  manga,
  pageCount,
  progress,
  serverUrl,
  userUuid,
  onChange,
}: ReadingProgressControlsProps) {
  const [pending, setPending] = useState<ProgressAction>(null)
  const [message, setMessage] = useState<string | null>(null)

  const run = async (
    action: Exclude<ProgressAction, null>,
    operation: () => Promise<void>,
  ) => {
    if (pending) return
    setPending(action)
    setMessage(null)
    try {
      await operation()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法更新阅读状态')
    } finally {
      setPending(null)
    }
  }

  const stateLabel = !progress
    ? '未开始'
    : progress.state === 'completed'
      ? '已完成'
      : `阅读中 · 第 ${progress.pageIndex + 1} / ${pageCount} 页`

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Ionicons
          color={progress?.state === 'completed' ? '#15803d' : colors.brand}
          name={progress?.state === 'completed' ? 'checkmark-circle' : 'book-outline'}
          size={20}
        />
        <Text style={styles.title}>阅读状态</Text>
        <Text style={[
          styles.state,
          progress?.state === 'completed' ? styles.completed : null,
        ]}>
          {stateLabel}
        </Text>
      </View>
      {progress
        ? (
            <View style={styles.actions}>
              {progress.state !== 'completed'
                ? (
                    <ProgressActionButton
                      disabled={pending !== null}
                      label={pending === 'completed' ? '正在更新' : '标记已完成'}
                      onPress={() => {
                        void run('completed', async () => {
                          const entry = await markMangaCompleted(
                            serverUrl,
                            userUuid,
                            manga,
                            pageCount,
                            progress.mode,
                          )
                          onChange(entry)
                          setMessage('已标记为完成')
                        })
                      }}
                    />
                  )
                : null}
              <ProgressActionButton
                disabled={pending !== null}
                label={pending === 'unread' ? '正在重置' : '标记未读'}
                onPress={() => {
                  void run('unread', async () => {
                    await markMangaUnread(serverUrl, userUuid, manga.uuid)
                    onChange(null)
                    setMessage('已重置阅读位置')
                  })
                }}
              />
              <ProgressActionButton
                disabled={pending !== null}
                label={pending === 'remove-recent' ? '正在移除' : '移出最近阅读'}
                onPress={() => {
                  void run('remove-recent', async () => {
                    await removeFromRecentReading(serverUrl, userUuid, manga.uuid)
                    setMessage('已移出最近阅读，阅读位置仍保留')
                  })
                }}
              />
            </View>
          )
        : <Text style={styles.hint}>打开阅读器后会在本机记录进度。</Text>}
      {message
        ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text>
        : null}
    </View>
  )
}

function ProgressActionButton({
  label,
  disabled,
  onPress,
}: {
  label: string
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        pressed ? styles.actionPressed : null,
        disabled ? styles.actionDisabled : null,
      ]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  )
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
  state: {
    marginLeft: 'auto',
    color: colors.brand,
    fontSize: 12,
    fontWeight: '700',
  },
  completed: {
    color: '#15803d',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  action: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.background,
  },
  actionPressed: {
    opacity: 0.7,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
  },
  message: {
    color: colors.muted,
    fontSize: 12,
  },
})
