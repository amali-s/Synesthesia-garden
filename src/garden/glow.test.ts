import { describe, expect, it } from 'vitest'
import { noteNameFromHz, pitchClassT } from '../audio/pitch'
import { glowAmount, pitchClassCents, pitchClassMatch, smoothLoudness } from './glow'
import { PITCH_MATCH_CENTS } from './world'

function hzAtCents(baseHz: number, cents: number): number {
  return baseHz * 2 ** (cents / 1200)
}

describe('pitchClassMatch', () => {
  it('matches the same pitch class in other octaves', () => {
    expect(pitchClassMatch(440, 220)).toBe(1)
    expect(pitchClassMatch(440, 880)).toBe(1)
    expect(noteNameFromHz(220)).toBe('A3')
    expect(noteNameFromHz(440)).toBe('A4')
    expect(noteNameFromHz(880)).toBe('A5')
    expect(pitchClassCents(440, 880)).toBeCloseTo(0, 6)
  })

  it('rejects a neighbor a semitone away', () => {
    const aSharp = hzAtCents(440, 100)
    const gSharp = hzAtCents(440, -100)
    expect(noteNameFromHz(aSharp)).toBe('A#4')
    expect(noteNameFromHz(gSharp)).toBe('G#4')
    expect(pitchClassMatch(440, aSharp)).toBe(0)
    expect(pitchClassMatch(440, gSharp)).toBe(0)
  })

  it('matches across the G#/A wrap', () => {
    // 25¢ flat of A5 sits on the G# side of the seam (pitch class near 1).
    // 25¢ sharp of A4 sits just above A (pitch class near 0).
    // Circular distance is 50¢. A raw subtract treats them as almost an octave apart.
    const gSharpSide = hzAtCents(880, -25)
    const aSide = hzAtCents(440, 25)
    expect(pitchClassT(gSharpSide)).toBeGreaterThan(0.9)
    expect(pitchClassT(aSide)).toBeLessThan(0.05)
    expect(Math.abs(pitchClassT(gSharpSide) - pitchClassT(aSide))).toBeGreaterThan(0.9)
    expect(pitchClassCents(gSharpSide, aSide)).toBeCloseTo(PITCH_MATCH_CENTS, 4)
    expect(pitchClassMatch(gSharpSide, aSide)).toBe(1)
    expect(pitchClassMatch(hzAtCents(880, -30), hzAtCents(440, 22))).toBe(0)
  })
})

describe('glowAmount', () => {
  const light = (loudnessT: number) => ({
    hz: 440,
    loudnessT,
    panT: 0.35,
    pitchT: 0.42,
  })

  it('scales a matching pitch class by loudness and leaves other notes dark', () => {
    expect(glowAmount(880, light(0.25), false)).toBeCloseTo(0.25, 5)
    expect(glowAmount(220, light(1), false)).toBe(1)
    expect(glowAmount(hzAtCents(440, 100), light(1), false)).toBe(0)
  })

  it('keeps wilted flowers dark and is silent without a listen light', () => {
    expect(glowAmount(440, light(1), true)).toBe(0)
    expect(glowAmount(440, null, false)).toBe(0)
  })
})

describe('smoothLoudness', () => {
  it('attacks faster than it releases', () => {
    const risen = smoothLoudness(0, 1, 48)
    const fallen = 1 - smoothLoudness(1, 0, 48)
    expect(risen).toBeGreaterThan(0.5)
    expect(fallen).toBeLessThan(0.3)
    expect(risen).toBeGreaterThan(fallen)
  })
})
