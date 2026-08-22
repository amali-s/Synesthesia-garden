/** Eight raised patches in a 2×4 grid (logical 320×200). */

export const GRID_COLS = 4
export const GRID_ROWS = 2
/** Inset from canvas / vine frame; leaves room for the 2px planter drop-shadow. */
export const GRID_PAD = 8
/** Gutter between patches (shadow is 2px, so they never kiss). */
export const GRID_GAP = 8
export const PATCH_W = 70
export const PATCH_H = 88
export const TIMBER = 5
export const LIP = 4

/** Front row = lower register; back row = higher. Index 0 is leftmost. */
export type BedId = 'f0' | 'f1' | 'f2' | 'f3' | 'b0' | 'b1' | 'b2' | 'b3'

export type GardenBed = {
  id: BedId
  pitch0: number
  pitch1: number
  /** Outer patch box (timber included) */
  x: number
  y: number
  w: number
  h: number
  timber: number
  depth: number
}

function patch(col: 0 | 1 | 2 | 3, row: 0 | 1): { x: number; y: number } {
  return {
    x: GRID_PAD + col * (PATCH_W + GRID_GAP),
    y: GRID_PAD + row * (PATCH_H + GRID_GAP),
  }
}

function makeBed(
  id: BedId,
  col: 0 | 1 | 2 | 3,
  row: 0 | 1,
  pitch0: number,
  pitch1: number,
): GardenBed {
  const { x, y } = patch(col, row)
  return {
    id,
    pitch0,
    pitch1,
    x,
    y,
    w: PATCH_W,
    h: PATCH_H,
    timber: TIMBER,
    depth: LIP,
  }
}

/**
 * Pitch rises left→right within a row, then front→back to the next row.
 * Front (bottom, nearer): 0–0.5   Back (top, farther): 0.5–1
 *
 *   b0  b1  b2  b3     0.50–0.625  0.625–0.75  0.75–0.875  0.875–1
 *   f0  f1  f2  f3     0–0.125     0.125–0.25  0.25–0.375  0.375–0.5
 */
export const GARDEN_BEDS: GardenBed[] = [
  makeBed('b0', 0, 0, 0.5, 0.625),
  makeBed('b1', 1, 0, 0.625, 0.75),
  makeBed('b2', 2, 0, 0.75, 0.875),
  makeBed('b3', 3, 0, 0.875, 1.01),
  makeBed('f0', 0, 1, 0, 0.125),
  makeBed('f1', 1, 1, 0.125, 0.25),
  makeBed('f2', 2, 1, 0.25, 0.375),
  makeBed('f3', 3, 1, 0.375, 0.5),
]

export function bedFromPitch(pitchT: number): GardenBed {
  const t = Math.min(1, Math.max(0, pitchT))
  return GARDEN_BEDS.find((b) => t >= b.pitch0 && t < b.pitch1) ?? GARDEN_BEDS.find((b) => b.id === 'f0')!
}

export function bedById(id: BedId): GardenBed {
  return GARDEN_BEDS.find((b) => b.id === id) ?? GARDEN_BEDS.find((b) => b.id === 'f0')!
}

export function bedsBackToFront(): GardenBed[] {
  return [...GARDEN_BEDS].sort((a, b) => a.y - b.y || a.x - b.x)
}

export function soilRect(bed: GardenBed): {
  x0: number
  x1: number
  y0: number
  y1: number
} {
  const t = bed.timber
  return {
    x0: bed.x + t + 1,
    x1: bed.x + bed.w - t - 2,
    y0: bed.y + t + 1,
    y1: bed.y + bed.h - bed.depth - t - 1,
  }
}

export function bedCols(bed: GardenBed, cellW: number): number {
  const r = soilRect(bed)
  return Math.max(1, Math.floor((r.x1 - r.x0) / cellW))
}

export function bedRows(bed: GardenBed, cellH: number): number {
  const r = soilRect(bed)
  return Math.max(1, Math.floor((r.y1 - r.y0) / cellH))
}
