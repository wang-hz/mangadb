import { useCallback, useEffect, useMemo, useRef } from 'react'
import { FlatList, type ViewToken } from 'react-native'
import { anchorRowIndexForColumns } from '@/utils/grid'

export function useAdaptiveGridAnchor<Item>(
  columns: number,
  itemCount: number,
) {
  const listRef = useRef<FlatList<Item>>(null)
  const visibleAnchorRef = useRef(0)
  const layoutRef = useRef({ columns, itemCount, generation: 0 })
  layoutRef.current = {
    columns,
    itemCount,
    generation: layoutRef.current.generation + (layoutRef.current.columns !== columns ? 1 : 0),
  }
  const generation = layoutRef.current.generation
  const mountedRef = useRef(true)
  const restoreFrameRef = useRef<number | null>(null)
  const restoreAttemptsRef = useRef(0)

  const scrollToAnchor = useCallback((index: number, callbackGeneration: number) => {
    if (restoreFrameRef.current !== null) cancelAnimationFrame(restoreFrameRef.current)
    const frame = requestAnimationFrame(() => {
      if (restoreFrameRef.current !== frame) return
      restoreFrameRef.current = null
      const current = layoutRef.current
      if (
        !mountedRef.current ||
        current.generation !== callbackGeneration ||
        current.itemCount === 0
      ) return
      const target = anchorRowIndexForColumns(index, current.itemCount, current.columns)
      listRef.current?.scrollToIndex({ index: target, animated: false, viewPosition: 0 })
    })
    restoreFrameRef.current = frame
  }, [])

  const onViewableItemsChanged = useMemo(
    () => (info: { viewableItems: Array<ViewToken<Item>> }) => {
      if (!mountedRef.current || layoutRef.current.generation !== generation) return
      const firstVisible = info.viewableItems
        .map(token => token.index)
        .filter((index): index is number => index !== null)
        .sort((a, b) => a - b)[0]
      if (firstVisible !== undefined) visibleAnchorRef.current = firstVisible
    },
    [generation],
  )

  useEffect(() => {
    if (generation === 0 || itemCount === 0) return
    restoreAttemptsRef.current = 0
    scrollToAnchor(visibleAnchorRef.current, generation)
    return () => {
      if (restoreFrameRef.current !== null) cancelAnimationFrame(restoreFrameRef.current)
      restoreFrameRef.current = null
    }
  }, [generation, itemCount, scrollToAnchor])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (restoreFrameRef.current !== null) cancelAnimationFrame(restoreFrameRef.current)
      restoreFrameRef.current = null
    }
  }, [])

  const onScrollToIndexFailed = useCallback(({ index }: { index: number }) => {
    if (
      !mountedRef.current ||
      layoutRef.current.generation !== generation ||
      restoreAttemptsRef.current >= 4
    ) return
    restoreAttemptsRef.current += 1
    // The failed index is already a row; convert to an item before restoring.
    scrollToAnchor(index * columns, generation)
  }, [columns, generation, scrollToAnchor])

  return {
    generation,
    key: `adaptive-grid-${columns}-${generation}`,
    listRef,
    onViewableItemsChanged,
    onScrollToIndexFailed,
  }
}
