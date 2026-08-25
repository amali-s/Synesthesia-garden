import { describe, expect, it } from 'vitest'
import {
  MUSIC_MAX_HZ,
  MUSIC_MIN_HZ,
  VOCAL_MAX_HZ,
  VOCAL_MIN_HZ,
  pitchNorm,
} from './pitch'

describe('pitchNorm — Speaker window (80–1000 Hz)', () => {
  it('clamps below the floor and above the ceiling', () => {
    expect(pitchNorm(VOCAL_MIN_HZ - 1)).toBe(0)
    expect(pitchNorm(40)).toBe(0)
    expect(pitchNorm(VOCAL_MAX_HZ + 1)).toBe(1)
    expect(pitchNorm(8000)).toBe(1)
  })

  it('puts the window edges at 0 and 1', () => {
    expect(pitchNorm(VOCAL_MIN_HZ)).toBe(0)
    expect(pitchNorm(VOCAL_MAX_HZ)).toBe(1)
  })

  it('maps the geometric midpoint to the middle of the range', () => {
    const mid = Math.sqrt(VOCAL_MIN_HZ * VOCAL_MAX_HZ)
    expect(pitchNorm(mid)).toBeCloseTo(0.5, 6)
  })

  it('is log-scaled, not linear in Hz', () => {
    // Linear would put 540 Hz (the arithmetic midpoint) at 0.5.
    const arithmeticMid = (VOCAL_MIN_HZ + VOCAL_MAX_HZ) / 2
    expect(pitchNorm(arithmeticMid)).toBeGreaterThan(0.7)
  })
})

describe('pitchNorm — Music window (50–4000 Hz)', () => {
  it('clamps below the floor and above the ceiling', () => {
    expect(pitchNorm(MUSIC_MIN_HZ - 1, 'music')).toBe(0)
    expect(pitchNorm(MUSIC_MAX_HZ + 1, 'music')).toBe(1)
  })

  it('keeps a 1 kHz instrument off the top bed', () => {
    // The same Hz is clamped to 1 in Speaker; Music must leave room above it.
    expect(pitchNorm(1000)).toBe(1)
    expect(pitchNorm(1000, 'music')).toBeLessThan(0.75)
  })

  it('maps the geometric midpoint to the middle of the range', () => {
    const mid = Math.sqrt(MUSIC_MIN_HZ * MUSIC_MAX_HZ)
    expect(pitchNorm(mid, 'music')).toBeCloseTo(0.5, 6)
  })
})

describe('pitchNorm — an octave is a constant step', () => {
  it('moves Speaker pitchNorm by the same amount per octave mid-window', () => {
    // A3 → A4 → A5 all sit inside 80–1000 Hz.
    const low = pitchNorm(220) - pitchNorm(110)
    const high = pitchNorm(880) - pitchNorm(440)
    expect(low).toBeGreaterThan(0.1)
    expect(high).toBeCloseTo(low, 6)
  })

  it('moves Music pitchNorm by the same amount per octave mid-window', () => {
    const low = pitchNorm(220, 'music') - pitchNorm(110, 'music')
    const high = pitchNorm(1760, 'music') - pitchNorm(880, 'music')
    expect(low).toBeGreaterThan(0.1)
    expect(high).toBeCloseTo(low, 6)
  })

  it('spends one octave of the Speaker window per octave sung', () => {
    // log2(1000/80) ≈ 3.64 octaves across the window.
    const octaves = Math.log2(VOCAL_MAX_HZ / VOCAL_MIN_HZ)
    expect(pitchNorm(320) - pitchNorm(160)).toBeCloseTo(1 / octaves, 6)
  })
})
