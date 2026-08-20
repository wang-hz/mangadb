import { act, renderHook } from '@testing-library/react-native'
import type { ScaledSize } from 'react-native'
import { type StableViewport, useStableViewportValue } from './useStableViewport'

type AnimationFrameCallback = (timestamp: number) => void
type ViewportHookProps = { value: ScaledSize }

describe('useStableViewportValue', () => {
  let nextFrameId = 1
  let frames: Array<{ id: number; callback: AnimationFrameCallback; cancelled: boolean }>

  beforeEach(() => {
    frames = []
    nextFrameId = 1
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((
      callback: AnimationFrameCallback,
    ) => {
      const id = nextFrameId
      nextFrameId += 1
      frames.push({ id, callback, cancelled: false })
      return id
    })
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id: number) => {
      const frame = frames.find(item => item.id === id)
      if (frame) frame.cancelled = true
    })
  })

  afterEach(() => jest.restoreAllMocks())

  it('publishes a changed viewport only after two stable animation frames', () => {
    const portrait = viewport(390, 844)
    const landscape = viewport(844, 390)
    const { result, rerender } = renderHook<StableViewport, ViewportHookProps>(
      ({ value }) => useStableViewportValue(value),
      { initialProps: { value: portrait } },
    )

    expect(result.current).toMatchObject({ width: 390, height: 844, epoch: 0 })
    rerender({ value: landscape })
    expect(result.current).toMatchObject({
      width: 390,
      height: 844,
      epoch: 0,
      isTransitioning: true,
    })

    runNextFrame()
    expect(result.current.isTransitioning).toBe(true)
    runNextFrame()
    expect(result.current).toMatchObject({
      width: 844,
      height: 390,
      epoch: 1,
      isTransitioning: false,
    })
  })

  it('cancels stale frame chains during rapid viewport changes', () => {
    const portrait = viewport(390, 844)
    const landscape = viewport(844, 390)
    const splitView = viewport(620, 390)
    const { result, rerender } = renderHook<StableViewport, ViewportHookProps>(
      ({ value }) => useStableViewportValue(value),
      { initialProps: { value: portrait } },
    )

    rerender({ value: landscape })
    const staleFrame = frames.at(-1)!
    rerender({ value: splitView })
    expect(staleFrame.cancelled).toBe(true)

    act(() => staleFrame.callback(0))
    expect(result.current).toMatchObject({ width: 390, epoch: 0, isTransitioning: true })

    runNextFrame()
    runNextFrame()
    expect(result.current).toMatchObject({
      width: 620,
      height: 390,
      epoch: 1,
      isTransitioning: false,
    })
  })

  it('rounds dimensions before comparison so subpixel jitter cannot advance the epoch', () => {
    const { result, rerender } = renderHook<StableViewport, ViewportHookProps>(
      ({ value }) => useStableViewportValue(value),
      { initialProps: { value: viewport(390.2, 843.8) } },
    )

    expect(result.current).toMatchObject({ width: 390, height: 844, epoch: 0 })
    rerender({ value: viewport(390.4, 844.1) })

    expect(result.current).toMatchObject({
      width: 390,
      height: 844,
      epoch: 0,
      isTransitioning: false,
    })
    expect(frames).toHaveLength(0)
  })

  function runNextFrame() {
    const frame = frames.find(item => !item.cancelled)
    if (!frame) throw new Error('No pending animation frame')
    frame.cancelled = true
    act(() => frame.callback(0))
  }
})

function viewport(width: number, height: number): ScaledSize {
  return { width, height, scale: 3, fontScale: 1 }
}
