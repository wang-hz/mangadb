import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { MangaDetail } from '@/api/types'
import { readerChrome } from './readerChrome'
import { ReaderSheet } from './ReaderSheet'

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
    <ReaderSheet title="漫画信息" visible={visible} onClose={onClose}>
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
          <ReturnAction disabled={pending} label="返回列表" onPress={() => { void runAction(onReturnToList) }} />
        </View>
        {pending ? <Text accessibilityLiveRegion="polite" style={styles.empty}>正在保存阅读状态…</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </ReaderSheet>
  )
}

function ReturnAction({ label, onPress, disabled }: {
  label: string
  onPress: () => void
  disabled: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        disabled && styles.disabledAction,
        pressed && !disabled && styles.pressedAction,
      ]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  )
}

function displayDate(value: string | null): string {
  if (!value) return '未知'
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]?.replace(/-/g, '.') ?? value
}

const styles = StyleSheet.create({
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
  disabledAction: { opacity: 0.55 },
  pressedAction: { opacity: 0.72 },
  actionText: { color: readerChrome.text, fontSize: 15, fontWeight: '700' },
  error: { color: '#fca5a5', fontSize: 13, lineHeight: 19 },
})
