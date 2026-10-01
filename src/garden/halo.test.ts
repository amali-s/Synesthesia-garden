import { describe, expect, it } from 'vitest'
import { noteNameFromHz } from '../audio/pitch'
import {
  BLOOM_HALO_SPREAD,
  bloomCorePoints,
  downsampleBloomMask,
  glowStep,
  HALO_ALPHA,
  paintBloomHalo,
  paintCorePixels,
  pitchClassIndex,
} from './halo'
import {
  BLOOM_GLOW_BODY,
  BLOOM_GLOW_CORE,
  BLOOM_HEX,
  emissiveFromPitchClass,
  emissiveGlowPair,
  type Rgb,
} from './palette'

function at(data: Uint8ClampedArray, cols: number, x: number, y: number): number[] {
  const i = (y * cols + x) * 4
  return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
}

function fillRect(mask: Uint8Array, cols: number, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) mask[y * cols + x] = 1
  }
}

function litBox(data: Uint8ClampedArray, cols: number, rows: number): { w: number; h: number } {
  let x0 = cols
  let y0 = rows
  let x1 = 0
  let y1 = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (at(data, cols, x, y)[3] === 0) continue
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
  }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

function hueOf([r, g, b]: Rgb): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return (h * 60 + 360) % 360
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

describe('emissiveGlowPair', () => {
  it('keeps a near-white core in the body hue and does not collapse the twelve classes', () => {
    const bodies: string[] = []
    for (let pc = 0; pc < 12; pc++) {
      const { body, core } = emissiveGlowPair(pc)
      expect(hueDistance(hueOf(body), hueOf(core))).toBeLessThan(8)
      expect(Math.min(...core)).toBeGreaterThan(200)
      expect(Math.max(...body) - Math.min(...body)).toBeGreaterThan(40)
      expect(Math.max(...body)).toBeLessThan(230)
      bodies.push(body.join(','))
    }
    expect(new Set(bodies).size).toBeGreaterThan(6)
  })
})

describe('emissiveFromPitchClass', () => {
  it('returns a saturated body and a pale core for a 0–1 pitch class', () => {
    const bodies: string[] = []
    for (let i = 0; i < 12; i++) {
      const pcT = i / 12
      const { body, core } = emissiveFromPitchClass(pcT)
      expect(emissiveGlowPair(i)).toEqual({ body, core })
      expect(hueDistance(hueOf(body), hueOf(core))).toBeLessThan(8)
      expect(Math.min(...core)).toBeGreaterThan(200)
      expect(Math.max(...body) - Math.min(...body)).toBeGreaterThan(40)
      expect(Math.max(...body)).toBeLessThan(230)
      bodies.push(body.join(','))
    }
    expect(new Set(bodies).size).toBe(12)
    expect(BLOOM_GLOW_BODY).not.toContain(BLOOM_HEX.cream)
    expect(BLOOM_GLOW_CORE).not.toContain(BLOOM_HEX.cream)
    expect(emissiveFromPitchClass(1)).toEqual(emissiveFromPitchClass(0))
    expect(emissiveFromPitchClass(1.25)).toEqual(emissiveFromPitchClass(0.25))
    expect(emissiveFromPitchClass(-0.25)).toEqual(emissiveFromPitchClass(0.75))
  })
})

describe('pitchClassIndex', () => {
  it('follows the rounded note name, A = 0', () => {
    expect(pitchClassIndex(440)).toBe(0)
    expect(noteNameFromHz(440).startsWith('A')).toBe(true)
    expect(pitchClassIndex(466.16)).toBe(1)
    expect(pitchClassIndex(415.3)).toBe(11)
    expect(pitchClassIndex(0)).toBe(0)
  })
})

describe('glowStep', () => {
  it('picks a fixed alpha step and stays dark at zero', () => {
    expect(glowStep(0)).toBe(-1)
    expect(glowStep(-0.2)).toBe(-1)
    expect(HALO_ALPHA[glowStep(0.1)!]).toBe(HALO_ALPHA[0])
    expect(glowStep(0.4)).toBe(1)
    expect(glowStep(0.6)).toBe(2)
    expect(glowStep(1)).toBe(3)
    expect(HALO_ALPHA).toHaveLength(4)
  })
})

describe('paintBloomHalo', () => {
  const { body, core } = emissiveGlowPair(0)
  const spread = BLOOM_HALO_SPREAD

  it('wraps a tall bud and leaves the stem and the petal interior dark', () => {
    const w = 9
    const h = 16
    const mask = new Uint8Array(w * h)
    fillRect(mask, w, 2, 1, 6, 7)
    const data = paintBloomHalo(mask, w, h, spread, body, core)
    const cols = w + spread * 2

    expect(at(data, cols, 4 + spread, 4 + spread)[3]).toBe(0)
    expect(at(data, cols, 7 + spread, 4 + spread)[3]).toBe(255)
    expect(at(data, cols, 4 + spread, 14 + spread)[3]).toBe(0)

    let partial = 0
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]!
      if (a !== 0 && a !== 255) partial++
      if (a !== 255) continue
      const rgb = [data[i], data[i + 1], data[i + 2]].join(',')
      if (rgb !== body.join(',')) expect(rgb).toBe(core.join(','))
    }
    expect(partial).toBe(0)
  })

  it('follows the silhouette, so a cup and a wide bloom are not the same disc', () => {
    const tall = new Uint8Array(8 * 16)
    fillRect(tall, 8, 2, 1, 5, 10)
    const wide = new Uint8Array(16 * 8)
    fillRect(wide, 16, 1, 2, 14, 5)
    const tallData = paintBloomHalo(tall, 8, 16, spread, body, core)
    const wideData = paintBloomHalo(wide, 16, 8, spread, body, core)
    const tallBox = litBox(tallData, 8 + spread * 2, 16 + spread * 2)
    const wideBox = litBox(wideData, 16 + spread * 2, 8 + spread * 2)
    expect(tallBox.h).toBeGreaterThan(tallBox.w)
    expect(wideBox.w).toBeGreaterThan(wideBox.h)
  })
})

describe('downsampleBloomMask', () => {
  it('keeps a head at the top of the sheet from spilling down the stem', () => {
    const sw = 4
    const sh = 8
    const mask = new Uint8Array(sw * sh)
    fillRect(mask, sw, 1, 0, 2, 2)
    const out = downsampleBloomMask(mask, sw, sh, 4, 8)
    expect(out[1]).toBe(1)
    expect(out[7 * 4 + 1]).toBe(0)
  })
})

describe('bloomCorePoints', () => {
  it('puts a spark on each separate bloom', () => {
    const w = 10
    const h = 12
    const mask = new Uint8Array(w * h)
    fillRect(mask, w, 1, 1, 3, 3)
    fillRect(mask, w, 6, 7, 8, 9)
    const cores = bloomCorePoints(mask, w, h)
    expect(cores).toHaveLength(2)
    expect(cores[0]!.y).toBeLessThan(4)
    expect(cores[1]!.y).toBeGreaterThan(6)
  })
})

describe('paintCorePixels', () => {
  it('is a 3×3 plus and leaves the corners clear', () => {
    const { core } = emissiveGlowPair(3)
    const data = paintCorePixels(core)
    expect(at(data, 3, 1, 1)).toEqual([...core, 255])
    expect(at(data, 3, 0, 0)[3]).toBe(0)
    expect(at(data, 3, 2, 2)[3]).toBe(0)
    expect(at(data, 3, 1, 0)).toEqual([...core, 255])
  })
})
