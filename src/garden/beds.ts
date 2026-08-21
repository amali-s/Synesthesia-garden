/** Four equal raised patches in a 2×2 grid (logical pixels). */

export const GRID_PAD = 20
export const GRID_GAP = 16
export const PATCH_W = 132
export const PATCH_H = 72
export const TIMBER = 5
export const LIP = 4

export type BedId = 'bl' | 'br' | 'tl' | 'tr'

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

function patch(col: 0 | 1, row: 0 | 1): { x: number; y: number } {
  return {
    x: GRID_PAD + col * (PATCH_W + GRID_GAP),
    y: GRID_PAD + row * (PATCH_H + GRID_GAP),
  }
}

const tl = patch(0, 0)
const tr = patch(1, 0)
const bl = patch(0, 1)
const br = patch(1, 1)

export const GARDEN_BEDS: GardenBed[] = [
  {
    id: 'tl',
    pitch0: 0.5,
    pitch1: 0.75,
    x: tl.x,
    y: tl.y,
    w: PATCH_W,
    h: PATCH_H,
    timber: TIMBER,
    depth: LIP,
  },
  {
    id: 'tr',
    pitch0: 0.75,
    pitch1: 1.01,
    x: tr.x,
    y: tr.y,
    w: PATCH_W,
    h: PATCH_H,
    timber: TIMBER,
    depth: LIP,
  },
  {
    id: 'bl',
    pitch0: 0,
    pitch1: 0.25,
    x: bl.x,
    y: bl.y,
    w: PATCH_W,
    h: PATCH_H,
    timber: TIMBER,
    depth: LIP,
  },
  {
    id: 'br',
    pitch0: 0.25,
    pitch1: 0.5,
    x: br.x,
    y: br.y,
    w: PATCH_W,
    h: PATCH_H,
    timber: TIMBER,
    depth: LIP,
  },
]

export function bedFromPitch(pitchT: number): GardenBed {
  const t = Math.min(1, Math.max(0, pitchT))
  return GARDEN_BEDS.find((b) => t >= b.pitch0 && t < b.pitch1) ?? GARDEN_BEDS[0]!
}

export function bedById(id: BedId): GardenBed {
  return GARDEN_BEDS.find((b) => b.id === id) ?? GARDEN_BEDS[2]!
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
