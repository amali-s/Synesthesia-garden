import { describe, expect, it } from 'vitest'
import { FLOWER_KINDS } from '../sprites'
import {
  GRASS_COUNT,
  GRASS_DISC_RADIUS,
  GRASS_SEAT_CLEAR,
  VOXEL,
  createGrassBladeGeometry,
  createKindGeometry,
  createStemGeometry,
  grassBladePose,
} from './flowers'

describe('createKindGeometry', () => {
  it('returns non-empty geometry with bounding height > 0 for all seven kinds', () => {
    for (const kind of FLOWER_KINDS) {
      const geo = createKindGeometry(kind)
      const pos = geo.getAttribute('position')
      geo.computeBoundingBox()
      const box = geo.boundingBox
      expect(pos).toBeTruthy()
      expect(pos!.count).toBeGreaterThan(0)
      expect(box).not.toBeNull()
      expect(box!.max.y - box!.min.y).toBeGreaterThan(0)
      geo.dispose()
    }
  })

  it('gives each species a distinct silhouette', () => {
    const daisy = bounds('daisy')
    const tulip = bounds('tulip')
    const bell = bounds('bell')
    const star = bounds('star')
    expect(daisy.h).toBeLessThan(tulip.h)
    expect(bell.minY).toBeLessThan(0)
    expect(star.w).toBeGreaterThan(star.h * 0.8)
  })

  it('snaps bloom vertices to the voxel grid', () => {
    const scale = 1.85
    for (const kind of FLOWER_KINDS) {
      const geo = createKindGeometry(kind)
      const pos = geo.getAttribute('position')
      expect(pos).toBeTruthy()
      for (let i = 0; i < pos!.count; i++) {
        for (const v of [pos!.getX(i), pos!.getY(i), pos!.getZ(i)]) {
          const g = v / scale / VOXEL
          expect(Math.abs(g - Math.round(g))).toBeLessThan(1e-6)
        }
      }
      geo.dispose()
    }
  })
})

describe('createStemGeometry', () => {
  it('is a standing cylinder with height', () => {
    const geo = createStemGeometry()
    geo.computeBoundingBox()
    const box = geo.boundingBox!
    const pos = geo.getAttribute('position')
    const col = geo.getAttribute('color')
    expect(pos.count).toBeGreaterThan(0)
    expect(box.max.y - box.min.y).toBeGreaterThan(0.5)
    expect(box.max.x - box.min.x).toBeCloseTo(box.max.z - box.min.z)
    let low = 0
    let high = 0
    let nLow = 0
    let nHigh = 0
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const lum = col.getX(i) + col.getY(i) + col.getZ(i)
      if (y < -0.1) {
        low += lum
        nLow++
      } else if (y > 0.1) {
        high += lum
        nHigh++
      }
    }
    expect(nLow).toBeGreaterThan(0)
    expect(nHigh).toBeGreaterThan(0)
    expect(low / nLow).toBeLessThan(high / nHigh)
    geo.dispose()
  })
})

describe('grassBladePose', () => {
  it('stays on the disc and off the seat', () => {
    for (let i = 0; i < GRASS_COUNT; i++) {
      const p = grassBladePose(i)
      const r = Math.hypot(p.x, p.z)
      expect(r).toBeGreaterThanOrEqual(GRASS_SEAT_CLEAR)
      expect(r).toBeLessThanOrEqual(GRASS_DISC_RADIUS + 1e-6)
    }
  })

  it('is stable for the same index', () => {
    expect(grassBladePose(12)).toEqual(grassBladePose(12))
  })
})

describe('createGrassBladeGeometry', () => {
  it('has height', () => {
    const geo = createGrassBladeGeometry()
    geo.computeBoundingBox()
    const box = geo.boundingBox!
    const w = box.max.x - box.min.x
    const d = box.max.z - box.min.z
    expect(geo.getAttribute('position').count).toBeGreaterThan(0)
    expect(box.max.y - box.min.y).toBeGreaterThan(0)
    expect(Math.min(w, d)).toBeGreaterThan(0)
    expect(Math.min(w, d)).toBeLessThan(Math.max(w, d))
    geo.dispose()
  })
})

function bounds(kind: (typeof FLOWER_KINDS)[number]): { h: number; w: number; minY: number } {
  const geo = createKindGeometry(kind)
  geo.computeBoundingBox()
  const box = geo.boundingBox!
  const h = box.max.y - box.min.y
  const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z)
  const minY = box.min.y
  geo.dispose()
  return { h, w, minY }
}
