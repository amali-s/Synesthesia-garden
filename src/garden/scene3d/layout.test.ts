import { describe, expect, it } from 'vitest'
import { SKY_LISTEN_MS } from '../palette'
import type { FlowerPlant } from '../world'
import {
  RING_RADIUS,
  STEM_HEIGHT_LOUD,
  STEM_HEIGHT_QUIET,
  plantToWorld,
  ringJitter,
  stemHeightFromLoudness,
  sunPoseForListenMs,
  fireflyWorldPosition,
  xzOnRing,
  yawFromPitchT,
} from './layout'

function flower(overrides: Partial<FlowerPlant> = {}): FlowerPlant {
  return {
    type: 'flower',
    x: 40,
    y: 80,
    bedId: 'f0',
    kind: 'daisy',
    pitchT: 0,
    loudnessT: 0.5,
    timbreT: 0.4,
    hz: 440,
    born: 1000,
    baseHue: 200,
    wiltStarted: null,
    singingUntil: 0,
    glowPulseUntil: 0,
    ...overrides,
  }
}

describe('fireflyWorldPosition', () => {
  it('sits on the ring and lifts with loudness', () => {
    const ahead = xzOnRing(0.25)
    const mid = fireflyWorldPosition(0.25, 0.5, 0, 0)
    expect(mid.x).toBeCloseTo(ahead.x, 5)
    expect(mid.z).toBeCloseTo(ahead.z, 5)
    expect(mid.y).toBeCloseTo(1.15, 5)
    const loud = fireflyWorldPosition(0.25, 0.5, 1, 0.2)
    expect(loud.y).toBeGreaterThan(mid.y)
  })

  it('slides along the ring with stereo pan', () => {
    const left = fireflyWorldPosition(0.25, 0, 0.4, 0)
    const right = fireflyWorldPosition(0.25, 1, 0.4, 0)
    expect(Math.hypot(left.x - right.x, left.z - right.z)).toBeGreaterThan(1)
  })
})

describe('xzOnRing', () => {
  it('puts lowest pitch on the left (−X)', () => {
    const p = xzOnRing(0)
    expect(p.x).toBeCloseTo(-RING_RADIUS, 8)
    expect(p.z).toBeCloseTo(0, 8)
  })

  it('puts a quarter of the way up ahead (−Z)', () => {
    const p = xzOnRing(0.25)
    expect(p.x).toBeCloseTo(0, 8)
    expect(p.z).toBeCloseTo(-RING_RADIUS, 8)
  })

  it('puts mid register on the right (+X)', () => {
    const p = xzOnRing(0.5)
    expect(p.x).toBeCloseTo(RING_RADIUS, 8)
    expect(p.z).toBeCloseTo(0, 8)
  })

  it('puts three-quarters behind (+Z)', () => {
    const p = xzOnRing(0.75)
    expect(p.x).toBeCloseTo(0, 8)
    expect(p.z).toBeCloseTo(RING_RADIUS, 8)
  })
})

describe('yawFromPitchT', () => {
  it('is −90° at pitchT 0 and a full turn across the ring', () => {
    expect(yawFromPitchT(0)).toBeCloseTo((-90 * Math.PI) / 180, 8)
    expect(yawFromPitchT(0.25)).toBeCloseTo(0, 8)
    expect(yawFromPitchT(0.5)).toBeCloseTo(Math.PI / 2, 8)
    expect(yawFromPitchT(1)).toBeCloseTo((-90 + 360) * (Math.PI / 180), 8)
  })
})

describe('stemHeightFromLoudness', () => {
  it('maps quiet to a short stem and loud to a tall bar', () => {
    expect(stemHeightFromLoudness(0)).toBeCloseTo(STEM_HEIGHT_QUIET, 8)
    expect(stemHeightFromLoudness(1)).toBeCloseTo(STEM_HEIGHT_LOUD, 8)
    expect(STEM_HEIGHT_QUIET).toBeGreaterThanOrEqual(0.6)
    expect(STEM_HEIGHT_QUIET).toBeLessThanOrEqual(0.9)
    expect(STEM_HEIGHT_LOUD).toBeGreaterThanOrEqual(2.2)
    expect(STEM_HEIGHT_LOUD).toBeLessThanOrEqual(3.2)
  })
})

describe('ringJitter', () => {
  it('is stable for the same hz and born', () => {
    expect(ringJitter(440, 1000)).toEqual(ringJitter(440, 1000))
  })

  it('stays in the 0.15–0.4 m radial band', () => {
    const mag = Math.abs(ringJitter(440, 1000).radial)
    expect(mag).toBeGreaterThanOrEqual(0.15)
    expect(mag).toBeLessThanOrEqual(0.4)
  })
})

describe('plantToWorld', () => {
  it('sits the base on the ground and uses frozen loudness for height', () => {
    const quiet = plantToWorld(flower({ loudnessT: 0, singingUntil: 9e12 }))
    const loud = plantToWorld(flower({ loudnessT: 1, singingUntil: 9e12 }))
    expect(quiet.y).toBe(0)
    expect(loud.y).toBe(0)
    expect(quiet.stemHeight).toBeCloseTo(STEM_HEIGHT_QUIET, 8)
    expect(loud.stemHeight).toBeCloseTo(STEM_HEIGHT_LOUD, 8)
  })

  it('ignores timber bed coordinates', () => {
    const a = plantToWorld(flower({ x: 10, y: 20, bedId: 'f0' }))
    const b = plantToWorld(flower({ x: 200, y: 180, bedId: 'b3' }))
    expect(a.x).toBeCloseTo(b.x, 8)
    expect(a.z).toBeCloseTo(b.z, 8)
    expect(a.yaw).toBeCloseTo(b.yaw, 8)
  })

  it('is stable across calls and keeps nearby notes beside each other', () => {
    const low = flower({ pitchT: 0.24, hz: 392, born: 1 })
    const high = flower({ pitchT: 0.26, hz: 415, born: 2 })
    const first = plantToWorld(low)
    expect(plantToWorld(low)).toEqual(first)
    const yawGap = Math.abs(plantToWorld(high).yaw - first.yaw)
    const around = Math.abs(plantToWorld(flower({ pitchT: 0.7 })).yaw - first.yaw)
    expect(yawGap).toBeLessThan(around)
    expect(yawGap).toBeLessThan(0.2)
  })

  it('still places wilted flowers until they leave the garden', () => {
    const pose = plantToWorld(flower({ wiltStarted: 5000, pitchT: 0.25 }))
    expect(pose.y).toBe(0)
    expect(pose.z).toBeLessThan(0)
    expect(pose.stemHeight).toBeGreaterThan(0)
  })
})

describe('sunPoseForListenMs', () => {
  it('rises in the east, peaks ahead, and sets in the west', () => {
    const dawn = sunPoseForListenMs(0)
    const noon = sunPoseForListenMs(SKY_LISTEN_MS / 2)
    const dusk = sunPoseForListenMs(SKY_LISTEN_MS)

    expect(dawn.x).toBeGreaterThan(4)
    expect(dawn.y).toBeLessThan(noon.y)
    expect(dawn.z).toBeCloseTo(0, 5)

    expect(noon.x).toBeCloseTo(0, 5)
    expect(noon.z).toBeLessThan(0)
    expect(noon.intensity).toBeGreaterThan(dawn.intensity)

    expect(dusk.x).toBeLessThan(-4)
    expect(dusk.y).toBeLessThan(noon.y)
  })
})
