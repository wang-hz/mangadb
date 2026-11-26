import { Ionicons } from '@expo/vector-icons'
import { type PropsWithChildren, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { readerChrome } from './readerChrome'

interface ReaderSheetProps extends PropsWithChildren {
  title: string
  visible: boolean
  onClose: () => void
}

export function ReaderSheet({ title, visible, onClose, children }: ReaderSheetProps) {
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const [presented, setPresented] = useState(visible)
  const [shown, setShown] = useState(false)
  const [sheetHeight, setSheetHeight] = useState(0)
  const backdropOpacity = useRef(new Animated.Value(0)).current
  const sheetProgress = useRef(new Animated.Value(0)).current
  const transition = useRef(0)
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  useEffect(() => {
    if (!presented) {
      if (visible) {
        backdropOpacity.setValue(0)
        sheetProgress.setValue(0)
        setPresented(true)
      }
      return
    }

    if (visible && (!shown || sheetHeight === 0)) return
    if (!visible && (!shown || sheetHeight === 0 || reduceMotion)) {
      backdropOpacity.setValue(0)
      sheetProgress.setValue(0)
      setPresented(false)
      setShown(false)
      return
    }

    const revision = ++transition.current
    const animation = Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: visible ? 0.55 : 0,
        duration: reduceMotion ? 0 : 180,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(sheetProgress, {
        toValue: visible ? 1 : 0,
        duration: reduceMotion ? 0 : visible ? 220 : 180,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ])
    animation.start(({ finished }) => {
      if (finished && revision === transition.current && !visibleRef.current) {
        setPresented(false)
        setShown(false)
      }
    })
    return () => {
      transition.current += 1
      animation.stop()
    }
  }, [visible, presented, shown, sheetHeight, reduceMotion, backdropOpacity, sheetProgress])

  if (!presented) return null

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={() => { if (visibleRef.current) onClose() }}
      onShow={() => { if (visibleRef.current) setShown(true) }}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      supportedOrientations={[
        'portrait',
        'portrait-upside-down',
        'landscape-left',
        'landscape-right',
      ]}
      transparent
      visible={presented}
    >
      <View
        accessibilityElementsHidden={!visible}
        accessibilityViewIsModal={visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        style={styles.root}
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
        />
        <Animated.View
          onLayout={event => setSheetHeight(event.nativeEvent.layout.height)}
          pointerEvents={visible ? 'auto' : 'none'}
          style={[styles.sheet, {
            paddingBottom: Math.max(insets.bottom, 18),
            marginLeft: insets.left + 8,
            marginRight: insets.right + 8,
            marginTop: insets.top + 8,
            opacity: sheetHeight > 0 ? 1 : 0,
            transform: [{ translateY: sheetProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [sheetHeight, 0],
            }) }],
          }]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              accessibilityLabel={`关闭${title}`}
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons color={readerChrome.text} name="close" size={25} />
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: '#000000' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: readerChrome.border,
    backgroundColor: '#1e1e21',
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
  title: { flex: 1, color: readerChrome.text, fontSize: 19, fontWeight: '700' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#292e36' },
})
