import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Animated, Modal, Text, View } from 'react-native'
import * as Reanimated from 'react-native-reanimated'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ReaderSheet } from './ReaderSheet'

type AnimationResult = { finished: boolean }
type AnimationCallback = (result: AnimationResult) => void
type ControlledAnimation = {
  start: jest.Mock
  stop: jest.Mock
  reset: jest.Mock
  finish: (finished?: boolean) => void
}

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
}

function controlledAnimation(): ControlledAnimation {
  let callback: AnimationCallback | undefined
  return {
    start: jest.fn((next?: AnimationCallback) => { callback = next }),
    stop: jest.fn(() => callback?.({ finished: false })),
    reset: jest.fn(),
    finish: (finished = true) => callback?.({ finished }),
  }
}

function renderSheet(visible = true) {
  const onClose = jest.fn()
  const element = (nextVisible: boolean) => (
    <SafeAreaProvider initialMetrics={metrics}>
      <ReaderSheet title="测试弹层" visible={nextVisible} onClose={onClose}>
        <Text>测试内容</Text>
      </ReaderSheet>
    </SafeAreaProvider>
  )
  const view = render(element(visible))
  const sheet = () => view.UNSAFE_getAllByType(View).find(node => typeof node.props.onLayout === 'function')!
  return {
    ...view,
    onClose,
    sheet,
    setVisible: (nextVisible: boolean) => view.rerender(element(nextVisible)),
    show: () => {
      fireEvent(view.UNSAFE_getByType(Modal), 'show')
      fireEvent(sheet(), 'layout', { nativeEvent: { layout: { height: 320 } } })
    },
  }
}

describe('ReaderSheet', () => {
  let transitions: ControlledAnimation[]

  beforeEach(() => {
    transitions = []
    jest.spyOn(Animated, 'timing').mockImplementation(() => controlledAnimation())
    jest.spyOn(Animated, 'parallel').mockImplementation(() => {
      const animation = controlledAnimation()
      transitions.push(animation)
      return animation
    })
  })

  afterEach(() => jest.restoreAllMocks())

  it('waits for native presentation and layout before animating the fixed backdrop and sheet', () => {
    const view = renderSheet(false)
    expect(view.UNSAFE_queryByType(Modal)).toBeNull()
    view.setVisible(true)
    const modal = view.UNSAFE_getByType(Modal)
    expect(modal.props.animationType).toBe('none')
    expect(modal.props.presentationStyle).toBe('overFullScreen')
    expect(modal.props.statusBarTranslucent).toBe(true)
    expect(modal.props.navigationBarTranslucent).toBe(true)
    expect(Animated.parallel).not.toHaveBeenCalled()

    fireEvent(view.sheet(), 'layout', { nativeEvent: { layout: { height: 320 } } })
    expect(Animated.parallel).not.toHaveBeenCalled()
    fireEvent(modal, 'show')

    expect(Animated.parallel).toHaveBeenCalledTimes(1)
    const [backdrop, sheet] = jest.mocked(Animated.timing).mock.calls
    expect(backdrop?.[0]).not.toBe(sheet?.[0])
    expect(backdrop?.[1]).toMatchObject({ toValue: 0.55, duration: 180, useNativeDriver: true })
    expect(sheet?.[1]).toMatchObject({ toValue: 1, duration: 220, useNativeDriver: true })
  })

  it('keeps the modal mounted through its exit while disabling content interaction and accessibility', () => {
    const view = renderSheet()
    view.show()
    act(() => transitions[0]!.finish())
    view.setVisible(false)

    expect(view.UNSAFE_getByType(Modal).props.visible).toBe(true)
    expect(view.sheet().props.pointerEvents).toBe('none')
    expect(screen.queryByText('测试内容')).toBeNull()
    expect(jest.mocked(Animated.timing).mock.calls.slice(-2).map(call => call[1]))
      .toEqual([
        expect.objectContaining({ toValue: 0, duration: 180 }),
        expect.objectContaining({ toValue: 0, duration: 180 }),
      ])
    const closing = transitions[1]!
    act(() => closing.finish(false))
    expect(view.UNSAFE_getByType(Modal).props.visible).toBe(true)
    act(() => closing.finish())
    expect(view.UNSAFE_queryByType(Modal)).toBeNull()
  })

  it('ignores an old exit completion after a rapid reopen and a new close', () => {
    const view = renderSheet()
    view.show()
    view.setVisible(false)
    const oldExit = transitions[1]!
    view.setVisible(true)
    expect(oldExit.stop).toHaveBeenCalledTimes(1)
    expect(screen.getByText('测试内容')).toBeOnTheScreen()
    view.setVisible(false)
    const currentExit = transitions[3]!

    act(() => oldExit.finish())
    expect(view.UNSAFE_getByType(Modal).props.visible).toBe(true)
    act(() => currentExit.finish())
    expect(view.UNSAFE_queryByType(Modal)).toBeNull()
  })

  it('respects reduced motion and dismisses immediately without waiting for an exit callback', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true)
    const view = renderSheet()
    view.show()
    expect(jest.mocked(Animated.timing).mock.calls.map(call => call[1].duration)).toEqual([0, 0])

    view.setVisible(false)
    expect(view.UNSAFE_queryByType(Modal)).toBeNull()
    expect(Animated.parallel).toHaveBeenCalledTimes(1)
  })

  it('retains close-button and system-back actions and ignores system back during exit', () => {
    const view = renderSheet()
    view.show()
    fireEvent.press(screen.getByLabelText('关闭测试弹层'))
    fireEvent(view.UNSAFE_getByType(Modal), 'requestClose')
    expect(view.onClose).toHaveBeenCalledTimes(2)

    view.setVisible(false)
    fireEvent(view.UNSAFE_getByType(Modal), 'requestClose')
    expect(view.onClose).toHaveBeenCalledTimes(2)
  })

  it('cancels an unfinished transition when unmounted', () => {
    const view = renderSheet()
    view.show()
    const entering = transitions[0]!
    view.unmount()
    expect(entering.stop).toHaveBeenCalledTimes(1)
    act(() => entering.finish())
    expect(view.toJSON()).toBeNull()
  })
})
