import { act, render, renderHook } from '@testing-library/react-native'
import { createElement } from 'react'
import { FlatList, Text, type ViewToken } from 'react-native'
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
      index: 5,
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
      index: 4,
      animated: false,
      viewPosition: 0,
    })
  })

  it('restores item 236 in a real 264-item two-column FlatList without exceeding its 132 rows', () => {
    const items = Array.from({ length: 264 }, (_, index) => ({ uuid: String(index) }))
    let anchor: GridHookResult
    const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex')
    function Grid({ columns }: GridHookProps) {
      anchor = useAdaptiveGridAnchor<GridItem>(columns, items.length)
      return createElement(FlatList<GridItem>, {
        data: items,
        numColumns: columns,
        key: anchor.key,
        ref: anchor.listRef,
        initialNumToRender: 1,
        getItemLayout: (_data, index) => ({ index, length: 100, offset: index * 100 }),
        renderItem: ({ item }) => createElement(Text, null, item.uuid),
        onScrollToIndexFailed: anchor.onScrollToIndexFailed,
      })
    }
    const view = render(createElement(Grid, { columns: 4 }))
    act(() => anchor.onViewableItemsChanged({
      viewableItems: [{ index: 236 } as ViewToken<GridItem>],
    }))
    view.rerender(createElement(Grid, { columns: 2 }))

    expect(() => runNextFrame()).not.toThrow()
    expect(scrollToIndex).toHaveBeenLastCalledWith({
      index: 118, animated: false, viewPosition: 0,
    })
  })

  it('retries a failed row without treating it as an item index', () => {
    const { result, rerender } = renderHook(
      ({ columns }: GridHookProps) => useAdaptiveGridAnchor<GridItem>(columns, 264),
      { initialProps: { columns: 4 } },
    )
    act(() => result.current.onViewableItemsChanged({
      viewableItems: [{ index: 236 } as ViewToken<GridItem>],
    }))
    rerender({ columns: 2 })
    const scrollToIndex = jest.fn()
    result.current.listRef.current = { scrollToIndex } as unknown as FlatList<GridItem>
    runNextFrame()
    act(() => result.current.onScrollToIndexFailed({ index: 118 }))
    runNextFrame()

    expect(scrollToIndex).toHaveBeenLastCalledWith({
      index: 118, animated: false, viewPosition: 0,
    })
  })

  it('clamps a delayed retry against the latest data and skips an empty list', () => {
    const { result, rerender } = renderHook(
      ({ columns, count }: GridHookProps & { count: number }) => useAdaptiveGridAnchor<GridItem>(columns, count),
      { initialProps: { columns: 4, count: 264 } },
    )
    rerender({ columns: 2, count: 264 })
    const staleFailure = result.current.onScrollToIndexFailed
    rerender({ columns: 2, count: 7 })
    const scrollToIndex = jest.fn()
    result.current.listRef.current = { scrollToIndex } as unknown as FlatList<GridItem>
    act(() => staleFailure({ index: 118 }))
    runNextFrame()
    expect(scrollToIndex).toHaveBeenLastCalledWith({
      index: 3, animated: false, viewPosition: 0,
    })

    scrollToIndex.mockClear()
    rerender({ columns: 2, count: 0 })
    act(() => staleFailure({ index: 118 }))
    runNextFrame()
    expect(scrollToIndex).not.toHaveBeenCalled()
  })

  it('bounds retries when the target row has not been measured', () => {
    const { result } = renderHook(() => useAdaptiveGridAnchor<GridItem>(2, 264))
    const scrollToIndex = jest.fn()
    result.current.listRef.current = { scrollToIndex } as unknown as FlatList<GridItem>
    const retry = result.current.onScrollToIndexFailed
    for (let attempt = 0; attempt < 4; attempt += 1) {
      act(() => retry({ index: 118 }))
      runNextFrame()
    }
    expect(scrollToIndex).toHaveBeenCalledTimes(4)
    act(() => retry({ index: 118 }))
    expect(frames.filter(frame => !frame.cancelled)).toHaveLength(0)

  })

  it('cancels pending frames and ignores failure callbacks after unmount', () => {
    const { result, unmount } = renderHook(() => useAdaptiveGridAnchor<GridItem>(2, 264))
    const scrollToIndex = jest.fn()
    result.current.listRef.current = { scrollToIndex } as unknown as FlatList<GridItem>
    const retry = result.current.onScrollToIndexFailed
    act(() => retry({ index: 118 }))
    const pending = frames.at(-1)!
    unmount()
    act(() => pending.callback(0))
    act(() => retry({ index: 118 }))
    expect(scrollToIndex).not.toHaveBeenCalled()
    expect(frames.filter(frame => !frame.cancelled)).toHaveLength(0)
  })

  function runNextFrame() {
    const frame = frames.find(item => !item.cancelled)
    if (!frame) throw new Error('No pending animation frame')
    frame.cancelled = true
    act(() => frame.callback(0))
  }
})
