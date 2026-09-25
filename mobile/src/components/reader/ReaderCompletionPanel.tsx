import { Ionicons } from '@expo/vector-icons'
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

interface ReaderCompletionPanelProps {
  completed: boolean
  pending: boolean
  error: string | null
  onMarkCompleted: () => Promise<void>
  onReread: () => Promise<void>
  onReturnToDetail: () => void
  onReturnToList: () => void
}

export function ReaderCompletionPanel({
  completed,
  pending,
  error,
  onMarkCompleted,
  onReread,
  onReturnToDetail,
  onReturnToList,
}: ReaderCompletionPanelProps) {
  const [actionPending, setActionPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const acting = useRef(false)
  const runAction = async (action: 'reread' | 'detail' | 'list') => {
    if (pending || acting.current) return
    acting.current = true
    setActionPending(true)
    setActionError(null)
    try {
      if (action === 'reread') await onReread()
      else {
        await onMarkCompleted()
        if (action === 'detail') onReturnToDetail()
        else onReturnToList()
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '无法保存阅读状态，请重试。')
    } finally {
      acting.current = false
      setActionPending(false)
    }
  }

  return (
    <View accessibilityLabel="已到达漫画末页" style={styles.panel}>
      <View style={styles.heading}>
        <Ionicons color="#86efac" name="checkmark-circle-outline" size={25} />
        <View style={styles.headingText}>
          <Text style={styles.title}>已读到最后一页</Text>
          <Text style={styles.subtitle}>
            {pending ? '正在保存阅读状态…' : completed ? '这本漫画已标记完成。' : '可以从头重读，或返回继续浏览。'}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <CompletionAction
          disabled={pending || actionPending}
          label="从头重读"
          onPress={() => { void runAction('reread') }}
        />
        <CompletionAction
          disabled={pending || actionPending}
          label="返回漫画"
          onPress={() => { void runAction('detail') }}
        />
        <CompletionAction
          disabled={pending || actionPending}
          label="返回列表"
          onPress={() => { void runAction('list') }}
          primary
        />
      </View>
      {actionError || error
        ? <Text accessibilityRole="alert" style={styles.error}>{actionError || error}</Text>
        : null}
    </View>
  )
}

function CompletionAction({
  label,
  onPress,
  disabled = false,
  primary = false,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        primary ? styles.actionPrimary : null,
        pressed && !disabled ? styles.actionPressed : null,
        disabled ? styles.actionDisabled : null,
      ]}
    >
      <Text style={[styles.actionText, primary ? styles.actionTextPrimary : null]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  panel: {
    gap: 12,
    padding: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    backgroundColor: 'rgba(17,24,39,0.94)',
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headingText: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  action: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 999,
  },
  actionPrimary: {
    borderColor: '#3b82f6',
    backgroundColor: '#2563eb',
  },
  actionPressed: {
    opacity: 0.72,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  actionTextPrimary: {
    color: '#ffffff',
  },
  error: {
    color: '#fca5a5',
    fontSize: 12,
  },
})
