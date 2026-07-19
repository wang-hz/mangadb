import { clampPageIndex, parsePageIndexParam } from './reader'

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
})
