import { useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { PageJumpModal } from '@/components/reader/PageJumpModal'
import { clampPageIndex } from '@/utils/reader'

interface ReaderProgressControlsProps {
  pageIndex: number
  pageCount: number
  onJump: (pageIndex: number) => void
  onInteractionChange: (interacting: boolean) => void
}

export function ReaderProgressControls({
  pageIndex, pageCount, onJump, onInteractionChange,
}: ReaderProgressControlsProps) {
  const [preview, setPreview] = useState<number | null>(null)
  const [jumpVisible, setJumpVisible] = useState(false)
  const width = useRef(0)
  const origin = useRef(0)
  const draft = useRef<number | null>(null)
  const interactionRef = useRef(onInteractionChange)
  interactionRef.current = onInteractionChange
  const disabled = pageCount <= 1
  const shownPage = clampPageIndex(preview ?? pageIndex, pageCount)
  const fraction = pageCount > 1 ? shownPage / (pageCount - 1) : 0

  const cancelDrag = () => {
    draft.current = null
    setPreview(null)
    interactionRef.current(false)
  }

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        cancelDrag()
        setJumpVisible(false)
      }
    })
    return () => {
      subscription.remove()
      draft.current = null
      interactionRef.current(false)
    }
  }, [])

  useEffect(() => { cancelDrag() }, [pageCount])

  const previewAt = (x: number) => {
    if (disabled || width.current <= 20) return
    const ratio = Math.max(0, Math.min(1, (x - 10) / (width.current - 20)))
    draft.current = Math.round(ratio * (pageCount - 1))
    setPreview(draft.current)
  }

  const closeJump = () => {
    setJumpVisible(false)
    interactionRef.current(false)
  }

  return (
    <View style={styles.root}>
      <View
        accessible
        accessibilityLabel="阅读进度"
        accessibilityRole="adjustable"
        accessibilityState={{ disabled }}
        accessibilityValue={{ min: 1, max: Math.max(1, pageCount), now: shownPage + 1, text: `第 ${shownPage + 1} 页，共 ${pageCount} 页` }}
        accessibilityActions={disabled ? [] : [{ name: 'increment', label: '下一页' }, { name: 'decrement', label: '上一页' }]}
        onAccessibilityAction={event => {
          const action = event.nativeEvent.actionName
          if (!disabled && (action === 'increment' || action === 'decrement')) {
            onJump(clampPageIndex(pageIndex + (action === 'increment' ? 1 : -1), pageCount))
          }
        }}
        onLayout={event => { width.current = event.nativeEvent.layout.width }}
        onStartShouldSetResponder={() => !disabled && width.current > 20}
        onResponderGrant={event => {
          origin.current = event.nativeEvent.pageX - event.nativeEvent.locationX
          interactionRef.current(true)
          previewAt(event.nativeEvent.locationX)
        }}
        onResponderMove={event => {
          if (draft.current !== null) previewAt(event.nativeEvent.pageX - origin.current)
        }}
        onResponderRelease={() => {
          const target = draft.current
          cancelDrag()
          if (target !== null) onJump(clampPageIndex(target, pageCount))
        }}
        onResponderTerminate={cancelDrag}
        onResponderTerminationRequest={() => false}
        style={[styles.slider, disabled ? styles.disabled : null]}
      >
        <View pointerEvents="none" style={styles.track}>
          <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
          <View style={[styles.thumb, { left: `${fraction * 100}%` }]} />
        </View>
      </View>
      <Pressable
        accessibilityLabel="跳转页码"
        accessibilityHint="输入要跳转的页码"
        accessibilityRole="button"
        onPress={() => { setJumpVisible(true); interactionRef.current(true) }}
        style={styles.pageButton}
      >
        <Text style={styles.pageText}>{shownPage + 1} / {pageCount}</Text>
      </Pressable>
      <PageJumpModal
        currentPage={pageIndex + 1}
        pageCount={pageCount}
        visible={jumpVisible}
        onClose={closeJump}
        onJump={page => { closeJump(); onJump(page - 1) }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, minWidth: 0 },
  slider: { height: 44, justifyContent: 'center', paddingHorizontal: 10 },
  track: { height: 4, borderRadius: 2, backgroundColor: '#666' },
  fill: { height: 4, borderRadius: 2, backgroundColor: '#ffffff' },
  thumb: { position: 'absolute', top: -8, width: 20, height: 20, marginLeft: -10, borderRadius: 10, backgroundColor: '#ffffff' },
  disabled: { opacity: 0.35 },
  pageButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pageText: { color: '#ffffff', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
})
