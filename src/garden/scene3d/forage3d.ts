import { bedById } from '../beds'
import { FOX_ENTER, FOX_EXIT_RIGHT, FOX_SNIFF, MAILBOX_STAND } from '../critters'
import { foxStandForBed, gravelWalk, type ForageLandmark, type ForageView } from '../forage'
import { plantToWorld, RING_RADIUS } from './layout'

/** Billboard height on the ring (meters). */
export const FOX_HEIGHT_M = 0.85
export const MAILBOX_HEIGHT_M = 0.8
export const CARRY_HEIGHT_M = 0.22
export const LIFT_HEIGHT_M = 0.32

/**
 * Mailbox on the gravel disc, behind the seat (camera looks −Z, so behind is +Z).
 * Off the ~2 m stone, inside {@link RING_RADIUS}.
 */
export const MAILBOX_WORLD = { x: 0, y: 0, z: 2.6 }

/** Off / on the rim, left (−X). */
export const FOX_ENTER_WORLD = { x: -RING_RADIUS - 0.35, y: 0, z: 0.12 }

/** A few meters inward on the left (sniff-and-leave). */
export const FOX_SNIFF_WORLD = { x: -RING_RADIUS + 2.45, y: 0, z: 0.18 }

/** Beside the 3D mailbox. */
export const FOX_MAIL_WORLD = { x: -0.72, y: 0, z: 2.55 }

/** Rim right after mailing. */
export const FOX_EXIT_WORLD = { x: RING_RADIUS + 0.35, y: 0, z: 0.12 }

export type FoxWorldPose = {
  x: number
  y: number
  z: number
  facing: 1 | -1
}

export function worldForLandmark(mark: ForageLandmark): { x: number; y: number; z: number } {
  switch (mark.kind) {
    case 'enter':
      return { ...FOX_ENTER_WORLD }
    case 'sniff':
      return { ...FOX_SNIFF_WORLD }
    case 'mail':
      return { ...FOX_MAIL_WORLD }
    case 'exit':
      return { ...FOX_EXIT_WORLD }
    case 'pick': {
      const p = plantToWorld(mark.plant)
      return { x: p.x, y: 0, z: p.z }
    }
  }
}

/** 2D gravel stand that matches a semantic 3D landmark (not courtyard UV as meters). */
export function stand2d(mark: ForageLandmark): { x: number; y: number } {
  switch (mark.kind) {
    case 'enter':
      return { x: FOX_ENTER.x, y: FOX_ENTER.y }
    case 'sniff':
      return { x: FOX_SNIFF.x, y: FOX_SNIFF.y }
    case 'mail':
      return { x: MAILBOX_STAND.x, y: MAILBOX_STAND.y }
    case 'exit':
      return { x: FOX_EXIT_RIGHT.x, y: FOX_EXIT_RIGHT.y }
    case 'pick':
      return foxStandForBed(bedById(mark.plant.bedId))
  }
}

/**
 * 0–1 along the 2D gravel path between semantic stands. Used to lerp the fox
 * on the ring while {@link ForageRun} still walks courtyard pixels.
 */
export function walkProgress(
  foxX: number,
  foxY: number,
  from: ForageLandmark,
  to: ForageLandmark,
): number {
  const a = stand2d(from)
  const b = stand2d(to)
  const pts: { x: number; y: number }[] = [{ x: a.x, y: a.y }, ...gravelWalk(a.x, a.y, b.x, b.y)]
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
  }
  if (total < 0.4) return 1
  let bestD = Infinity
  let traveled = 0
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1]!
    const p1 = pts[i]!
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) continue
    const t = Math.min(1, Math.max(0, ((foxX - p0.x) * dx + (foxY - p0.y) * dy) / (len * len)))
    const px = p0.x + dx * t
    const py = p0.y + dy * t
    const d = Math.hypot(foxX - px, foxY - py)
    if (d < bestD) {
      bestD = d
      traveled = acc + t * len
    }
    acc += len
  }
  return Math.min(1, Math.max(0, traveled / total))
}

/**
 * Fox feet on the pitch ring. Walks lerp between mapped landmarks with the
 * same t as the 2D segment; pick/mail/sniff sit on the destination.
 */
export function foxWorldPose(view: ForageView): FoxWorldPose {
  const from = worldForLandmark(view.ring.from)
  const to = worldForLandmark(view.ring.to)
  const facing = facingFromDelta(from, to, view.facing)
  if (view.pose !== 'walk') return { ...to, facing }
  const t = walkProgress(view.foxX, view.foxY, view.ring.from, view.ring.to)
  return {
    x: from.x + (to.x - from.x) * t,
    y: 0,
    z: from.z + (to.z - from.z) * t,
    facing,
  }
}

function facingFromDelta(
  from: { x: number; z: number },
  to: { x: number; z: number },
  fallback: 1 | -1,
): 1 | -1 {
  const dx = to.x - from.x
  if (dx > 0.04) return 1
  if (dx < -0.04) return -1
  return fallback
}
