import { useCallback, useEffect, useMemo, useRef } from 'react'
import { FlatList, type ViewToken } from 'react-native'
import { anchorIndexForColumns } from '@/utils/grid'

export function useAdaptiveGridAnchor<Item>(
  columns: number,
  itemCount: number,
) {
  const listRef = useRef<FlatList<Item>>(null)
  const visibleAnchorRef = useRef(0)
  const layoutRef = useRef({ columns, generation: 0 })
  if (layoutRef.current.columns !== columns) {
    layoutRef.current = {
      columns,
      generation: layoutRef.current.generation + 1,
    }
  }
  const generation = layoutRef.current.generation
  const generationRef = useRef(generation)
  generationRef.current = generation
  const mountedRef = useRef(true)
  const restoreFrameRef = useRef<number | null>(null)
  const restoreAttemptsRef = useRef(0)

  const scrollToAnchor = useCallback((index: number, callbackGeneration: number) => {
    const target = anchorIndexForColumns(index, itemCount, columns)
    if (restoreFrameRef.current !== null) cancelAnimationFrame(restoreFrameRef.current)
    restoreFrameRef.current = requestAnimationFrame(() => {
      restoreFrameRef.current = null
      if (!mountedRef.current || generationRef.current !== callbackGeneration) return
      listRef.current?.scrollToIndex({ index: target, animated: false, viewPosition: 0 })
    })
  }, [columns, itemCount])

  const onViewableItemsChanged = useMemo(
    () => (info: { viewableItems: Array<ViewToken<Item>> }) => {
      if (!mountedRef.current || generationRef.current !== generation) return
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
      generationRef.current !== generation ||
      restoreAttemptsRef.current >= 4
    ) return
    restoreAttemptsRef.current += 1
    scrollToAnchor(index, generation)
  }, [generation, scrollToAnchor])

  return {
    generation,
    key: `adaptive-grid-${columns}-${generation}`,
    listRef,
    onViewableItemsChanged,
    onScrollToIndexFailed,
  }
}
