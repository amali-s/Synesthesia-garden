/**
 * Loudness drives how far stems lean. The clock stays the phase.
 * A beat is a wave of halo light, and that wave may crest at most
 * three times a second. The slow breath is not an onset and does not
 * touch the flash cooldown.
 */

export const SWAY_QUIET = 0.34
export const SWAY_LOUD = 1

/** One slow halo cycle. One crest a second, under the flash cap by being slow. */
export const BREATH_PERIOD_MS = 1000
/** Full loudness swings the halo by this fraction of its pitch-class level. */
export const BREATH_DEPTH = 0.42

/** Delay from the left edge of the bed to the right. */
export const ONSET_RIPPLE_MS = 140
/** How long one allowed crest stays lit after it arrives. */
export const ONSET_PULSE_MS = 200
/** WCAG: no more than three brightness crests in any one second. */
export const ONSET_FLASH_COOLDOWN_MS = 334
/** Crest of an allowed wave, before it decays. */
export const ONSET_SPIKE_LIGHT = 0.84
/** Flat light while faster hits are not allowed to crest again. */
export const ONSET_HOLD_LIGHT = 0.46

export function swayAmplitude(loudnessT: number): number {
  const t = clamp01(loudnessT)
  return SWAY_QUIET + (SWAY_LOUD - SWAY_QUIET) * t
}

/** Clock phase plus the small gust. Loudness does not enter here. */
export function swayAngle(now: number, phase: number): number {
  const breeze = now / 980 + phase
  const gust = Math.sin(now / 340 + phase * 1.7) * 0.35
  return breeze + gust
}

/** Signed lean. Quiet is a small sway. Reduced motion is still. */
export function swayDisplacement(
  now: number,
  phase: number,
  loudnessT: number,
  reducedMotion = false,
): number {
  if (reducedMotion) return 0
  return Math.sin(swayAngle(now, phase)) * swayAmplitude(loudnessT)
}

/** Same clock as {@link swayDisplacement}, with the cross-breeze the 3D lean uses. */
export function swayPair(
  now: number,
  phase: number,
  loudnessT: number,
  reducedMotion = false,
): { lean: number; cross: number } {
  if (reducedMotion) return { lean: 0, cross: 0 }
  const angle = swayAngle(now, phase)
  const amp = swayAmplitude(loudnessT)
  return {
    lean: Math.sin(angle) * amp,
    cross: Math.cos(angle * 0.65) * amp,
  }
}

/**
 * 1 when motion is reduced or the room is silent.
 * Louder audio deepens the swing around 1. One cycle per {@link BREATH_PERIOD_MS}.
 */
export function breathGain(now: number, loudnessT: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1
  const depth = BREATH_DEPTH * clamp01(loudnessT)
  const wave = Math.sin((Math.PI * 2 * now) / BREATH_PERIOD_MS)
  return 1 + depth * wave
}

/**
 * 0–1 crest delayed by `across` (0 at the left of the bed, 1 at the right).
 * `lastOnset` is the onset allowed to crest, not every raw hit.
 */
export function onsetRipple(now: number, lastOnset: number, across: number): number {
  if (!(lastOnset > 0)) return 0
  const span = clamp01(across)
  const local = now - lastOnset - span * ONSET_RIPPLE_MS
  if (local < 0) return 0
  return Math.max(0, 1 - local / ONSET_PULSE_MS)
}

export type OnsetGate = {
  /** Timestamp of the last onset allowed to crest. 0 if none. */
  spikedAt: number
  /** Last raw onset timestamp observed. */
  seenOnset: number
  /** True while hits are arriving inside the cooldown. */
  holding: boolean
}

export function createOnsetGate(): OnsetGate {
  return { spikedAt: 0, seenOnset: 0, holding: false }
}

/**
 * Arm a brightness crest, or hold if the last crest was too recent.
 * Call this with the garden onset only. The breath must not call it.
 */
export function stepOnsetGate(
  gate: OnsetGate,
  now: number,
  lastOnset: number,
  reducedMotion: boolean,
): void {
  if (reducedMotion) {
    gate.holding = false
    if (lastOnset > 0) gate.seenOnset = lastOnset
    return
  }
  if (!(lastOnset > 0)) {
    gate.holding = false
    return
  }
  if (lastOnset !== gate.seenOnset) {
    gate.seenOnset = lastOnset
    const ready = !(gate.spikedAt > 0) || lastOnset - gate.spikedAt >= ONSET_FLASH_COOLDOWN_MS
    if (ready) {
      gate.spikedAt = lastOnset
      gate.holding = false
    } else {
      gate.holding = true
    }
    return
  }
  if (gate.holding && now - gate.seenOnset > ONSET_PULSE_MS + ONSET_RIPPLE_MS) {
    gate.holding = false
  }
}

/**
 * Halo light from the beat. The in-flight wave keeps its delay across the bed.
 * Once that wave has crossed, a fast train holds {@link ONSET_HOLD_LIGHT}
 * instead of cresting again.
 */
export function onsetBrightness(
  gate: OnsetGate,
  ripple: number,
  now: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return 0
  const waveDone =
    gate.spikedAt > 0 && now - gate.spikedAt >= ONSET_RIPPLE_MS + ONSET_PULSE_MS
  if (gate.holding && waveDone) return ONSET_HOLD_LIGHT
  return clamp01(ripple) * ONSET_SPIKE_LIGHT
}

/**
 * Pitch-class glow, times the slow breath, plus the onset wave.
 * Reduced motion keeps the pitch-class level and drops breath and flash.
 */
export function haloBrightness(
  pitchGlow: number,
  now: number,
  loudnessT: number,
  onsetLight: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return clamp01(pitchGlow)
  const breathed = clamp01(pitchGlow) * breathGain(now, loudnessT, false)
  return clamp01(breathed + Math.max(0, onsetLight))
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}
