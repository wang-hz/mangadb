import {
  READER_IMAGE_TARGET_PIXEL_BUDGET,
  readerImageDecodeLayout,
} from './ZoomableReaderImage'

describe('readerImageDecodeLayout', () => {
  it('keeps ordinary pages at their layout size', () => {
    expect(readerImageDecodeLayout(390, 844, 3)).toEqual({
      width: 390,
      height: 844,
      displayScale: 1,
    })
  })

  it('caps long-page decode targets near eight megapixels without changing display size', () => {
    const displayWidth = 390
    const displayHeight = 7_800
    const pixelScale = 3
    const layout = readerImageDecodeLayout(displayWidth, displayHeight, pixelScale)
    const decodedPixels = layout.width * layout.height * pixelScale * pixelScale

    expect(decodedPixels).toBeCloseTo(READER_IMAGE_TARGET_PIXEL_BUDGET, -2)
    expect(layout.width * layout.displayScale).toBeCloseTo(displayWidth)
    expect(layout.height * layout.displayScale).toBeCloseTo(displayHeight)
    expect(layout.displayScale).toBeGreaterThan(1)
  })

  it('normalizes invalid dimensions and pixel scales', () => {
    expect(readerImageDecodeLayout(Number.NaN, -1, 0)).toEqual({
      width: 0,
      height: 0,
      displayScale: 1,
    })
  })
})
