import { describe, expect, it } from 'vitest'
import { bloomDrawHeight } from './bloomArt'
import {
  BREATH_PERIOD_MS,
  ONSET_FLASH_COOLDOWN_MS,
  ONSET_HOLD_LIGHT,
  ONSET_PULSE_MS,
  ONSET_RIPPLE_MS,
  ONSET_SPIKE_LIGHT,
  breathGain,
  createOnsetGate,
  haloBrightness,
  onsetBrightness,
  onsetRipple,
  stepOnsetGate,
  swayAmplitude,
  swayDisplacement,
  swayPair,
} from './motion'

describe('swayAmplitude', () => {
  it('keeps a small sway when quiet and a deeper sway when loud', () => {
    expect(swayAmplitude(0)).toBeGreaterThan(0)
    expect(swayAmplitude(0)).toBeLessThan(swayAmplitude(0.5))
    expect(swayAmplitude(0.5)).toBeLessThan(swayAmplitude(1))
    expect(swayAmplitude(1)).toBe(1)
  })

  it('uses the clock as phase and loudness as size', () => {
    let found = false
    for (let now = 0; now < 5000; now += 25) {
      const quiet = swayDisplacement(now, 0.4, 0, false)
      const loud = swayDisplacement(now, 0.4, 1, false)
      if (Math.abs(loud) < 0.4) continue
      expect(loud / swayAmplitude(1)).toBeCloseTo(quiet / swayAmplitude(0), 5)
      expect(Math.abs(loud)).toBeGreaterThan(Math.abs(quiet))
      found = true
      break
    }
    expect(found).toBe(true)
  })

  it('freezes under reduced motion', () => {
    expect(swayDisplacement(1400, 1.2, 1, true)).toBe(0)
    expect(swayPair(1400, 1.2, 1, true)).toEqual({ lean: 0, cross: 0 })
    const moving = swayPair(1400, 1.2, 1, false)
    const still = swayPair(1400, 1.2, 0, false)
    expect(Math.abs(moving.lean) + Math.abs(moving.cross)).toBeGreaterThan(
      Math.abs(still.lean) + Math.abs(still.cross),
    )
  })
})

describe('breathGain', () => {
  it('cycles about once a second and deepens when louder', () => {
    const loud = breathGain(250, 1, false)
    const quiet = breathGain(250, 0.15, false)
    expect(loud - 1).toBeGreaterThan(quiet - 1)
    expect(breathGain(250, 1, false)).toBeCloseTo(breathGain(250 + BREATH_PERIOD_MS, 1, false), 8)
    expect(breathGain(750, 1, false) - 1).toBeCloseTo(-(breathGain(250, 1, false) - 1), 8)
  })

  it('stays flat under reduced motion', () => {
    expect(breathGain(250, 1, true)).toBe(1)
    expect(breathGain(750, 1, true)).toBe(1)
  })

  it('crests once a second, not three', () => {
    const samples: number[] = []
    for (let t = 0; t <= 3000; t += 20) samples.push(breathGain(t, 1, false))
    let peaks = 0
    for (let i = 1; i < samples.length - 1; i++) {
      if (samples[i]! > samples[i - 1]! && samples[i]! >= samples[i + 1]!) peaks++
    }
    expect(peaks).toBeLessThanOrEqual(3)
    expect(peaks).toBeGreaterThan(0)
  })
})

describe('onsetRipple', () => {
  it('keeps the delay across the bed', () => {
    const onset = 5000
    expect(onsetRipple(onset, onset, 0)).toBe(1)
    expect(onsetRipple(onset, onset, 1)).toBe(0)
    expect(onsetRipple(onset + ONSET_RIPPLE_MS, onset, 1)).toBeCloseTo(1, 5)
    expect(onsetRipple(onset + ONSET_RIPPLE_MS / 2, onset, 0.5)).toBeCloseTo(1, 5)
    expect(onsetRipple(onset + ONSET_RIPPLE_MS + ONSET_PULSE_MS, onset, 1)).toBe(0)
  })
})

describe('onset flash cooldown', () => {
  it('waits at least 334 ms between brightness crests', () => {
    const gate = createOnsetGate()
    stepOnsetGate(gate, 0, 5000, false)
    stepOnsetGate(gate, 333, 5333, false)
    expect(gate.spikedAt).toBe(5000)
    expect(gate.holding).toBe(true)
    stepOnsetGate(gate, 334, 5334, false)
    expect(gate.spikedAt).toBe(5334)
    expect(gate.holding).toBe(false)
    expect(ONSET_FLASH_COOLDOWN_MS).toBeGreaterThanOrEqual(334)
  })

  it('does not crest more than three times in any second of a rapid train', () => {
    const gate = createOnsetGate()
    const spikes: number[] = []
    let prev = 0
    let last = 0
    for (let t = 0; t <= 5000; t += 5) {
      if (t % 25 === 0) last = 10000 + t
      stepOnsetGate(gate, t, last, false)
      if (gate.spikedAt !== prev) {
        spikes.push(gate.spikedAt)
        prev = gate.spikedAt
      }
    }
    expect(spikes.length).toBeGreaterThan(3)
    for (let i = 1; i < spikes.length; i++) {
      expect(spikes[i]! - spikes[i - 1]!).toBeGreaterThanOrEqual(ONSET_FLASH_COOLDOWN_MS)
    }
    for (const start of spikes) {
      const inWindow = spikes.filter((s) => s >= start && s < start + 1000).length
      expect(inWindow).toBeLessThanOrEqual(3)
    }
  })

  it('holds a steady light instead of retriggering, and the breath does not arm a crest', () => {
    const gate = createOnsetGate()
    stepOnsetGate(gate, 0, 2000, false)
    stepOnsetGate(gate, 80, 2080, false)
    expect(gate.holding).toBe(true)
    expect(gate.spikedAt).toBe(2000)
    const mid = 2120
    expect(onsetRipple(mid, 2080, 0)).toBeGreaterThan(0.5)
    expect(gate.spikedAt).toBe(2000)
    const tail = onsetBrightness(gate, onsetRipple(mid, gate.spikedAt, 0), mid, false)
    expect(tail).toBeLessThan(ONSET_SPIKE_LIGHT)
    const settled = 2000 + ONSET_RIPPLE_MS + ONSET_PULSE_MS + 30
    const held = onsetBrightness(gate, onsetRipple(settled, gate.spikedAt, 0), settled, false)
    const far = onsetBrightness(gate, onsetRipple(settled, gate.spikedAt, 1), settled, false)
    expect(held).toBe(ONSET_HOLD_LIGHT)
    expect(far).toBe(held)
    expect(held).toBeLessThan(ONSET_SPIKE_LIGHT)

    const idle = createOnsetGate()
    for (let now = 0; now <= BREATH_PERIOD_MS * 3; now += 16) {
      stepOnsetGate(idle, now, 0, false)
      breathGain(now, 1, false)
    }
    expect(idle.spikedAt).toBe(0)
    expect(idle.holding).toBe(false)
  })

  it('still rolls brightness left to right on an allowed beat', () => {
    const gate = createOnsetGate()
    stepOnsetGate(gate, 2000, 2000, false)
    const left = onsetBrightness(gate, onsetRipple(2000, gate.spikedAt, 0), 2000, false)
    const right = onsetBrightness(gate, onsetRipple(2000, gate.spikedAt, 1), 2000, false)
    expect(left).toBe(ONSET_SPIKE_LIGHT)
    expect(right).toBe(0)
    const later = onsetBrightness(
      gate,
      onsetRipple(2000 + ONSET_RIPPLE_MS, gate.spikedAt, 1),
      2000 + ONSET_RIPPLE_MS,
      false,
    )
    expect(later).toBe(ONSET_SPIKE_LIGHT)
    stepOnsetGate(gate, 2030, 2030, false)
    expect(gate.spikedAt).toBe(2000)
  })

  it('drops the flash under reduced motion and keeps pitch-class glow flat', () => {
    const gate = createOnsetGate()
    stepOnsetGate(gate, 100, 100, false)
    stepOnsetGate(gate, 200, 200, true)
    expect(gate.spikedAt).toBe(100)
    expect(gate.holding).toBe(false)
    expect(onsetBrightness(gate, 1, 200, true)).toBe(0)
    expect(haloBrightness(0.55, 250, 1, ONSET_SPIKE_LIGHT, true)).toBeCloseTo(0.55, 5)
    const loud = haloBrightness(0.5, 250, 1, 0, false)
    const quiet = haloBrightness(0.5, 250, 0.1, 0, false)
    expect(loud - 0.5).toBeGreaterThan(quiet - 0.5)
  })
})

describe('bloom size', () => {
  it('adds only a little height on a beat', () => {
    const calm = bloomDrawHeight(0.5, 1, 0, 0, 0)
    const hit = bloomDrawHeight(0.5, 1, 0, 0, 1.5)
    expect(hit).toBeGreaterThan(calm)
    expect(hit / calm).toBeLessThan(1.06)
  })
})
