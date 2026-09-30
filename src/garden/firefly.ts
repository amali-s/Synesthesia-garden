import { GARDEN_BEDS, type GardenBed } from './beds'
import type { ListenLight } from './glow'
import { pitchClassIndex } from './halo'
import { emissiveGlowPair, rgbCss } from './palette'

/** Logical pixels behind the bug. Older samples fall off this ring. */
export const FIREFLY_TRAIL = 14
/** How long a trail sample stays lit. */
export const TRAIL_LIFE_MS = 360
/** Logical px/s at full smoothed loudness. Silence holds still. */
export const FIREFLY_SPEED = 240

export const POLLEN_CAP = 80
/** Living blooms dimmer than this do not shed. */
export const POLLEN_RESONANCE = 0.05
/** Expected motes per second from a bloom that is fully glowing. */
export const POLLEN_RATE = 0.7
export const POLLEN_LIFE_MS = 900
/** Logical px/s, upward (decreasing y). */
export const POLLEN_RISE = 28
/** Stem anchor → bloom head, where a mote is born. */
export const POLLEN_HEAD_LIFT = 16

/**
 * Body around the lamp. Drawn as single logical pixels — no sprite sheet.
 * Center lamp is separate so it can take the brighter core.
 */
export const FIREFLY_BODY: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
]
export const FIREFLY_LAMP: readonly [number, number] = [0, 0]

export type TrailPoint = {
  x: number
  y: number
  /** 1 fresh → 0 gone. */
  life: number
  color: string
}

export type PollenMote = {
  x: number
  y: number
  life: number
  color: string
}

export type FireflyState = {
  x: number
  y: number
  placed: boolean
  trail: TrailPoint[]
  pollen: PollenMote[]
}

export type PollenSource = {
  x: number
  y: number
  resonance: number
  living: boolean
  hz: number
}

export function createFirefly(): FireflyState {
  return { x: 0, y: 0, placed: false, trail: [], pollen: [] }
}

/** Same register test the pitch square used. Null when no bed owns this pitch. */
export function bedForRegister(pitchT: number): GardenBed | null {
  return GARDEN_BEDS.find((b) => pitchT >= b.pitch0 && pitchT < b.pitch1) ?? null
}

/**
 * Chase point. X tracks stereo inside the bed; Y sits on the lip where the square blinked.
 * A pitch outside every bed parks at the old fallback corner.
 */
export function fireflyTarget(
  pitchT: number,
  panT: number,
  logicalW: number,
): { x: number; y: number } {
  const bed = bedForRegister(pitchT)
  if (!bed) return { x: logicalW - 14, y: 14 }
  const pan = clamp01(panT)
  const inset = 10
  const span = Math.max(1, bed.w - inset * 2)
  return { x: bed.x + inset + pan * span, y: bed.y + 10 }
}

export function fireflySpeed(loudnessT: number): number {
  return clamp01(loudnessT) * FIREFLY_SPEED
}

/**
 * Emissive pair for the live pitch class when `hz` is a real note.
 * Otherwise the pitch-square hue, so a missing class still has a color.
 */
export function fireflyPaint(hz: number | null, pitchT: number): { body: string; core: string } {
  if (hz !== null && hz > 0) {
    const pair = emissiveGlowPair(pitchClassIndex(hz))
    return { body: rgbCss(pair.body), core: rgbCss(pair.core) }
  }
  const h = (350 + pitchT * 42) % 360
  const s = 28 + pitchT * 44
  const l = 68 - pitchT * 14
  return {
    body: `hsl(${h} ${s}% ${l}%)`,
    core: `hsl(${h} ${s}% ${Math.min(92, l + 18)}%)`,
  }
}

export function pollenPaint(hz: number): string | null {
  if (!(hz > 0)) return null
  return rgbCss(emissiveGlowPair(pitchClassIndex(hz)).core)
}

/**
 * Fly toward `target`. Speed is smoothed loudness.
 * Reduced motion parks on the target, drops the trail, and clears pollen.
 */
export function stepFirefly(
  state: FireflyState,
  target: { x: number; y: number },
  loudnessT: number,
  dtMs: number,
  color: string,
  reducedMotion: boolean,
): void {
  if (reducedMotion) {
    state.x = target.x
    state.y = target.y
    state.placed = true
    state.trail.length = 0
    state.pollen.length = 0
    return
  }

  ageTrail(state, dtMs)
  if (!state.placed) {
    state.x = target.x
    state.y = target.y
    state.placed = true
    return
  }

  const dt = Math.max(0, dtMs) / 1000
  const max = fireflySpeed(loudnessT) * dt
  const dx = target.x - state.x
  const dy = target.y - state.y
  const dist = Math.hypot(dx, dy)
  if (dist > 0 && max > 0) {
    const step = Math.min(dist, max)
    state.x += (dx / dist) * step
    state.y += (dy / dist) * step
    const last = state.trail[state.trail.length - 1]
    const cellX = Math.round(state.x)
    const cellY = Math.round(state.y)
    if (!last || Math.round(last.x) !== cellX || Math.round(last.y) !== cellY) {
      state.trail.push({ x: cellX, y: cellY, life: 1, color })
      if (state.trail.length > FIREFLY_TRAIL) {
        state.trail.splice(0, state.trail.length - FIREFLY_TRAIL)
      }
    }
  }
}

/** Per-source chance a glowing bloom sheds one mote this frame. */
export function pollenEmitChance(dtMs: number): number {
  const dt = Math.max(0, dtMs) / 1000
  if (dt === 0) return 0
  return 1 - Math.exp(-POLLEN_RATE * dt)
}

/**
 * One mote per source when resonance is high enough, the flower is living,
 * and `rolls[i]` falls under the emit chance. The pool never passes POLLEN_CAP.
 */
export function shedPollen(
  state: FireflyState,
  sources: readonly PollenSource[],
  dtMs: number,
  rolls: readonly number[],
  reducedMotion: boolean,
): void {
  if (reducedMotion) {
    state.pollen.length = 0
    return
  }
  const chance = pollenEmitChance(dtMs)
  if (chance <= 0) return
  for (let i = 0; i < sources.length; i++) {
    if (state.pollen.length >= POLLEN_CAP) return
    const src = sources[i]!
    if (!src.living || !(src.resonance > POLLEN_RESONANCE)) continue
    if ((rolls[i] ?? 1) >= chance) continue
    const color = pollenPaint(src.hz)
    if (!color) continue
    state.pollen.push({ x: src.x, y: src.y, life: 1, color })
  }
}

export function stepPollen(state: FireflyState, dtMs: number, reducedMotion: boolean): void {
  if (reducedMotion) {
    state.pollen.length = 0
    return
  }
  const dt = Math.max(0, dtMs) / 1000
  const rise = POLLEN_RISE * dt
  const fade = dtMs / POLLEN_LIFE_MS
  let w = 0
  for (const mote of state.pollen) {
    mote.y -= rise
    mote.life -= fade
    if (mote.life > 0) state.pollen[w++] = mote
  }
  state.pollen.length = w
}

function ageTrail(state: FireflyState, dtMs: number): void {
  const fade = Math.max(0, dtMs) / TRAIL_LIFE_MS
  if (fade === 0) return
  let w = 0
  for (const point of state.trail) {
    point.life -= fade
    if (point.life > 0) state.trail[w++] = point
  }
  state.trail.length = w
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** Hz the firefly should paint with, or null when the listen light has no note. */
export function liveHz(listen: ListenLight | null): number | null {
  if (!listen || !(listen.hz > 0)) return null
  return listen.hz
}
