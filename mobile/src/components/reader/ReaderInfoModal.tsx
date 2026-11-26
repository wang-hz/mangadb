import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { MangaDetail } from '@/api/types'
import { readerChrome } from './readerChrome'

interface ReaderInfoModalProps {
  visible: boolean
  manga: MangaDetail
  onClose: () => void
  onReturnToDetail: () => Promise<void>
  onReturnToList: () => Promise<void>
}

export function ReaderInfoModal({
  visible, manga, onClose, onReturnToDetail, onReturnToList,
}: ReaderInfoModalProps) {
  const insets = useSafeAreaInsets()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const acting = useRef(false)
  const mounted = useRef(true)
  const session = useRef(0)
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    session.current += 1
    if (visible) setError(null)
  }, [visible])

  const runAction = async (action: () => Promise<void>) => {
    if (acting.current || !visibleRef.current) return
    const actionSession = session.current
    acting.current = true
    setPending(true)
    setError(null)
    try {
      await action()
    } catch (cause) {
      if (mounted.current && visibleRef.current && actionSession === session.current) {
        setError(cause instanceof Error ? cause.message : '无法保存阅读状态，请重试。')
      }
    } finally {
      acting.current = false
      if (mounted.current) setPending(false)
    }
  }

  const title = manga.displayTitle || manga.originalTitle || '未命名漫画'
  const tags = [...manga.mangaTags].sort((a, b) =>
    `${a.tag.tagType.name}\u0000${a.tag.name}`.localeCompare(`${b.tag.tagType.name}\u0000${b.tag.name}`, 'zh-CN'),
  )

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={[
        'portrait',
        'portrait-upside-down',
        'landscape-left',
        'landscape-right',
      ]}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, {
          paddingBottom: Math.max(insets.bottom, 18),
          marginLeft: insets.left + 8,
          marginRight: insets.right + 8,
          marginTop: insets.top + 8,
        }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.heading}>漫画信息</Text>
            <Pressable
              accessibilityLabel="关闭漫画信息"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons color={readerChrome.text} name="close" size={25} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <Text selectable style={styles.title}>{title}</Text>
            {manga.originalTitle && manga.originalTitle !== title
              ? <Text selectable style={styles.originalTitle}>{manga.originalTitle}</Text>
              : null}
            <View style={styles.metadata}>
              <View style={styles.metadataRow}>
                <Text style={styles.label}>出版日期</Text>
                <Text selectable style={styles.value}>{displayDate(manga.publishDate)}</Text>
              </View>
              <View style={styles.metadataRow}>
                <Text style={styles.label}>页数</Text>
                <Text style={styles.value}>{manga.pages.length} 页</Text>
              </View>
            </View>
            <View style={styles.tagSection}>
              <Text style={styles.label}>标签</Text>
              {tags.length > 0 ? (
                <View style={styles.tags}>
                  {tags.map(({ tag }) => (
                    <Text key={tag.uuid} selectable style={styles.tag}>
                      {tag.tagType.name} · {tag.name}
                    </Text>
                  ))}
                </View>
              ) : <Text style={styles.empty}>暂无标签</Text>}
            </View>
            <View style={styles.actions}>
              <ReturnAction disabled={pending} label="返回漫画" onPress={() => { void runAction(onReturnToDetail) }} />
              <ReturnAction disabled={pending} label="返回列表" onPress={() => { void runAction(onReturnToList) }} primary />
            </View>
            {pending ? <Text accessibilityLiveRegion="polite" style={styles.empty}>正在保存阅读状态…</Text> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

function ReturnAction({ label, onPress, disabled, primary = false }: {
  label: string
  onPress: () => void
  disabled: boolean
  primary?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        primary && styles.primaryAction,
        disabled && styles.disabledAction,
        pressed && !disabled && styles.pressedAction,
      ]}
    >
      <Text style={[styles.actionText, primary && styles.primaryActionText]}>{label}</Text>
    </Pressable>
  )
}

function displayDate(value: string | null): string {
  if (!value) return '未知'
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]?.replace(/-/g, '.') ?? value
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: readerChrome.border,
    backgroundColor: readerChrome.surface,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#66666d', alignSelf: 'center', marginTop: 9 },
  header: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3b4049',
  },
  heading: { flex: 1, color: readerChrome.text, fontSize: 19, fontWeight: '700' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#292e36' },
  content: { padding: 18, paddingBottom: 28, gap: 14 },
  title: { color: readerChrome.text, fontSize: 21, lineHeight: 29, fontWeight: '700' },
  originalTitle: { color: readerChrome.muted, fontSize: 14, lineHeight: 20 },
  metadata: { gap: 10 },
  metadataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  label: { color: readerChrome.muted, fontSize: 14, fontWeight: '600' },
  value: { color: readerChrome.text, fontSize: 14 },
  tagSection: { gap: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, overflow: 'hidden', backgroundColor: readerChrome.raised, color: readerChrome.text, fontSize: 12 },
  empty: { color: readerChrome.muted, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  action: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: readerChrome.border, borderRadius: 12, paddingHorizontal: 12 },
  primaryAction: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
  disabledAction: { opacity: 0.55 },
  pressedAction: { opacity: 0.72 },
  actionText: { color: readerChrome.text, fontSize: 15, fontWeight: '700' },
  primaryActionText: { color: '#222222' },
  error: { color: '#fca5a5', fontSize: 13, lineHeight: 19 },
})
