export interface AdaptiveGridLayout {
  columns: number
  cardWidth: number
}

export interface AdaptiveGridOptions {
  horizontalPadding?: number
  gap?: number
  minimumCardWidth?: number
  maximumCardWidth?: number
  minimumColumns?: number
}

export function adaptiveGridLayout(
  viewportWidth: number,
  options: AdaptiveGridOptions = {},
): AdaptiveGridLayout {
  const horizontalPadding = positive(options.horizontalPadding, 12)
  const gap = positive(options.gap, 12)
  const minimumCardWidth = positive(options.minimumCardWidth, 148)
  const maximumCardWidth = Math.max(
    minimumCardWidth,
    positive(options.maximumCardWidth, 220),
  )
  const minimumColumns = Math.max(1, Math.trunc(positive(options.minimumColumns, 2)))
  const availableWidth = Math.max(0, finite(viewportWidth) - horizontalPadding * 2)
  let columns = Math.max(
    minimumColumns,
    Math.floor((availableWidth + gap) / (minimumCardWidth + gap)),
  )
  let cardWidth = widthForColumns(availableWidth, columns, gap)
  while (cardWidth > maximumCardWidth) {
    columns += 1
    cardWidth = widthForColumns(availableWidth, columns, gap)
  }
  return {
    columns,
    cardWidth: Math.max(0, cardWidth),
  }
}

export function anchorIndexForColumns(
  visibleIndex: number,
  itemCount: number,
  columns: number,
): number {
  if (itemCount <= 0) return 0
  const safeColumns = Math.max(1, Math.trunc(columns))
  const clampedIndex = Math.min(
    itemCount - 1,
    Math.max(0, Math.trunc(finite(visibleIndex))),
  )
  return Math.floor(clampedIndex / safeColumns) * safeColumns
}

function widthForColumns(
  availableWidth: number,
  columns: number,
  gap: number,
): number {
  return (availableWidth - gap * Math.max(0, columns - 1)) / columns
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}
