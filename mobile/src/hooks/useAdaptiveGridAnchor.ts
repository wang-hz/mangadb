import { useEffect, useRef } from 'react'
import { FlatList, type ViewToken } from 'react-native'
import { anchorIndexForColumns } from '@/utils/grid'

export function useAdaptiveGridAnchor<Item>(
  columns: number,
  itemCount: number,
) {
  const listRef = useRef<FlatList<Item>>(null)
  const visibleAnchorRef = useRef(0)
  const previousColumnsRef = useRef<number | null>(null)
  const restoreFrameRef = useRef<number | null>(null)
  const restoreAttemptsRef = useRef(0)

  const scrollToAnchor = (index: number) => {
    const target = anchorIndexForColumns(index, itemCount, columns)
    restoreFrameRef.current = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: target, animated: false, viewPosition: 0 })
    })
  }

  const onViewableItemsChanged = useRef((info: {
    viewableItems: Array<ViewToken<Item>>
  }) => {
    const firstVisible = info.viewableItems
      .map(token => token.index)
      .filter((index): index is number => index !== null)
      .sort((a, b) => a - b)[0]
    if (firstVisible !== undefined) visibleAnchorRef.current = firstVisible
  }).current

  useEffect(() => {
    const previousColumns = previousColumnsRef.current
    previousColumnsRef.current = columns
    if (previousColumns === null || previousColumns === columns || itemCount === 0) return
    restoreAttemptsRef.current = 0
    scrollToAnchor(visibleAnchorRef.current)
    return () => {
      if (restoreFrameRef.current !== null) cancelAnimationFrame(restoreFrameRef.current)
      restoreFrameRef.current = null
    }
  }, [columns, itemCount])

  return {
    key: `adaptive-grid-${columns}`,
    listRef,
    onViewableItemsChanged,
    onScrollToIndexFailed: ({ index }: { index: number }) => {
      if (restoreAttemptsRef.current >= 4) return
      restoreAttemptsRef.current += 1
      scrollToAnchor(index)
    },
  }
}
