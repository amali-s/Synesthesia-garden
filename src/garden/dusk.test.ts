import { describe, expect, it } from 'vitest'
import {
  DUSK_EASE_MS,
  SKY_LISTEN_MS,
  duskWeight,
  hourGelForDusk,
  hourTintForListenMs,
  stepDuskT,
} from './palette'

describe('stepDuskT', () => {
  it('eases to night in half a second and back to daylight', () => {
    expect(stepDuskT(0, true, DUSK_EASE_MS)).toBe(1)
    expect(stepDuskT(0, true, DUSK_EASE_MS / 2)).toBe(0.5)
    expect(stepDuskT(1, false, DUSK_EASE_MS)).toBe(0)
    expect(stepDuskT(1, false, DUSK_EASE_MS / 2)).toBe(0.5)
  })

  it('holds the ends and does not overshoot', () => {
    expect(stepDuskT(0, false, 1000)).toBe(0)
    expect(stepDuskT(1, true, 1000)).toBe(1)
    expect(stepDuskT(0.2, true, 0)).toBe(0.2)
    expect(stepDuskT(0.2, true, DUSK_EASE_MS * 4)).toBe(1)
  })
})

describe('duskWeight', () => {
  it('eases in and out without moving the ends', () => {
    expect(duskWeight(0)).toBe(0)
    expect(duskWeight(1)).toBe(1)
    expect(duskWeight(0.5)).toBe(0.5)
    expect(duskWeight(0.25)).toBeLessThan(0.25)
    expect(duskWeight(0.75)).toBeGreaterThan(0.75)
  })
})

describe('hourGelForDusk', () => {
  it('matches the hour gel while paused', () => {
    const day = hourTintForListenMs(0)
    expect(hourGelForDusk(0, 0)).toEqual(day)
  })

  it('drops the gel as dusk rises, including after a long listen', () => {
    const late = hourTintForListenMs(SKY_LISTEN_MS)
    expect(late.alpha).toBeGreaterThan(0)
    expect(hourGelForDusk(SKY_LISTEN_MS, 1).alpha).toBe(0)
    expect(hourGelForDusk(SKY_LISTEN_MS, 0.5).alpha).toBeCloseTo(late.alpha * 0.5)
    expect(hourGelForDusk(SKY_LISTEN_MS * 3, 1).alpha).toBe(0)
  })
})
