import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

interface ReaderCompletionPanelProps {
  completed: boolean
  onMarkCompleted: () => Promise<void>
  onReread: () => void
  onReturnToDetail: () => void
}

export function ReaderCompletionPanel({
  completed,
  onMarkCompleted,
  onReread,
  onReturnToDetail,
}: ReaderCompletionPanelProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const complete = async () => {
    if (pending || completed) return
    setPending(true)
    setError(null)
    try {
      await onMarkCompleted()
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : '无法保存完成状态')
    } finally {
      setPending(false)
    }
  }

  return (
    <View accessibilityLabel="已到达漫画末页" style={styles.panel}>
      <View style={styles.heading}>
        <Ionicons color="#86efac" name="checkmark-circle-outline" size={25} />
        <View style={styles.headingText}>
          <Text style={styles.title}>已读到最后一页</Text>
          <Text style={styles.subtitle}>
            {completed ? '这本漫画已标记完成。' : '保存完成状态，或从头再读一遍。'}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <CompletionAction
          disabled={pending || completed}
          label={completed ? '已完成' : pending ? '正在保存' : '标记已完成'}
          onPress={() => { void complete() }}
          primary
        />
        <CompletionAction label="从头重读" onPress={onReread} />
        <CompletionAction label="返回详情" onPress={onReturnToDetail} />
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
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
