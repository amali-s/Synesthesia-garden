import { SKY_LISTEN_MS } from '../palette'
import type { FlowerPlant } from '../world'

/** Shared pitch ring, meters from the seat. Far enough to surround, close enough to sit among. */
export const RING_RADIUS = 5

/** Quiet / loud stem lengths (meters). Frozen from `loudnessT`; glow does not change height. */
export const STEM_HEIGHT_QUIET = 0.75
export const STEM_HEIGHT_LOUD = 2.7

const JITTER_MIN = 0.15
const JITTER_MAX = 0.4
const JITTER_TANGENT = 0.12

export type WorldPose = {
  x: number
  y: number
  z: number
  stemHeight: number
  yaw: number
}

export type SunPose = {
  x: number
  y: number
  z: number
  intensity: number
}

/**
 * Yaw on the seated ring. Lowest pitch is left (−X); pitch rises to the right,
 * then behind, back to the left.
 *
 * `yawDeg = -90 + pitchT * 360`, converted to radians for a Y-up, camera-forward −Z world.
 */
export function yawFromPitchT(pitchT: number): number {
  return ((-90 + clamp01(pitchT) * 360) * Math.PI) / 180
}

/** Point on the ring (no jitter). pitchT 0 → left, 0.25 → ahead, 0.5 → right, 0.75 → behind. */
export function xzOnRing(pitchT: number, radius = RING_RADIUS): { x: number; z: number } {
  const yaw = yawFromPitchT(pitchT)
  return {
    x: Math.sin(yaw) * radius,
    z: -Math.cos(yaw) * radius,
  }
}

/** Stem length from frozen loudness. Quiet ~0.75 m, loud ~2.7 m. */
export function stemHeightFromLoudness(loudnessT: number): number {
  const t = clamp01(loudnessT)
  return STEM_HEIGHT_QUIET + t * (STEM_HEIGHT_LOUD - STEM_HEIGHT_QUIET)
}

/**
 * Stable offset so neighbors do not share a point. Radial-first so nearby notes
 * stay beside each other on the circle. Seeded from hz + born — never `Math.random()`.
 */
export function ringJitter(hz: number, born: number): { radial: number; tangent: number } {
  const u = hash01(hz, born)
  const v = hash01(born, hz * 1.6180339887)
  const mag = JITTER_MIN + u * (JITTER_MAX - JITTER_MIN)
  const radial = (v < 0.5 ? -1 : 1) * mag
  const tangent = (hash01(hz * 3, born * 7) - 0.5) * 2 * JITTER_TANGENT
  return { radial, tangent }
}

/**
 * Flower pose in the 3D garden. Ignores `bedId` and soil `x,y`.
 * Base sits on the ground (`y = 0`). Wilted flowers keep a pose until removed.
 */
export function plantToWorld(plant: FlowerPlant): WorldPose {
  const yaw = yawFromPitchT(plant.pitchT)
  const { x: cx, z: cz } = xzOnRing(plant.pitchT)
  const jit = ringJitter(plant.hz, plant.born)
  const rx = Math.sin(yaw)
  const rz = -Math.cos(yaw)
  const tx = Math.cos(yaw)
  const tz = Math.sin(yaw)
  return {
    x: cx + rx * jit.radial + tx * jit.tangent,
    y: 0,
    z: cz + rz * jit.radial + tz * jit.tangent,
    stemHeight: stemHeightFromLoudness(plant.loudnessT),
    yaw,
  }
}

/**
 * Sun in a Y-up world, matching `hourShadowOffsetForListenMs`:
 * dawn in the east (+X, shadow west), noon high and slightly ahead (−Z),
 * dusk in the west (−X, shadow east).
 */
export function sunPoseForListenMs(listenMs: number): SunPose {
  const hourT = Math.min(1, Math.max(0, listenMs / SKY_LISTEN_MS))
  const sun = hourT * Math.PI
  const elev = Math.sin(sun)
  const reach = 12 * (1.2 - elev * 0.35)
  return {
    x: Math.cos(sun) * reach,
    y: 2.2 + elev * 16,
    z: -Math.sin(sun) * reach,
    intensity: 0.85 + elev * 1.05,
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** Deterministic 0–1 from numeric seeds (hz, born). */
function hash01(a: number, b: number): number {
  let h = 2166136261 >>> 0
  h = mixHash(h, a)
  h = mixHash(h, b)
  return h / 4294967296
}

function mixHash(h: number, n: number): number {
  const k = Math.floor(n * 1000) | 0
  h ^= (k + 0x9e3779b9) >>> 0
  return Math.imul(h, 16777619) >>> 0
}
