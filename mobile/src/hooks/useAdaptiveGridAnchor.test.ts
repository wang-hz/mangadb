import { act, renderHook } from '@testing-library/react-native'
import type { FlatList, ViewToken } from 'react-native'
import { useAdaptiveGridAnchor } from './useAdaptiveGridAnchor'

type AnimationFrameCallback = (timestamp: number) => void
type GridItem = { uuid: string }
type GridHookProps = { columns: number }
type GridHookResult = ReturnType<typeof useAdaptiveGridAnchor<GridItem>>

describe('useAdaptiveGridAnchor', () => {
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

  it('uses a monotonic generation and restores the visible row anchor', () => {
    const { result, rerender } = renderHook<GridHookResult, GridHookProps>(
      ({ columns }) => useAdaptiveGridAnchor<GridItem>(columns, 50),
      { initialProps: { columns: 2 } },
    )
    const scrollToIndex = jest.fn()
    result.current.listRef.current = { scrollToIndex } as unknown as FlatList<GridItem>
    act(() => result.current.onViewableItemsChanged({
      viewableItems: [{ index: 17 } as ViewToken<GridItem>],
    }))

    expect(result.current).toMatchObject({
      generation: 0,
      key: 'adaptive-grid-2-0',
    })
    rerender({ columns: 3 })
    result.current.listRef.current = { scrollToIndex } as unknown as FlatList<GridItem>
    runNextFrame()

    expect(result.current).toMatchObject({
      generation: 1,
      key: 'adaptive-grid-3-1',
    })
    expect(scrollToIndex).toHaveBeenCalledWith({
      index: 15,
      animated: false,
      viewPosition: 0,
    })

    rerender({ columns: 2 })
    expect(result.current.key).toBe('adaptive-grid-2-2')
  })

  it('ignores stale restore frames and viewability callbacks from old generations', () => {
    const { result, rerender } = renderHook<GridHookResult, GridHookProps>(
      ({ columns }) => useAdaptiveGridAnchor<GridItem>(columns, 50),
      { initialProps: { columns: 2 } },
    )
    const scrollToIndex = jest.fn()
    result.current.listRef.current = { scrollToIndex } as unknown as FlatList<GridItem>
    act(() => result.current.onViewableItemsChanged({
      viewableItems: [{ index: 17 } as ViewToken<GridItem>],
    }))

    rerender({ columns: 3 })
    const staleFrame = frames.at(-1)!
    const staleViewabilityCallback = result.current.onViewableItemsChanged
    rerender({ columns: 4 })
    result.current.listRef.current = { scrollToIndex } as unknown as FlatList<GridItem>

    act(() => {
      staleViewabilityCallback({
        viewableItems: [{ index: 1 } as ViewToken<GridItem>],
      })
      staleFrame.callback(0)
    })
    expect(scrollToIndex).not.toHaveBeenCalled()

    runNextFrame()
    expect(scrollToIndex).toHaveBeenCalledWith({
      index: 16,
      animated: false,
      viewPosition: 0,
    })
  })

  function runNextFrame() {
    const frame = frames.find(item => !item.cancelled)
    if (!frame) throw new Error('No pending animation frame')
    frame.cancelled = true
    act(() => frame.callback(0))
  }
})
