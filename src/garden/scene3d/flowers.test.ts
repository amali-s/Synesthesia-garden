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
    expect(geo.getAttribute('position').count).toBeGreaterThan(0)
    expect(geo.boundingBox!.max.y - geo.boundingBox!.min.y).toBeGreaterThan(0.5)
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
    expect(geo.getAttribute('position').count).toBeGreaterThan(0)
    expect(geo.boundingBox!.max.y - geo.boundingBox!.min.y).toBeGreaterThan(0)
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
