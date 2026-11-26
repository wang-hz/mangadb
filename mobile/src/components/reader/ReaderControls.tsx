import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
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
  manga: MangaDetail
  api: ApiClient
  serverUrl: string
  userUuid: string
  localPageUris?: readonly string[]
  mode: ReaderMode
  direction: PagedDirection
  pageIndex: number
  onBack: () => void
  onOpenInfo: () => void
  onOpenSettings: () => void
  onJump: (pageIndex: number) => void
  onInteractionChange: (interacting: boolean) => void
}

export function ReaderControls({
  manga, api, serverUrl, userUuid, localPageUris, mode, direction, pageIndex,
  onBack, onOpenInfo, onOpenSettings, onJump, onInteractionChange,
}: ReaderControlsProps) {
  const insets = useSafeAreaInsets()
  const [progressInteracting, setProgressInteracting] = useState(false)
  const [thumbnailsInteracting, setThumbnailsInteracting] = useState(false)
  const interactionRef = useRef(onInteractionChange)
  interactionRef.current = onInteractionChange
  useEffect(() => {
    interactionRef.current(progressInteracting || thumbnailsInteracting)
  }, [progressInteracting, thumbnailsInteracting])
  useEffect(() => () => interactionRef.current(false), [])
  const rtl = mode === 'paged' && direction === 'rtl'
  const pageCount = manga.pages.length
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={[styles.top, { top: insets.top + 8, left: insets.left + 12, right: insets.right + 12 }]}>
        <ReaderTopBar title={manga.displayTitle} onBack={onBack} onOpenInfo={onOpenInfo} onOpenSettings={onOpenSettings} />
      </View>
      <View style={[styles.bottom, {
        bottom: Math.max(insets.bottom, 8), left: insets.left + 12, right: insets.right + 12,
        top: insets.top + 76,
      }]} pointerEvents="box-none">
        <ScrollView style={styles.panel} contentContainerStyle={styles.content} bounces={false}>
          <ReaderThumbnails
            api={api}
            manga={manga}
            serverUrl={serverUrl}
            userUuid={userUuid}
            localPageUris={localPageUris}
            pageIndex={pageIndex}
            direction={rtl ? 'rtl' : 'ltr'}
            onJump={onJump}
            onInteractionChange={setThumbnailsInteracting}
          />
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
})
