import { describe, expect, it } from 'vitest'
import { GARDEN_BEDS } from './beds'
import {
  bedForRegister,
  createFirefly,
  FIREFLY_BODY,
  FIREFLY_LAMP,
  FIREFLY_SPEED,
  FIREFLY_TRAIL,
  fireflyPaint,
  fireflySpeed,
  fireflyTarget,
  POLLEN_CAP,
  POLLEN_LIFE_MS,
  POLLEN_RESONANCE,
  POLLEN_RISE,
  pollenEmitChance,
  pollenPaint,
  shedPollen,
  stepFirefly,
  stepPollen,
  TRAIL_LIFE_MS,
  type PollenSource,
} from './firefly'
import { pitchClassIndex } from './halo'
import { emissiveGlowPair, rgbCss } from './palette'

function placedAt(x: number, y: number) {
  const state = createFirefly()
  state.placed = true
  state.x = x
  state.y = y
  return state
}

function glowing(n: number, resonance = 1): PollenSource[] {
  return Array.from({ length: n }, (_, i) => ({
    x: 10 + (i % 17),
    y: 40,
    resonance,
    living: true,
    hz: 440,
  }))
}

describe('fireflyTarget', () => {
  it('uses the same register test as the pitch square', () => {
    for (const bed of GARDEN_BEDS) {
      const mid = (bed.pitch0 + Math.min(bed.pitch1, 1)) / 2
      expect(bedForRegister(mid)?.id).toBe(bed.id)
      expect(bedForRegister(bed.pitch0)?.id).toBe(bed.id)
    }
    expect(bedForRegister(-0.1)).toBeNull()
    expect(bedForRegister(1.2)).toBeNull()
  })

  it('parks pan inside the active bed and sends a new register to that bed', () => {
    const low = (GARDEN_BEDS.find((b) => b.id === 'f0')!)
    const high = (GARDEN_BEDS.find((b) => b.id === 'b3')!)
    const lowT = (low.pitch0 + low.pitch1) / 2
    const highT = (high.pitch0 + Math.min(high.pitch1, 1)) / 2

    const left = fireflyTarget(lowT, 0, 400)
    const right = fireflyTarget(lowT, 1, 400)
    expect(left.y).toBe(low.y + 10)
    expect(right.y).toBe(low.y + 10)
    expect(left.x).toBeGreaterThanOrEqual(low.x)
    expect(right.x).toBeLessThanOrEqual(low.x + low.w)
    expect(right.x).toBeGreaterThan(left.x)

    const back = fireflyTarget(highT, 0.5, 400)
    expect(back.y).toBe(high.y + 10)
    expect(back.y).not.toBe(left.y)
    expect(back.x).toBeGreaterThan(high.x)
    expect(back.x).toBeLessThan(high.x + high.w)
  })

  it('keeps the old corner when the register misses every bed', () => {
    expect(fireflyTarget(1.4, 0.2, 320)).toEqual({ x: 306, y: 14 })
  })
})

describe('stepFirefly', () => {
  it('crosses farther when smoothed loudness is higher', () => {
    const loud = placedAt(0, 40)
    const quiet = placedAt(0, 40)
    stepFirefly(loud, { x: 400, y: 40 }, 1, 500, '#fff', false)
    stepFirefly(quiet, { x: 400, y: 40 }, 0.25, 500, '#fff', false)
    expect(loud.x).toBeCloseTo(FIREFLY_SPEED * 0.5, 5)
    expect(quiet.x).toBeCloseTo(FIREFLY_SPEED * 0.25 * 0.5, 5)
    expect(loud.x).toBeGreaterThan(quiet.x * 3)
    expect(fireflySpeed(0)).toBe(0)
  })

  it('holds still in silence and keeps a short fading trail while it moves', () => {
    const state = placedAt(0, 10)
    stepFirefly(state, { x: 80, y: 10 }, 0, 100, 'rgb(1 2 3)', false)
    expect(state.x).toBe(0)
    expect(state.trail).toHaveLength(0)

    for (let i = 0; i < 40; i++) {
      stepFirefly(state, { x: 500, y: 10 }, 1, 16, `rgb(${i} 0 0)`, false)
    }
    expect(state.trail.length).toBeGreaterThan(0)
    expect(state.trail.length).toBeLessThanOrEqual(FIREFLY_TRAIL)
    expect(state.trail[0]!.life).toBeLessThan(state.trail[state.trail.length - 1]!.life)
    const youngest = state.trail[state.trail.length - 1]!.color

    stepFirefly(state, { x: state.x, y: state.y }, 0, TRAIL_LIFE_MS, youngest, false)
    expect(state.trail).toHaveLength(0)
  })

  it('is drawn from a few pixels, not a sprite', () => {
    const pixels = FIREFLY_BODY.length + 1
    expect(pixels).toBeGreaterThanOrEqual(3)
    expect(pixels).toBeLessThanOrEqual(7)
    expect(FIREFLY_LAMP).toEqual([0, 0])
    expect(FIREFLY_BODY.some(([x, y]) => x === 0 && y === 0)).toBe(false)
  })

  it('parks on the bed with no trail and no pollen when motion is reduced', () => {
    const state = placedAt(0, 0)
    state.trail.push({ x: 1, y: 2, life: 1, color: 'red' })
    state.pollen.push({ x: 3, y: 4, life: 1, color: 'gold' })
    const bed = GARDEN_BEDS.find((b) => b.id === 'f2')!
    const target = fireflyTarget((bed.pitch0 + bed.pitch1) / 2, 0.25, 400)
    stepFirefly(state, target, 1, 16, 'rgb(9 9 9)', true)
    expect(state.x).toBe(target.x)
    expect(state.y).toBe(target.y)
    expect(state.trail).toHaveLength(0)
    expect(state.pollen).toHaveLength(0)
  })
})

describe('fireflyPaint', () => {
  it('uses the emissive pair of the live pitch class', () => {
    const pair = emissiveGlowPair(pitchClassIndex(440))
    const paint = fireflyPaint(440, 0.2)
    expect(paint.body).toBe(rgbCss(pair.body))
    expect(paint.core).toBe(rgbCss(pair.core))
    expect(fireflyPaint(261.63, 0.2).body).not.toBe(paint.body)
  })

  it('falls back to the pitch-square hue when there is no note', () => {
    expect(fireflyPaint(null, 0).body).toBe('hsl(350 28% 68%)')
    expect(fireflyPaint(0, 0).body).toBe('hsl(350 28% 68%)')
    const t = 0.5
    const h = (350 + t * 42) % 360
    const s = 28 + t * 44
    const l = 68 - t * 14
    expect(fireflyPaint(null, t).body).toBe(`hsl(${h} ${s}% ${l}%)`)
  })
})

describe('pollen', () => {
  it('drifts up, fades, and ignores a dim or wilted bloom', () => {
    const state = createFirefly()
    state.pollen.push({ x: 12, y: 50, life: 1, color: 'rgb(1 1 1)' })
    stepPollen(state, 500, false)
    expect(state.pollen[0]!.y).toBeCloseTo(50 - POLLEN_RISE * 0.5, 5)
    expect(state.pollen[0]!.life).toBeLessThan(1)

    stepPollen(state, POLLEN_LIFE_MS, false)
    expect(state.pollen).toHaveLength(0)

    const dim: PollenSource = { x: 4, y: 20, resonance: POLLEN_RESONANCE, living: true, hz: 440 }
    const wilted: PollenSource = { x: 4, y: 20, resonance: 1, living: false, hz: 440 }
    shedPollen(state, [dim, wilted], 1000, [0, 0], false)
    expect(state.pollen).toHaveLength(0)
  })

  it('emits one mote from a glowing bloom and never passes the cap', () => {
    const state = createFirefly()
    const chance = pollenEmitChance(1000)
    expect(chance).toBeGreaterThan(0)
    expect(chance).toBeLessThan(1)

    shedPollen(state, glowing(1), 1000, [chance], false)
    expect(state.pollen).toHaveLength(0)
    shedPollen(state, glowing(1, 0.4), 1000, [0], false)
    expect(state.pollen).toHaveLength(1)
    expect(state.pollen[0]!.color).toBe(pollenPaint(440))
    expect(state.pollen[0]!.y).toBe(40)

    const full = createFirefly()
    shedPollen(full, glowing(200), 1000, glowing(200).map(() => 0), false)
    expect(full.pollen).toHaveLength(POLLEN_CAP)

    shedPollen(full, glowing(50), 1000, glowing(50).map(() => 0), false)
    expect(full.pollen).toHaveLength(POLLEN_CAP)
  })

  it('emits nothing and clears the pool when motion is reduced', () => {
    const state = createFirefly()
    state.pollen.push({ x: 1, y: 2, life: 0.5, color: 'rgb(1 1 1)' })
    shedPollen(state, glowing(10), 1000, glowing(10).map(() => 0), true)
    expect(state.pollen).toHaveLength(0)
    stepPollen(state, 16, true)
    expect(state.pollen).toHaveLength(0)
  })
})
