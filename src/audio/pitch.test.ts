import { describe, expect, it } from 'vitest'
import { bedFromPitch } from '../garden/beds'
import {
  MUSIC_BED_MAX_HZ,
  MUSIC_BED_MIN_HZ,
  MUSIC_MAX_HZ,
  MUSIC_MELODY_MAX_HZ,
  MUSIC_MELODY_MIN_HZ,
  MUSIC_MIN_HZ,
  VOCAL_MAX_HZ,
  VOCAL_MIN_HZ,
  pitchNorm,
  yinPitchHz,
} from './pitch'

function harmonicTone(
  fundamentalHz: number,
  sampleRate: number,
  n: number,
  overtones: number[],
): Float32Array {
  return mixTone(sampleRate, n, [{ hz: fundamentalHz, amp: 1, overtones }])
}

function mixTone(
  sampleRate: number,
  n: number,
  layers: Array<{ hz: number; amp: number; overtones?: number[] }>,
): Float32Array {
  const buf = new Float32Array(n)
  const w = (2 * Math.PI) / sampleRate
  for (const layer of layers) {
    const overtones = layer.overtones ?? []
    for (let i = 0; i < n; i++) {
      let s = Math.sin(w * layer.hz * i)
      for (let h = 0; h < overtones.length; h++) {
        s += overtones[h]! * Math.sin(w * layer.hz * (h + 2) * i)
      }
      buf[i]! += layer.amp * s
    }
  }
  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf[i]!))
  if (peak > 1) {
    for (let i = 0; i < n; i++) buf[i]! /= peak
  }
  return buf
}

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

describe('pitchNorm — Music window', () => {
  it('clamps below the floor and above the ceiling', () => {
    expect(pitchNorm(MUSIC_BED_MIN_HZ - 1, 'music')).toBe(0)
    expect(pitchNorm(MUSIC_BED_MAX_HZ + 1, 'music')).toBe(1)
  })

  it('keeps a 1 kHz instrument off the top bed', () => {
    // The same Hz is clamped to 1 in Speaker; Music must leave room above it.
    expect(pitchNorm(1000)).toBe(1)
    expect(pitchNorm(1000, 'music')).toBeLessThan(0.75)
  })

  it('maps the geometric midpoint of the bed window to the front/back split', () => {
    const mid = Math.sqrt(MUSIC_BED_MIN_HZ * MUSIC_BED_MAX_HZ)
    expect(pitchNorm(mid, 'music')).toBeCloseTo(0.5, 6)
  })

  it('puts a 500 Hz mix note on the front row, not b0', () => {
    // Old 50–4000 map split at 447 Hz, so typical vocals all sat on the back.
    expect(pitchNorm(500, 'music')).toBeLessThan(0.5)
    expect(bedFromPitch(pitchNorm(500, 'music')).id).toMatch(/^f/)
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

describe('pitchNorm — Music beds for typical mix notes', () => {
  it('puts A3–A4 on the front row (f0–f3), not the back', () => {
    expect(bedFromPitch(pitchNorm(220, 'music')).id).toMatch(/^f/)
    expect(bedFromPitch(pitchNorm(330, 'music')).id).toMatch(/^f/)
    expect(bedFromPitch(pitchNorm(440, 'music')).id).toMatch(/^f/)
  })

  it('puts A5 on the back row', () => {
    expect(bedFromPitch(pitchNorm(880, 'music')).id).toMatch(/^b/)
  })
})

describe('yinPitchHz — Music prefers the fundamental', () => {
  const sr = 48_000
  const n = 2048
  const music = { preferFundamental: true as const }

  it('keeps a bright 220 Hz tone on the front-row fundamental, not 440 Hz', () => {
    const buf = harmonicTone(220, sr, n, [1.3, 0.7, 0.35])
    const found = yinPitchHz(buf, sr, MUSIC_MIN_HZ, MUSIC_MAX_HZ, music)
    expect(found).not.toBeNull()
    expect(found!.hz).toBeGreaterThan(200)
    expect(found!.hz).toBeLessThan(280)
    expect(bedFromPitch(pitchNorm(found!.hz, 'music')).id).toMatch(/^f/)
  })

  it('does not walk a clean high sine down an octave', () => {
    const buf = harmonicTone(880, sr, n, [])
    const found = yinPitchHz(buf, sr, MUSIC_MIN_HZ, MUSIC_MAX_HZ, music)
    expect(found).not.toBeNull()
    expect(found!.hz).toBeGreaterThan(800)
    expect(found!.hz).toBeLessThan(980)
  })

  it('still hears a 220 Hz sine without the mix bias (Speaker path)', () => {
    const buf = harmonicTone(220, sr, n, [])
    const found = yinPitchHz(buf, sr, VOCAL_MIN_HZ, VOCAL_MAX_HZ)
    expect(found).not.toBeNull()
    expect(found!.hz).toBeGreaterThan(200)
    expect(found!.hz).toBeLessThan(240)
  })
})

describe('yinPitchHz — Music melody-band mix', () => {
  const sr = 48_000
  const n = 2048
  const music = { preferFundamental: true as const }

  it('picks a G4 vocal over a stronger bass (Fences-style)', () => {
    const buf = mixTone(sr, n, [
      { hz: 62, amp: 1, overtones: [0.45, 0.2] },
      { hz: 392, amp: 0.7, overtones: [0.35, 0.18] },
    ])
    const found = yinPitchHz(buf, sr, MUSIC_MIN_HZ, MUSIC_MAX_HZ, music)
    expect(found).not.toBeNull()
    expect(found!.hz).toBeGreaterThan(MUSIC_MELODY_MIN_HZ)
    expect(found!.hz).toBeGreaterThan(340)
    expect(found!.hz).toBeLessThan(460)
    expect(bedFromPitch(pitchNorm(found!.hz, 'music')).id).toMatch(/^f/)
  })

  it('picks a bright A5 synth over bass, still on the back row', () => {
    const buf = mixTone(sr, n, [
      { hz: 82, amp: 1, overtones: [0.4, 0.18] },
      { hz: 880, amp: 0.65, overtones: [0.25] },
    ])
    const found = yinPitchHz(buf, sr, MUSIC_MIN_HZ, MUSIC_MAX_HZ, music)
    expect(found).not.toBeNull()
    expect(found!.hz).toBeGreaterThan(800)
    expect(found!.hz).toBeLessThan(MUSIC_MELODY_MAX_HZ)
    expect(bedFromPitch(pitchNorm(found!.hz, 'music')).id).toMatch(/^b/)
  })

  it('still hears a bass-only mix on the front-left fundamental', () => {
    const buf = mixTone(sr, n, [{ hz: 82, amp: 1, overtones: [0.5, 0.25] }])
    const found = yinPitchHz(buf, sr, MUSIC_MIN_HZ, MUSIC_MAX_HZ, music)
    expect(found).not.toBeNull()
    expect(found!.hz).toBeGreaterThan(70)
    expect(found!.hz).toBeLessThan(100)
    expect(bedFromPitch(pitchNorm(found!.hz, 'music')).id).toMatch(/^f/)
  })
})

