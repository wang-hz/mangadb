import {
  buildScrollingPageLayouts,
  clampPageIndex,
  displayIndexForPage,
  pageIndexesForDirection,
  pageDeltaForTap,
  pageIndexAtViewportCenter,
  parsePageIndexParam,
  parseReaderMode,
  resolveInitialReaderMode,
} from './reader'

describe('reader helpers', () => {
  it('clamps page indices after the page count changes', () => {
    expect(clampPageIndex(-2, 8)).toBe(0)
    expect(clampPageIndex(99, 8)).toBe(7)
    expect(clampPageIndex(3.8, 8)).toBe(3)
    expect(clampPageIndex(4, 0)).toBe(0)
  })

  it('accepts only non-negative decimal route values', () => {
    expect(parsePageIndexParam('12')).toBe(12)
    expect(parsePageIndexParam(['3', '4'])).toBe(3)
    expect(parsePageIndexParam('-1')).toBe(0)
    expect(parsePageIndexParam('1e2')).toBe(0)
    expect(parsePageIndexParam(undefined)).toBe(0)
  })

  it('normalizes supported reader modes', () => {
    expect(parseReaderMode('scroll')).toBe('scroll')
    expect(parseReaderMode('paged')).toBe('paged')
    expect(parseReaderMode('flip')).toBe('paged')
    expect(parseReaderMode('unknown')).toBeUndefined()
  })

  it('resolves explicit, saved and default reader modes in order', () => {
    expect(resolveInitialReaderMode('scroll', 'paged', 'paged')).toBe('scroll')
    expect(resolveInitialReaderMode(undefined, 'scroll', 'paged')).toBe('scroll')
    expect(resolveInitialReaderMode(undefined, undefined, 'scroll')).toBe('scroll')
  })

  it('maps logical page indices for both paging directions', () => {
    expect(pageIndexesForDirection(4, 'ltr')).toEqual([0, 1, 2, 3])
    expect(pageIndexesForDirection(4, 'rtl')).toEqual([3, 2, 1, 0])
    expect(displayIndexForPage(1, 4, 'ltr')).toBe(1)
    expect(displayIndexForPage(1, 4, 'rtl')).toBe(2)
    expect(pageDeltaForTap('ltr', 'left')).toBe(-1)
    expect(pageDeltaForTap('ltr', 'right')).toBe(1)
    expect(pageDeltaForTap('rtl', 'left')).toBe(1)
    expect(pageDeltaForTap('rtl', 'right')).toBe(-1)
  })

  it('includes scrolling gaps except after the final page', () => {
    expect(buildScrollingPageLayouts([0.5, 1, 2], 100, 8)).toEqual([
      { index: 0, offset: 0, length: 208 },
      { index: 1, offset: 208, length: 108 },
      { index: 2, offset: 316, length: 50 },
    ])
  })

  it('builds monotonic layouts for a thousand-page reader', () => {
    const layouts = buildScrollingPageLayouts(
      Array.from({ length: 1000 }, (_, index) => index % 3 === 0 ? 0.5 : 2 / 3),
      390,
      8,
    )
    expect(layouts).toHaveLength(1000)
    expect(layouts.every((layout, index) =>
      layout.index === index &&
      layout.length > 0 &&
      (index === 0 || layout.offset > layouts[index - 1].offset),
    )).toBe(true)
  })

  it('finds the page crossing the viewport center for tall and short pages', () => {
    const layouts = [
      { index: 0, offset: 0, length: 1_200 },
      { index: 1, offset: 1_200, length: 300 },
      { index: 2, offset: 1_500, length: 900 },
    ]
    expect(pageIndexAtViewportCenter(layouts, 100, 600)).toBe(0)
    expect(pageIndexAtViewportCenter(layouts, 950, 600)).toBe(1)
    expect(pageIndexAtViewportCenter(layouts, 1_400, 600)).toBe(2)
  })
})
