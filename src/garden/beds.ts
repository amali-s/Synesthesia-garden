/** Eight raised patches. Portrait glass is 2×4; landscape is 4×2. */

export let GRID_COLS = 4
export let GRID_ROWS = 2
/** Left inset; hour-cast planter shadow is ≤2px. */
export const GRID_PAD_X = 8
/**
 * Gravel walk above the back beds. Tall enough for the mailbox to sit
 * entirely on courtyard, not on timber. Grows on portrait when the
 * mailbox is drawn larger.
 */
export const GRID_PAD_TOP_BASE = 32
export let GRID_PAD_TOP = GRID_PAD_TOP_BASE

export function setGridPadTop(h: number): void {
  GRID_PAD_TOP = Math.max(GRID_PAD_TOP_BASE, Math.round(h))
}
/** Gravel walk below the front beds. */
export const GRID_PAD_BOTTOM = 12
/** Gutter between patches (shadow ≤2px, so they never kiss). */
export const GRID_GAP = 8
/**
 * Floor planter size (sprites stay at this zoom). Leftover courtyard
 * grows the dirt so the block fills the glass; share-bar height
 * jitters do not relayout.
 */
export const MIN_PATCH_W = 70
export const MIN_PATCH_H = 74
export let PATCH_W = MIN_PATCH_W
export let PATCH_H = MIN_PATCH_H
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
    x: GRID_PAD_X + col * (PATCH_W + GRID_GAP),
    y: GRID_PAD_TOP + row * (PATCH_H + GRID_GAP),
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

export type GridShape = { cols: number; rows: number }

/** Width of a 4×2 block including side gravel. Below this, stack 2×4. */
export function fourWideMin(): number {
  return GRID_PAD_X * 2 + 4 * MIN_PATCH_W + 3 * GRID_GAP
}

/** Portrait (phones) is 2×4; landscape stays 4×2 unless four-wide cannot fit. */
export function gridShapeForView(viewW: number, viewH: number = viewW): GridShape {
  if (viewH > viewW) return { cols: 2, rows: 4 }
  return viewW < fourWideMin() ? { cols: 2, rows: 4 } : { cols: 4, rows: 2 }
}

export function minLogicalSize(cols: number, rows: number): { w: number; h: number } {
  return {
    w: GRID_PAD_X * 2 + cols * MIN_PATCH_W + (cols - 1) * GRID_GAP,
    h: GRID_PAD_TOP + GRID_PAD_BOTTOM + rows * MIN_PATCH_H + (rows - 1) * GRID_GAP,
  }
}

/**
 * Grow the eight patches to fill the courtyard (mailbox walk stays).
 * Pitch bands stay on bed ids; dirt never shrinks below MIN_PATCH_*.
 */
export function layoutCourtyard(
  logicalW: number,
  logicalH: number,
  cols: number,
  rows: number,
): { padX: number; padTop: number } {
  GRID_COLS = cols
  GRID_ROWS = rows
  PATCH_W = Math.max(
    MIN_PATCH_W,
    Math.floor((logicalW - GRID_PAD_X * 2 - (cols - 1) * GRID_GAP) / cols),
  )
  PATCH_H = Math.max(
    MIN_PATCH_H,
    Math.floor(
      (logicalH - GRID_PAD_TOP - GRID_PAD_BOTTOM - (rows - 1) * GRID_GAP) / rows,
    ),
  )
  const usedW = GRID_PAD_X * 2 + cols * PATCH_W + (cols - 1) * GRID_GAP
  const padX = GRID_PAD_X + Math.floor((logicalW - usedW) / 2)
  const padTop = GRID_PAD_TOP
  const ids =
    cols === 4
      ? ([
          ['b0', 'b1', 'b2', 'b3'],
          ['f0', 'f1', 'f2', 'f3'],
        ] as const)
      : ([
          ['b2', 'b3'],
          ['b0', 'b1'],
          ['f2', 'f3'],
          ['f0', 'f1'],
        ] as const)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const id = ids[row]![col]!
      const bed = GARDEN_BEDS.find((b) => b.id === id)!
      bed.x = padX + col * (PATCH_W + GRID_GAP)
      bed.y = padTop + row * (PATCH_H + GRID_GAP)
      bed.w = PATCH_W
      bed.h = PATCH_H
    }
  }
  return { padX, padTop }
}

/** Compass cells back-to-front, left-to-right (matches the planted grid). */
export function compassBedIds(): BedId[] {
  return [...GARDEN_BEDS]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((b) => b.id)
}

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

/** True when a point is courtyard gravel (including off-canvas), not timber/soil. */
export function isGravel(x: number, y: number): boolean {
  for (const bed of GARDEN_BEDS) {
    if (x >= bed.x && x < bed.x + bed.w && y >= bed.y && y < bed.y + bed.h) return false
  }
  return true
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

export type SoilGrid = {
  cols: number
  rows: number
  x0: number
  y0: number
  stepX: number
  stepY: number
}

/** Even cell grid that spans the whole soil box (no leftover strip on the right/bottom). */
export function soilGrid(bed: GardenBed, cellW: number, cellH: number): SoilGrid {
  const r = soilRect(bed)
  const soilW = Math.max(1, r.x1 - r.x0)
  const soilH = Math.max(1, r.y1 - r.y0)
  const cols = Math.max(1, Math.round(soilW / cellW))
  const rows = Math.max(1, Math.round(soilH / cellH))
  return { cols, rows, x0: r.x0, y0: r.y0, stepX: soilW / cols, stepY: soilH / rows }
}

export function gridCol(g: SoilGrid, x: number): number {
  return Math.min(g.cols - 1, Math.max(0, Math.floor((x - g.x0) / g.stepX)))
}

export function gridRow(g: SoilGrid, y: number): number {
  return Math.min(g.rows - 1, Math.max(0, Math.floor((y - g.y0) / g.stepY)))
}

/**
 * Stem sits in the lower-middle of the cell so the bloom (drawn upward)
 * stays on the soil instead of in the timber above the patch.
 */
export function gridStem(g: SoilGrid, col: number, row: number): { x: number; y: number } {
  return {
    x: g.x0 + (col + 0.5) * g.stepX,
    y: g.y0 + (row + 0.84) * g.stepY,
  }
}

export function bedCols(bed: GardenBed, cellW: number): number {
  return soilGrid(bed, cellW, cellW).cols
}

export function bedRows(bed: GardenBed, cellH: number): number {
  return soilGrid(bed, cellH, cellH).rows
}
