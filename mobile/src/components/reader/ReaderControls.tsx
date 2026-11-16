import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import type { PagedDirection } from '@/storage/readerPreferences'
import type { ReaderMode } from '@/utils/reader'
import { ReaderProgressControls } from './ReaderProgressControls'
import { ReaderThumbnails } from './ReaderThumbnails'
import { ReaderTopBar } from './ReaderTopBar'
import { readerChrome } from './readerChrome'

interface ReaderControlsProps {
  api: ApiClient
  manga: MangaDetail
  serverUrl: string
  userUuid: string
  localPageUris?: readonly string[]
  settingsVisible: boolean
  title: string
  mode: ReaderMode
  direction: PagedDirection
  pageIndex: number
  pageCount: number
  onBack: () => void
  onOpenSettings: () => void
  onModeChange: (mode: ReaderMode) => void
  onJump: (pageIndex: number) => void
  onInteractionChange: (interacting: boolean) => void
  completion?: ReactNode
}

export function ReaderControls({
  api, manga, serverUrl, userUuid, localPageUris, settingsVisible,
  title, mode, direction, pageIndex, pageCount, onBack, onOpenSettings,
  onModeChange, onJump, onInteractionChange, completion,
}: ReaderControlsProps) {
  const insets = useSafeAreaInsets()
  const [thumbnailsVisible, setThumbnailsVisible] = useState(false)
  const [progressInteracting, setProgressInteracting] = useState(false)
  const interactionRef = useRef(onInteractionChange)
  interactionRef.current = onInteractionChange
  const interacting = thumbnailsVisible || progressInteracting
  useEffect(() => {
    interactionRef.current(interacting)
    return () => interactionRef.current(false)
  }, [interacting])
  useEffect(() => {
    if (settingsVisible) setThumbnailsVisible(false)
  }, [settingsVisible])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') setThumbnailsVisible(false)
    })
    return () => subscription.remove()
  }, [])
  const rtl = mode === 'paged' && direction === 'rtl'
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={[styles.top, { top: insets.top + 8, left: insets.left + 12, right: insets.right + 12 }]}>
        <ReaderTopBar title={title} onBack={onBack} onOpenSettings={onOpenSettings} />
      </View>
      <View style={[styles.bottom, {
        bottom: Math.max(insets.bottom, 8), left: insets.left + 12, right: insets.right + 12,
        top: insets.top + 76,
      }]} pointerEvents="box-none">
        <ScrollView style={styles.panel} contentContainerStyle={styles.content} bounces={false}>
          {completion}
          {thumbnailsVisible ? (
            <ReaderThumbnails
              api={api}
              manga={manga}
              serverUrl={serverUrl}
              userUuid={userUuid}
              localPageUris={localPageUris}
              pageIndex={pageIndex}
              direction={rtl ? 'rtl' : 'ltr'}
              onJump={onJump}
            />
          ) : null}
          <View style={styles.progress}>
            {mode === 'paged' ? <PageButton delta={rtl ? 1 : -1} index={pageIndex} count={pageCount} onJump={onJump} icon="chevron-back" /> : null}
            <ReaderProgressControls
              pageIndex={pageIndex}
              pageCount={pageCount}
              onJump={onJump}
              onInteractionChange={setProgressInteracting}
              direction={rtl ? 'rtl' : 'ltr'}
            />
            {mode === 'paged' ? <PageButton delta={rtl ? -1 : 1} index={pageIndex} count={pageCount} onJump={onJump} icon="chevron-forward" /> : null}
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityLabel={thumbnailsVisible ? '收起页面缩略图' : '展开页面缩略图'}
              accessibilityRole="button"
              accessibilityState={{ expanded: thumbnailsVisible }}
              onPress={() => setThumbnailsVisible(value => !value)}
              style={styles.thumbnailButton}
            >
              <Ionicons color="#ffffff" name="grid-outline" size={20} />
              <Text style={styles.thumbnailText}>页面</Text>
            </Pressable>
            <View accessibilityRole="tablist" style={styles.modes}>
              {(['paged', 'scroll'] as const).map(value => (
                <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value }} onPress={() => onModeChange(value)} style={[styles.mode, mode === value && styles.selected]}>
                  <Ionicons color={mode === value ? '#222222' : readerChrome.muted} name={value === 'paged' ? 'book-outline' : 'swap-vertical-outline'} size={18} />
                  <Text style={[styles.modeText, mode === value && styles.selectedText]}>{value === 'paged' ? '翻页' : '滚动'}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  )
}

function PageButton({ delta, index, count, onJump, icon }: {
  delta: number
  index: number
  count: number
  onJump: (index: number) => void
  icon: 'chevron-back' | 'chevron-forward'
}) {
  const disabled = index + delta < 0 || index + delta >= count
  return (
    <Pressable accessibilityLabel={delta < 0 ? '上一页' : '下一页'} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => onJump(index + delta)} style={[styles.button, disabled && styles.disabled]}>
      <Ionicons color="#ffffff" name={icon} size={23} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  top: { position: 'absolute' },
  bottom: { position: 'absolute', justifyContent: 'flex-end' },
  panel: { flexGrow: 0, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: readerChrome.border, backgroundColor: readerChrome.surface },
  content: { padding: 10, gap: 6 },
  progress: { flexDirection: 'row', alignItems: 'center' },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  thumbnailButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: readerChrome.raised },
  thumbnailText: { color: readerChrome.text, fontSize: 13, fontWeight: '600' },
  modes: { flex: 1, minWidth: 150, flexDirection: 'row', padding: 3, borderRadius: 16, backgroundColor: readerChrome.raised },
  mode: { flex: 1, minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 13, padding: 6 },
  selected: { backgroundColor: '#ffffff' },
  modeText: { color: readerChrome.muted, fontSize: 13, fontWeight: '600' },
  selectedText: { color: '#222222' },
})
