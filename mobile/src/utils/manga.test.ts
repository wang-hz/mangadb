import { validCoverIndex } from './manga'

describe('manga helpers', () => {
  it('clamps invalid cover indices to the first page', () => {
    expect(validCoverIndex(null, 10)).toBe(0)
    expect(validCoverIndex(-1, 10)).toBe(0)
    expect(validCoverIndex(10, 10)).toBe(0)
    expect(validCoverIndex(4, 10)).toBe(4)
    expect(validCoverIndex(3, 0)).toBe(0)
  })
})
