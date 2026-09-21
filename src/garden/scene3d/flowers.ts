import { BufferGeometry, Float32BufferAttribute } from 'three'
import { PASTEL } from '../palette'
import type { FlowerKind } from '../sprites'

export const STEM_RADIUS = 0.07
export const STEM_GEO_HEIGHT = 1

/** Decorative gravel-disc blades — not the 2D soil-cell grass plants. */
export const GRASS_COUNT = 340
export const GRASS_SEAT_CLEAR = 2.42
export const GRASS_DISC_RADIUS = 16.4

type Role = 'lite' | 'mid' | 'deep' | 'center'

/** Relative albedo mixed with `instanceColor` (mid paint). */
const ROLE_RGB: Record<Role, [number, number, number]> = {
  lite: [1.22, 1.16, 1.1],
  mid: [1, 0.97, 0.98],
  deep: [0.5, 0.4, 0.46],
  center: [1.2, 0.9, 0.38],
}

/** Cube size in local units, before `toGeometry(1.85)`. */
export const VOXEL = 0.05

export type GrassPose = {
  x: number
  z: number
  yaw: number
  scale: number
}

export function createKindGeometry(kind: FlowerKind): BufferGeometry {
  const b = new MeshBuilder()
  switch (kind) {
    case 'daisy':
      buildDaisy(b)
      break
    case 'tulip':
      buildTulip(b)
      break
    case 'bell':
      buildBell(b)
      break
    case 'rose':
      buildRose(b)
      break
    case 'star':
      buildStar(b)
      break
    case 'poppy':
      buildPoppy(b)
      break
    case 'orchid':
      buildOrchid(b)
      break
  }
  return b.toGeometry(1.85)
}

/** Unit square prism centered on Y, half-width `STEM_RADIUS`, height `STEM_GEO_HEIGHT`. */
export function createStemGeometry(): BufferGeometry {
  const b = new MeshBuilder()
  const w = STEM_RADIUS * 2
  const band = STEM_GEO_HEIGHT / 2
  b.addPrism(0, -band / 2, 0, w, band, w, hexRgb(PASTEL.stemDark))
  b.addPrism(0, band / 2, 0, w, band, w, hexRgb(PASTEL.stem))
  return b.toGeometry()
}

export function createGrassBladeGeometry(): BufferGeometry {
  const b = new MeshBuilder()
  const h = 0.22
  const w = 0.05
  const d = 0.018
  const band = h / 2
  b.addPrism(0, band / 2, 0, w, band, d, hexRgb(PASTEL.grassDark))
  b.addPrism(0, band + band / 2, 0, w, band, d, hexRgb(PASTEL.grassLight))
  return b.toGeometry()
}

/** Stable pose on the gravel disc, outside the stone seat. */
export function grassBladePose(index: number): GrassPose {
  const u = hash01(index, 19)
  const v = hash01(index, 47)
  const minR = GRASS_SEAT_CLEAR
  const maxR = GRASS_DISC_RADIUS
  const r = Math.sqrt(u * (maxR * maxR - minR * minR) + minR * minR)
  const yaw = v * Math.PI * 2
  return {
    x: Math.cos(yaw) * r,
    z: Math.sin(yaw) * r,
    yaw: hash01(index, 91) * Math.PI * 2,
    scale: 0.7 + hash01(index, 3) * 0.85,
  }
}

function buildDaisy(b: MeshBuilder): void {
  // Two-layer yellow heart at the stem tip.
  put(b, -1, 0, -1, 2, 1, 2, 'center')
  put(b, -1, 1, -1, 2, 1, 2, 'center')
  // Eight axis-aligned petal blocks: four cardinals, four corner nubs.
  put(b, -1, 1, 1, 2, 1, 2, 'lite')
  put(b, 1, 1, -1, 2, 1, 2, 'lite')
  put(b, -1, 1, -3, 2, 1, 2, 'lite')
  put(b, -3, 1, -1, 2, 1, 2, 'lite')
  put(b, 1, 1, 1, 1, 1, 1, 'mid')
  put(b, 1, 1, -2, 1, 1, 1, 'mid')
  put(b, -2, 1, -2, 1, 1, 1, 'mid')
  put(b, -2, 1, 1, 1, 1, 1, 'mid')
}

function buildTulip(b: MeshBuilder): void {
  put(b, -1, 0, -1, 2, 1, 2, 'deep')
  roundLayer(b, 1, 1, 'mid')
  roundLayer(b, 2, 2, 'mid')
  roundLayer(b, 3, 2, 'mid')
  put(b, -1, 2, -1, 2, 2, 2, 'center')
  roundLayer(b, 4, 2, 'lite')
  roundLayer(b, 5, 1, 'lite')
  put(b, 0, 6, 0, 1, 1, 1, 'lite')
}

function buildBell(b: MeshBuilder): void {
  // Hangs from the stem tip; opening faces the soil.
  put(b, -1, -1, -1, 2, 1, 2, 'deep')
  roundLayer(b, -2, 1, 'mid')
  roundLayer(b, -3, 2, 'mid')
  roundLayer(b, -4, 2, 'mid')
  put(b, -1, -3, -1, 2, 1, 2, 'deep')
  put(b, 0, -3, 0, 1, 1, 1, 'center')
  put(b, -3, -5, -2, 1, 1, 4, 'lite')
  put(b, 2, -5, -2, 1, 1, 4, 'lite')
  put(b, -2, -5, -3, 4, 1, 1, 'lite')
  put(b, -2, -5, 2, 4, 1, 1, 'lite')
  put(b, -3, -5, -3, 1, 1, 1, 'mid')
  put(b, 2, -5, -3, 1, 1, 1, 'mid')
  put(b, -3, -5, 2, 1, 1, 1, 'mid')
  put(b, 2, -5, 2, 1, 1, 1, 'mid')
}

function buildRose(b: MeshBuilder): void {
  put(b, -1, 0, -1, 2, 1, 2, 'deep')
  // Layer 0 — cardinal petals.
  put(b, -1, 1, 1, 2, 1, 2, 'deep')
  put(b, 1, 1, -1, 2, 1, 2, 'deep')
  put(b, -1, 1, -3, 2, 1, 2, 'deep')
  put(b, -3, 1, -1, 2, 1, 2, 'deep')
  // Layer 1 — diagonal offset (spiral step).
  put(b, 0, 2, 0, 2, 1, 2, 'mid')
  put(b, 0, 2, -2, 2, 1, 2, 'mid')
  put(b, -2, 2, 0, 2, 1, 2, 'mid')
  put(b, -2, 2, -2, 2, 1, 2, 'mid')
  put(b, -1, 2, -1, 2, 1, 2, 'center')
  // Layer 2 — smaller cardinals, rotated a cell.
  put(b, 0, 3, -1, 2, 1, 2, 'mid')
  put(b, -1, 3, 0, 2, 1, 1, 'lite')
  put(b, -2, 3, -1, 2, 1, 2, 'lite')
  put(b, -1, 3, -2, 1, 1, 2, 'mid')
  // Tight inner swirl.
  put(b, -1, 4, 0, 2, 1, 1, 'lite')
  put(b, 0, 4, -1, 1, 1, 2, 'lite')
  put(b, 0, 5, 0, 1, 1, 1, 'lite')
}

function buildStar(b: MeshBuilder): void {
  put(b, -1, 0, -1, 2, 1, 2, 'center')
  put(b, -1, 1, -1, 2, 1, 2, 'center')
  put(b, 0, 2, 0, 1, 1, 1, 'deep')
  // Long thin arms, tapered at the tips.
  put(b, -1, 1, 1, 2, 1, 2, 'lite')
  put(b, 0, 1, 3, 1, 1, 2, 'lite')
  put(b, -1, 1, -3, 2, 1, 2, 'lite')
  put(b, 0, 1, -5, 1, 1, 2, 'lite')
  put(b, 1, 1, -1, 2, 1, 2, 'mid')
  put(b, 3, 1, 0, 2, 1, 1, 'mid')
  put(b, -3, 1, -1, 2, 1, 2, 'mid')
  put(b, -5, 1, 0, 2, 1, 1, 'mid')
  put(b, 1, 1, 1, 1, 1, 1, 'mid')
  put(b, 1, 1, -2, 1, 1, 1, 'lite')
  put(b, -2, 1, 1, 1, 1, 1, 'lite')
  put(b, -2, 1, -2, 1, 1, 1, 'mid')
}

function buildPoppy(b: MeshBuilder): void {
  put(b, -1, 0, -1, 2, 1, 2, 'deep')
  put(b, -2, 1, -2, 4, 1, 4, 'deep')
  put(b, -1, 2, -1, 2, 1, 2, 'deep')
  // Four wide petals plus a fifth ruffle.
  put(b, -2, 0, 1, 4, 2, 3, 'mid')
  put(b, 1, 0, -2, 3, 2, 4, 'lite')
  put(b, -2, 0, -4, 4, 2, 3, 'mid')
  put(b, -4, 0, -2, 3, 2, 4, 'lite')
  put(b, 1, 1, 1, 2, 2, 2, 'lite')
}

function buildOrchid(b: MeshBuilder): void {
  put(b, 0, 0, 0, 1, 4, 1, 'center')
  put(b, 0, 1, 1, 1, 1, 1, 'deep')
  // Broad lip, slightly off-center and below the stem tip.
  put(b, -1, -1, 1, 4, 1, 3, 'mid')
  put(b, 0, 0, 2, 3, 1, 2, 'lite')
  // Left wing high and small; right wing lower and wider.
  put(b, -3, 1, -1, 2, 2, 2, 'lite')
  put(b, 1, 0, -2, 3, 2, 2, 'mid')
  put(b, -1, 3, -2, 2, 2, 1, 'lite')
}

/** Min-corner voxel cell → snapped box. Origin stays at the stem tip. */
function put(
  b: MeshBuilder,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  role: Role,
): void {
  b.addBox(
    (x + sx / 2) * VOXEL,
    (y + sy / 2) * VOXEL,
    (z + sz / 2) * VOXEL,
    sx * VOXEL,
    sy * VOXEL,
    sz * VOXEL,
    role,
  )
}

/** s×s slice with corners knocked off when s > 2 (plus-shaped disc). */
function roundLayer(b: MeshBuilder, y: number, r: number, role: Role): void {
  const s = r * 2
  const x = -r
  const z = -r
  if (s <= 2) {
    put(b, x, y, z, s, 1, s, role)
    return
  }
  put(b, x + 1, y, z, s - 2, 1, s, role)
  put(b, x, y, z + 1, s, 1, s - 2, role)
}

class MeshBuilder {
  private readonly positions: number[] = []
  private readonly colors: number[] = []

  tri(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    ca: [number, number, number],
    cb: [number, number, number],
    cc: [number, number, number],
  ): void {
    this.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
    this.colors.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2])
  }

  /** 12 triangles, unique verts per face, top lighter / bottom darker. */
  addBox(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    role: Role,
  ): void {
    const x0 = snap(cx - sx / 2)
    const y0 = snap(cy - sy / 2)
    const z0 = snap(cz - sz / 2)
    let x1 = snap(cx + sx / 2)
    let y1 = snap(cy + sy / 2)
    let z1 = snap(cz + sz / 2)
    if (x1 <= x0) x1 = x0 + VOXEL
    if (y1 <= y0) y1 = y0 + VOXEL
    if (z1 <= z0) z1 = z0 + VOXEL
    this.addPrism(
      (x0 + x1) / 2,
      (y0 + y1) / 2,
      (z0 + z1) / 2,
      x1 - x0,
      y1 - y0,
      z1 - z0,
      ROLE_RGB[role],
    )
  }

  /** Closed box, unique verts per face. No voxel snap — stems/grass keep world size. */
  addPrism(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    rgb: readonly [number, number, number],
  ): void {
    const x0 = cx - sx / 2
    const y0 = cy - sy / 2
    const z0 = cz - sz / 2
    const x1 = cx + sx / 2
    const y1 = cy + sy / 2
    const z1 = cz + sz / 2
    this.face(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, shade(rgb, 1))
    this.face(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, shade(rgb, 0.88))
    this.face(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, shade(rgb, 1.06))
    this.face(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, shade(rgb, 0.84))
    this.face(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, shade(rgb, 1.18))
    this.face(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, shade(rgb, 0.72))
  }

  private face(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    dx: number,
    dy: number,
    dz: number,
    rgb: [number, number, number],
  ): void {
    this.tri([ax, ay, az], [bx, by, bz], [cx, cy, cz], rgb, rgb, rgb)
    this.tri([ax, ay, az], [cx, cy, cz], [dx, dy, dz], rgb, rgb, rgb)
  }

  toGeometry(scale = 1): BufferGeometry {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(this.positions, 3))
    geo.setAttribute('color', new Float32BufferAttribute(this.colors, 3))
    if (scale !== 1) geo.scale(scale, scale, scale)
    geo.computeVertexNormals()
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    return geo
  }
}

function snap(n: number): number {
  return Math.round(n / VOXEL) * VOXEL
}

function shade(
  rgb: readonly [number, number, number],
  m: number,
): [number, number, number] {
  return [rgb[0] * m, rgb[1] * m, rgb[2] * m]
}

function hexRgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '')
  return [
    parseInt(n.slice(0, 2), 16) / 255,
    parseInt(n.slice(2, 4), 16) / 255,
    parseInt(n.slice(4, 6), 16) / 255,
  ]
}

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
