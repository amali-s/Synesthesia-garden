import { pitchClassT } from '../audio/pitch'
import { PITCH_MATCH_CENTS } from './world'

/** Sung note for this frame. Null when Play is off or the voice has released to silence. */
export type ListenLight = {
  hz: number
  /** Loudness after fast attack / slow release, 0–1. */
  loudnessT: number
  panT: number
  /** Register in the listen window (pitchNorm), not pitch class. */
  pitchT: number
}

const CENTS_PER_OCTAVE = 1200
/** Rise toward a louder note in a few frames. */
export const LOUDNESS_ATTACK_MS = 48
/** Fall slowly so a dropped detector frame does not black the garden. */
export const LOUDNESS_RELEASE_MS = 240

/**
 * Octave-wrapped distance in cents. 0 is the same pitch class (A4 and A3).
 * The short way around the circle, so the G#/A seam is a small step, not almost an octave.
 */
export function pitchClassCents(aHz: number, bHz: number): number {
  if (!(aHz > 0) || !(bHz > 0)) return Number.POSITIVE_INFINITY
  const d = Math.abs(pitchClassT(aHz) - pitchClassT(bHz))
  return Math.min(d, 1 - d) * CENTS_PER_OCTAVE
}

/** 1 when both tones share a pitch class within ~50 cents, otherwise 0. */
export function pitchClassMatch(flowerHz: number, sungHz: number): number {
  if (!(flowerHz > 0) || !(sungHz > 0)) return 0
  // Log-octave math lands a few millionths of a cent over an exact 50¢ edge.
  return pitchClassCents(flowerHz, sungHz) <= PITCH_MATCH_CENTS + 1e-3 ? 1 : 0
}

/**
 * Live glow for one flower: pitch-class match times loudness.
 * Wilted flowers stay dark. This does not record a spawn.
 */
export function glowAmount(
  flowerHz: number,
  light: ListenLight | null,
  wilted: boolean,
): number {
  if (!light || wilted) return 0
  return pitchClassMatch(flowerHz, light.hz) * clamp01(light.loudnessT)
}

/** One frame of loudness smoothing. Attack when rising, release when falling. */
export function smoothLoudness(current: number, target: number, dtMs: number): number {
  const from = clamp01(current)
  const to = clamp01(target)
  const dt = Math.max(0, dtMs)
  if (dt === 0) return from
  const tau = to >= from ? LOUDNESS_ATTACK_MS : LOUDNESS_RELEASE_MS
  const alpha = 1 - Math.exp(-dt / tau)
  return clamp01(from + (to - from) * alpha)
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}
