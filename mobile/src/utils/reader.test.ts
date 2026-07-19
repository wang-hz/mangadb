import {
  clampPageIndex,
  pageIndexAtViewportCenter,
  parsePageIndexParam,
  parseReaderMode,
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

  it('finds the page crossing the viewport center for tall and short pages', () => {
    const layouts = [
      { offset: 0, length: 1_200 },
      { offset: 1_200, length: 300 },
      { offset: 1_500, length: 900 },
    ]
    expect(pageIndexAtViewportCenter(layouts, 100, 600)).toBe(0)
    expect(pageIndexAtViewportCenter(layouts, 950, 600)).toBe(1)
    expect(pageIndexAtViewportCenter(layouts, 1_400, 600)).toBe(2)
  })
})
