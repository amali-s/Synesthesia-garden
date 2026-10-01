import { describe, expect, it } from 'vitest'
import { bloomCenter, bloomLite, bloomPaintRgb, colorFromBloom } from './palette'

describe('bloomPaintRgb', () => {
  it('keeps daytime petal paint on cream', () => {
    const mid = colorFromBloom(0.3, 0.4, 0.7)
    expect(bloomPaintRgb(0, 0.5, 0.5, 0)).toEqual({
      mid: [43, 125, 143],
      deep: [34, 117, 123],
      lite: [123, 176, 191],
      center: [151, 164, 114],
    })
    expect(bloomPaintRgb(0.5, 0.2, 0.8, 0)).toEqual({
      mid: [243, 214, 134],
      deep: [155, 158, 135],
      lite: [250, 228, 166],
      center: [241, 204, 110],
    })
    expect(bloomPaintRgb(0.25, 1, 0, 0)).toEqual({
      mid: [159, 90, 108],
      deep: [180, 81, 69],
      lite: [219, 182, 156],
      center: [212, 168, 137],
    })
    expect(bloomPaintRgb(1, 0.5, 0.5, 0)).toEqual(bloomPaintRgb(0, 0.5, 0.5, 0))
    expect(bloomPaintRgb(0.1, 0.4, 0.6, 0.5)).toEqual({
      mid: [136, 121, 97],
      deep: [162, 102, 87],
      lite: [184, 151, 129],
      center: [175, 135, 100],
    })
    expect(bloomLite(mid, 0.4, 0.7)).toBe('hsl(230.7 29.3% 61.2%)')
    expect(bloomCenter(mid)).toEqual({
      h: 8.000000000000027,
      s: 19.230769230769234,
      l: 69.41176470588235,
    })
  })
})
