import { Image, type ImageProps } from 'expo-image'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

const MIN_SCALE = 1
const DOUBLE_TAP_SCALE = 2
const MAX_SCALE = 4

interface ZoomableReaderImageProps extends Pick<
  ImageProps,
  'cachePolicy' | 'contentFit' | 'onError' | 'onLoad' | 'recyclingKey' | 'source'
> {
  accessibilityLabel: string
  width: number
  height: number
  gesturesEnabled: boolean
  onTap: (x: number) => void
  onZoomChange?: (zoomed: boolean) => void
}

function clamp(value: number, minimum: number, maximum: number) {
  'worklet'
  return Math.min(maximum, Math.max(minimum, value))
}

export function ZoomableReaderImage({
  accessibilityLabel,
  width,
  height,
  gesturesEnabled,
  onTap,
  onZoomChange,
  ...imageProps
}: ZoomableReaderImageProps) {
  const [zoomed, setZoomed] = useState(false)
  const scale = useSharedValue(MIN_SCALE)
  const savedScale = useSharedValue(MIN_SCALE)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedTranslateX = useSharedValue(0)
  const savedTranslateY = useSharedValue(0)
  const reduceMotion = useReducedMotion()

  const notifyZoomChange = useCallback((zoomed: boolean) => {
    setZoomed(zoomed)
    onZoomChange?.(zoomed)
  }, [onZoomChange])

  const reset = useCallback(() => {
    const duration = reduceMotion ? 0 : 180
    scale.value = withTiming(MIN_SCALE, { duration })
    savedScale.value = MIN_SCALE
    translateX.value = withTiming(0, { duration })
    translateY.value = withTiming(0, { duration })
    savedTranslateX.value = 0
    savedTranslateY.value = 0
    notifyZoomChange(false)
  }, [
    notifyZoomChange,
    reduceMotion,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
  ])

  const zoomIn = useCallback(() => {
    const duration = reduceMotion ? 0 : 180
    scale.value = withTiming(DOUBLE_TAP_SCALE, { duration })
    savedScale.value = DOUBLE_TAP_SCALE
    notifyZoomChange(true)
  }, [notifyZoomChange, reduceMotion, savedScale, scale])

  useEffect(() => {
    reset()
    return () => onZoomChange?.(false)
  }, [imageProps.recyclingKey, width, height])

  useAnimatedReaction(
    () => scale.value > MIN_SCALE + 0.01,
    (zoomed, wasZoomed) => {
      if (zoomed !== wasZoomed) runOnJS(notifyZoomChange)(zoomed)
    },
    [notifyZoomChange],
  )

  const pinch = Gesture.Pinch()
    .enabled(gesturesEnabled)
    .onStart(() => {
      savedScale.value = scale.value
    })
    .onUpdate(event => {
      scale.value = clamp(savedScale.value * event.scale, MIN_SCALE, MAX_SCALE)
    })
    .onEnd(() => {
      if (scale.value < MIN_SCALE + 0.05) {
        scale.value = withTiming(MIN_SCALE, { duration: reduceMotion ? 0 : 160 })
        translateX.value = withTiming(0, { duration: reduceMotion ? 0 : 160 })
        translateY.value = withTiming(0, { duration: reduceMotion ? 0 : 160 })
      }
      savedScale.value = scale.value
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })

  const pan = Gesture.Pan()
    .enabled(zoomed && gesturesEnabled)
    .minPointers(1)
    .onStart(() => {
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })
    .onUpdate(event => {
      if (scale.value <= MIN_SCALE + 0.01) return
      const maximumX = width * (scale.value - MIN_SCALE) / 2
      const maximumY = height * (scale.value - MIN_SCALE) / 2
      translateX.value = clamp(savedTranslateX.value + event.translationX, -maximumX, maximumX)
      translateY.value = clamp(savedTranslateY.value + event.translationY, -maximumY, maximumY)
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })

  const doubleTap = Gesture.Tap()
    .enabled(gesturesEnabled)
    .numberOfTaps(2)
    .maxDuration(260)
    .onEnd(() => {
      const nextScale = scale.value > MIN_SCALE + 0.01 ? MIN_SCALE : DOUBLE_TAP_SCALE
      const duration = reduceMotion ? 0 : 180
      scale.value = withTiming(nextScale, { duration })
      savedScale.value = nextScale
      if (nextScale === MIN_SCALE) {
        translateX.value = withTiming(0, { duration })
        translateY.value = withTiming(0, { duration })
        savedTranslateX.value = 0
        savedTranslateY.value = 0
      }
    })

  const singleTap = Gesture.Tap()
    .enabled(gesturesEnabled)
    .numberOfTaps(1)
    .onEnd(event => {
      runOnJS(onTap)(event.x)
    })

  const gesture = Gesture.Race(
    Gesture.Exclusive(doubleTap, singleTap),
    Gesture.Simultaneous(pinch, pan),
  )
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }))

  return (
    <View style={[styles.viewport, { width, height }]}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          accessibilityActions={[
            { name: 'increment', label: '放大图片' },
            { name: 'decrement', label: '重置缩放' },
          ]}
          accessibilityHint="双击可放大或重置，放大后可拖动查看"
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="image"
          onAccessibilityTap={() => onTap(width / 2)}
          onAccessibilityAction={event => {
            if (event.nativeEvent.actionName === 'increment') zoomIn()
            if (event.nativeEvent.actionName === 'decrement') reset()
          }}
          style={[styles.imageWrapper, { width, height }, animatedStyle]}
        >
          <Image {...imageProps} style={{ width, height }} />
        </Animated.View>
      </GestureDetector>
      {zoomed
        ? (
            <View pointerEvents="box-none" style={styles.resetContainer}>
              <Pressable
                accessibilityHint="恢复图片为适合屏幕大小"
                accessibilityLabel="重置缩放"
                accessibilityRole="button"
                onPress={reset}
                style={styles.resetButton}
              >
                <Text style={styles.resetText}>1:1</Text>
              </Pressable>
            </View>
          )
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  viewport: {
    overflow: 'hidden',
  },
  imageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  resetButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  resetText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
})
