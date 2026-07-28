import { adaptiveGridLayout, anchorIndexForColumns } from './grid'

describe('adaptiveGridLayout', () => {
  it.each([
    [320, 2, 142],
    [390, 2, 177],
    [600, 3, 184],
    [768, 4, 177],
    [1024, 6, 160],
  ])('uses responsive columns at %ipx', (width, columns, approximateCardWidth) => {
    const layout = adaptiveGridLayout(width)
    expect(layout.columns).toBe(columns)
    expect(layout.cardWidth).toBeCloseTo(approximateCardWidth, -1)
    expect(layout.cardWidth).toBeLessThanOrEqual(220)
  })

  it('handles invalid and extremely narrow widths without negative card sizes', () => {
    expect(adaptiveGridLayout(Number.NaN)).toEqual({ columns: 2, cardWidth: 0 })
    expect(adaptiveGridLayout(20).cardWidth).toBe(0)
  })

  it('supports custom spacing and card constraints', () => {
    expect(adaptiveGridLayout(900, {
      horizontalPadding: 20,
      gap: 16,
      minimumCardWidth: 180,
      maximumCardWidth: 240,
      minimumColumns: 1,
    })).toMatchObject({ columns: 4, cardWidth: 203 })
  })
})

describe('anchorIndexForColumns', () => {
  it('moves a visible item to the first position of its new row', () => {
    expect(anchorIndexForColumns(17, 50, 4)).toBe(16)
    expect(anchorIndexForColumns(17, 50, 3)).toBe(15)
  })

  it('clamps stale anchors after data changes', () => {
    expect(anchorIndexForColumns(99, 7, 3)).toBe(6)
    expect(anchorIndexForColumns(-4, 7, 3)).toBe(0)
    expect(anchorIndexForColumns(4, 0, 3)).toBe(0)
  })
})
