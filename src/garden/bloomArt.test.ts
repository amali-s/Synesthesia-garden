import { describe, expect, it } from 'vitest'
import { classifyBloomPixel } from './bloomArt'

/**
 * Every opaque color in public/flowers (daisy, tulip, bell, rose, star, poppy, orchid).
 * Stems stay. Petal pink, red, and the poppy's brown outline already take a paint role.
 */
const SHEET_PIXELS: Array<[number, number, number, 'keep' | 'lite' | 'mid' | 'deep' | 'center']> = [
  [58, 113, 69, 'keep'],
  [39, 65, 44, 'keep'],
  [33, 69, 40, 'keep'],
  [121, 152, 71, 'keep'],
  [246, 201, 215, 'lite'],
  [248, 211, 223, 'lite'],
  [246, 202, 216, 'lite'],
  [236, 102, 138, 'mid'],
  [227, 98, 133, 'mid'],
  [229, 99, 133, 'mid'],
  [128, 41, 65, 'deep'],
  [77, 36, 47, 'deep'],
  [125, 40, 64, 'deep'],
  [82, 33, 49, 'deep'],
  [59, 47, 43, 'deep'],
  [250, 226, 102, 'center'],
  [222, 195, 105, 'center'],
  [250, 192, 102, 'center'],
  [249, 189, 103, 'center'],
  [249, 220, 104, 'center'],
]

describe('classifyBloomPixel', () => {
  it('does not keep source pink or red from the seven sheets', () => {
    for (const [r, g, b, role] of SHEET_PIXELS) {
      expect(classifyBloomPixel(r, g, b, 255)).toBe(role)
      if (role === 'keep') expect(g).toBeGreaterThan(r)
      else expect(r > g + 8 && r > b + 8).toBe(true)
    }
  })
})
