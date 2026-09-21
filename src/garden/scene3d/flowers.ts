import { BufferGeometry, Float32BufferAttribute } from 'three'
import { PASTEL } from '../palette'
import type { FlowerKind } from '../sprites'

export const STEM_RADIUS = 0.038
export const STEM_GEO_HEIGHT = 1

/** Decorative gravel-disc blades — not the 2D soil-cell grass plants. */
export const GRASS_COUNT = 340
export const GRASS_SEAT_CLEAR = 2.42
export const GRASS_DISC_RADIUS = 16.4

type Role = 'lite' | 'mid' | 'deep' | 'center'

/** Relative albedo mixed with `instanceColor` (mid paint). Saturated so grey light does not wash petals. */
const ROLE_RGB: Record<Role, [number, number, number]> = {
  lite: [1.12, 0.72, 0.92],
  mid: [1.02, 0.55, 0.72],
  deep: [0.7, 0.18, 0.38],
  center: [1.58, 1.28, 0.1],
}

/** Cube size in local units, before `toGeometry(1.85)`. Fine grid for rounded silhouettes. */
export const VOXEL = 0.025

const GEO_SCALE = 1.85
const TAU = Math.PI * 2

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
  return b.toGeometry(GEO_SCALE)
}

/** Bell is a hanging cup; everyone else gets stem foliage. */
export function kindHasFoliage(kind: FlowerKind): boolean {
  return kind !== 'bell'
}

/**
 * Species foliage in bloom voxel space, origin at the stem tip (no nod).
 * Bell returns a dummy cube so InstancedMesh construction stays valid.
 */
export function createLeafGeometry(kind: FlowerKind): BufferGeometry {
  const b = new MeshBuilder()
  switch (kind) {
    case 'tulip':
      addDropLeaf(b, 0.35, -1, 11, 3.1, 1)
      addDropLeaf(b, 0.35 + Math.PI * 0.92, -2, 9, 2.6, 1)
      addSepals(b, 3, 3)
      break
    case 'rose':
      addCompoundLeaf(b, 0.15, -6, 6)
      addCompoundLeaf(b, 0.15 + Math.PI, -10, 5)
      addSepals(b, 5, 4)
      break
    case 'orchid':
      addDropLeaf(b, -0.4, -3, 8, 2.8, 1)
      addDropLeaf(b, 2.4, -6, 6, 2.2, 1)
      addSepals(b, 3, 2)
      break
    case 'bell':
      b.voxel(0, -1, 0, leafRgb('deep'))
      break
    default:
      addDropLeaf(b, 0.55, -3, 5, 2.4, 1)
      addDropLeaf(b, 0.55 + Math.PI * 1.15, -6, 4, 2.0, 1)
      addSepals(b, 4, 3)
      break
  }
  return b.toGeometry(GEO_SCALE)
}

/** Voxel 2×2 column centered on Y, half-width `STEM_RADIUS`, height `STEM_GEO_HEIGHT`. */
export function createStemGeometry(): BufferGeometry {
  const b = new MeshBuilder()
  const w = STEM_RADIUS * 2
  const cell = w / 2
  const layers = 12
  const band = STEM_GEO_HEIGHT / layers
  for (let i = 0; i < layers; i++) {
    const y = -STEM_GEO_HEIGHT / 2 + band / 2 + i * band
    const rgb = satStem(hexRgb(i < layers / 2 ? PASTEL.stemDark : PASTEL.stem))
    for (const ix of [-0.5, 0.5]) {
      for (const iz of [-0.5, 0.5]) {
        b.addPrism(ix * cell, y, iz * cell, cell, band, cell, rgb)
      }
    }
  }
  return b.toGeometry()
}

export function createGrassBladeGeometry(): BufferGeometry {
  const b = new MeshBuilder()
  const h = 0.22
  const w = 0.05
  const d = 0.018
  const band = h / 2
  b.addPrism(0, band / 2, 0, w, band, d, satStem(hexRgb(PASTEL.grassDark)))
  b.addPrism(0, band + band / 2, 0, w, band, d, satStem(hexRgb(PASTEL.grassLight)))
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
  for (let i = 0; i < 10; i++) {
    addPetal(b, (i / 10) * TAU, 2, 7, 1.5, 1.25, 1.35, (t, e) =>
      t > 0.72 || e > 0.7 ? 'lite' : 'mid',
    )
  }
  addDisc(b, 2, 2.6, 'center')
  addStamens(b, 3, 1.6, 8)
}

function buildTulip(b: MeshBuilder): void {
  for (let i = 0; i < 6; i++) {
    addCupPetal(b, (i / 6) * TAU, 15, 4.2, (t) => (t > 0.78 ? 'lite' : t > 0.35 ? 'mid' : 'deep'))
  }
  cell(b, 0, 16, 0, 'lite')
}

function buildBell(b: MeshBuilder): void {
  const height = 10
  for (let y = 0; y >= -height; y--) {
    const t = -y / height
    const r = 2.3 + t * 3.7
    const hollow = t > 0.14 ? Math.max(0.9, r - 1.85) : 0
    for (let x = -8; x <= 8; x++) {
      for (let z = -8; z <= 8; z++) {
        const ang = Math.atan2(z, x)
        const dist = Math.hypot(x, z)
        const lobe = 0.8 + 0.24 * Math.cos(ang * 5)
        const R = r * lobe
        if (dist > R + 0.15) continue
        if (hollow > 0 && dist < hollow * lobe) continue
        const n = dist / Math.max(0.6, R)
        cell(b, x, y, z, n > 0.78 ? 'lite' : n > 0.42 ? 'mid' : 'deep')
      }
    }
  }
}

function buildRose(b: MeshBuilder): void {
  for (let layer = 0; layer < 5; layer++) {
    const petals = 5
    const yaw0 = layer * 0.52
    const y = 2 + layer * 2
    const len = 6.2 - layer * 0.95
    const cup = 1.1 + layer * 0.15
    const inset = Math.max(0, 2.2 - layer * 0.45)
    for (let i = 0; i < petals; i++) {
      addPetal(
        b,
        yaw0 + (i / petals) * TAU,
        y,
        len,
        1.85,
        1.35,
        cup,
        (t, e) => {
          if (layer >= 3) return t > 0.55 || e > 0.62 ? 'lite' : 'mid'
          if (layer === 0) return e > 0.7 ? 'mid' : 'deep'
          return t > 0.7 || e > 0.68 ? 'lite' : 'mid'
        },
        inset,
      )
    }
  }
  cell(b, 0, 3, 0, 'deep')
  cell(b, 1, 4, 0, 'deep')
  cell(b, 0, 5, -1, 'deep')
}

function buildStar(b: MeshBuilder): void {
  for (let i = 0; i < 6; i++) {
    addPetal(b, (i / 6) * TAU, 2, 10, 1.05, 1.05, 0.25, (t, e) =>
      t > 0.65 || e > 0.62 ? 'lite' : 'mid',
    )
  }
  addDisc(b, 2, 2.4, 'center')
  addStamens(b, 3, 1.3, 6)
}

function buildPoppy(b: MeshBuilder): void {
  for (let i = 0; i < 5; i++) {
    addPetal(b, (i / 5) * TAU + 0.2, 3, 8, 2.5, 1.9, 2.15, (t, e) =>
      t > 0.62 || e > 0.55 ? 'lite' : 'mid',
    )
  }
  addDisc(b, 3, 2.1, 'deep')
  addDisc(b, 4, 1.2, 'deep')
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU
    const r = 2.2
    cell(b, Math.round(Math.cos(a) * r), 4, Math.round(Math.sin(a) * r), 'center')
    cell(b, Math.round(Math.cos(a) * r), 5, Math.round(Math.sin(a) * r), 'center')
  }
}

function buildOrchid(b: MeshBuilder): void {
  for (let y = 1; y <= 8; y++) {
    cell(b, 0, y, 0, 'center')
    cell(b, 0, y, 1, 'center')
    if (y >= 6) cell(b, 0, y, 2, 'center')
  }
  addPetal(b, Math.PI / 2, 1, 7, 2.6, 1.15, 0.55, (t, e) =>
    t > 0.7 || e > 0.65 ? 'lite' : 'mid',
  )
  addPetal(b, Math.PI * 0.92, 6, 5, 1.8, 1.3, 0.4, (t, e) =>
    t > 0.6 || e > 0.6 ? 'lite' : 'mid',
  )
  addPetal(b, -0.18, 3, 4.5, 1.7, 1.4, 0.35, (_t, e) => (e > 0.55 ? 'mid' : 'deep'))
  cell(b, 0, 2, 2, 'deep')
}

function addPetal(
  b: MeshBuilder,
  yaw: number,
  y0: number,
  length: number,
  halfW: number,
  halfH: number,
  cup: number,
  roleAt: (t: number, edge: number) => Role,
  inset = 0,
): void {
  const len = Math.ceil(length)
  const start = Math.floor(inset)
  for (let lx = start; lx <= len; lx++) {
    const t = length <= 0 ? 0 : lx / length
    if (t > 1.04) continue
    const w = Math.max(0.7, halfW * Math.sin(Math.PI * Math.min(1, 0.14 + t * 0.86)))
    const h = Math.max(0.55, halfH * (0.68 + 0.42 * Math.sin(Math.PI * Math.min(1, t))))
    const lift = cup * t * t
    const wI = Math.ceil(w)
    const hI = Math.ceil(h)
    for (let ly = -hI; ly <= hI; ly++) {
      for (let lz = -wI; lz <= wI; lz++) {
        const ey = h === 0 ? 0 : ly / h
        const ez = w === 0 ? 0 : lz / w
        const e = ey * ey + ez * ez
        if (e > 1.08) continue
        const [wx, wz] = rotYaw(lx, lz, yaw)
        cell(b, Math.round(wx), Math.round(y0 + ly + lift), Math.round(wz), roleAt(Math.min(1, t), e))
      }
    }
  }
}

function addCupPetal(
  b: MeshBuilder,
  yaw: number,
  height: number,
  radius: number,
  roleAt: (t: number) => Role,
): void {
  for (let y = 0; y <= height; y++) {
    const t = height === 0 ? 0 : y / height
    const r = Math.max(1.15, radius * (1 - 0.58 * t * t * t))
    const halfArc = Math.max(1, Math.round(3.1 * (1 - t * 0.42)))
    for (let k = 0; k < 2; k++) {
      const rr = r - k
      for (let a = -halfArc; a <= halfArc; a++) {
        const ang = yaw + a * 0.17
        cell(b, Math.round(Math.cos(ang) * rr), y + 1, Math.round(Math.sin(ang) * rr), roleAt(t))
      }
    }
  }
}

function addDisc(b: MeshBuilder, cy: number, r: number, role: Role): void {
  const ri = Math.ceil(r)
  for (let x = -ri; x <= ri; x++) {
    for (let z = -ri; z <= ri; z++) {
      if (x * x + z * z <= r * r + 0.35) cell(b, x, cy, z, role)
    }
  }
}

function addStamens(b: MeshBuilder, y: number, r: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const x = Math.round(Math.cos(a) * r)
    const z = Math.round(Math.sin(a) * r)
    cell(b, x, y, z, 'center')
    cell(b, x, y + 1, z, 'center')
  }
}

function addDropLeaf(
  b: MeshBuilder,
  yaw: number,
  yStart: number,
  length: number,
  halfW: number,
  thick = 0,
): void {
  for (let i = 0; i <= length; i++) {
    const t = length === 0 ? 0 : i / length
    const out = 1.2 + i * 0.42
    const y = yStart - i
    const w = Math.max(0.7, halfW * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.9)))
    const wI = Math.ceil(w)
    for (let ly = 0; ly <= thick; ly++) {
      for (let a = -wI; a <= wI; a++) {
        if (Math.abs(a) > w + 0.2) continue
        const [x, z] = rotYaw(out, a, yaw)
        const edge = Math.abs(a) / Math.max(0.4, w)
        b.voxel(
          Math.round(x),
          y + ly,
          Math.round(z),
          leafRgb(edge > 0.72 || t < 0.12 ? 'lite' : t > 0.78 ? 'deep' : 'mid'),
        )
      }
    }
  }
}

function addCompoundLeaf(b: MeshBuilder, yaw: number, y: number, length: number): void {
  addDropLeaf(b, yaw, y, length, 2.2, 1)
  addDropLeaf(b, yaw + 0.72, y + 1, Math.round(length * 0.48), 1.4, 1)
  addDropLeaf(b, yaw - 0.72, y + 1, Math.round(length * 0.48), 1.4, 1)
}

function addSepals(b: MeshBuilder, count: number, length: number): void {
  for (let i = 0; i < count; i++) {
    const yaw = (i / count) * TAU + 0.2
    for (let k = 0; k < length; k++) {
      const [x, z] = rotYaw(k + 1, 0, yaw)
      b.voxel(Math.round(x), k < 2 ? 0 : -1, Math.round(z), leafRgb(k === 0 ? 'deep' : 'mid'))
      if (k > 1) {
        const [x2, z2] = rotYaw(k + 1, 1, yaw)
        b.voxel(Math.round(x2), -1, Math.round(z2), leafRgb('lite'))
      }
    }
  }
}

function cell(b: MeshBuilder, x: number, y: number, z: number, role: Role): void {
  b.voxel(x, y, z, ROLE_RGB[role], role === 'center')
}

function rotYaw(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return [x * c - z * s, x * s + z * c]
}

const FACE_DIRS: ReadonlyArray<{
  nx: number
  ny: number
  nz: number
  shade: number
  quad: (x: number, y: number, z: number) => number[]
}> = [
  { nx: 0, ny: 0, nz: 1, shade: 1.06, quad: (x, y, z) => [x, y, z + 1, x + 1, y, z + 1, x + 1, y + 1, z + 1, x, y + 1, z + 1] },
  { nx: 0, ny: 0, nz: -1, shade: 0.66, quad: (x, y, z) => [x + 1, y, z, x, y, z, x, y + 1, z, x + 1, y + 1, z] },
  { nx: 1, ny: 0, nz: 0, shade: 1.26, quad: (x, y, z) => [x + 1, y, z + 1, x + 1, y, z, x + 1, y + 1, z, x + 1, y + 1, z + 1] },
  { nx: -1, ny: 0, nz: 0, shade: 0.54, quad: (x, y, z) => [x, y, z, x, y, z + 1, x, y + 1, z + 1, x, y + 1, z] },
  { nx: 0, ny: 1, nz: 0, shade: 1.46, quad: (x, y, z) => [x, y + 1, z + 1, x + 1, y + 1, z + 1, x + 1, y + 1, z, x, y + 1, z] },
  { nx: 0, ny: -1, nz: 0, shade: 0.4, quad: (x, y, z) => [x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1] },
]

class MeshBuilder {
  private readonly positions: number[] = []
  private readonly colors: number[] = []
  private readonly pollens: number[] = []
  private readonly voxels = new Map<string, [number, number, number]>()
  private readonly pollenCells = new Set<string>()

  voxel(
    x: number,
    y: number,
    z: number,
    rgb: readonly [number, number, number],
    pollen = false,
  ): void {
    const key = `${x}|${y}|${z}`
    this.voxels.set(key, [rgb[0], rgb[1], rgb[2]])
    if (pollen) this.pollenCells.add(key)
    else this.pollenCells.delete(key)
  }

  tri(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    ca: [number, number, number],
    cb: [number, number, number],
    cc: [number, number, number],
    pollen = 0,
  ): void {
    this.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
    this.colors.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2])
    this.pollens.push(pollen, pollen, pollen)
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
    this.face(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, shade(rgb, 1.06))
    this.face(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, shade(rgb, 0.66))
    this.face(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, shade(rgb, 1.26))
    this.face(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, shade(rgb, 0.54))
    this.face(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, shade(rgb, 1.46))
    this.face(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, shade(rgb, 0.4))
  }

  private faceAo(x: number, y: number, z: number, nx: number, ny: number, _nz: number): number {
    let occ = 0
    if (nx !== 0) {
      if (this.voxels.has(`${x}|${y + 1}|${z}`)) occ++
      if (this.voxels.has(`${x}|${y - 1}|${z}`)) occ++
      if (this.voxels.has(`${x}|${y}|${z + 1}`)) occ++
      if (this.voxels.has(`${x}|${y}|${z - 1}`)) occ++
    } else if (ny !== 0) {
      if (this.voxels.has(`${x + 1}|${y}|${z}`)) occ++
      if (this.voxels.has(`${x - 1}|${y}|${z}`)) occ++
      if (this.voxels.has(`${x}|${y}|${z + 1}`)) occ++
      if (this.voxels.has(`${x}|${y}|${z - 1}`)) occ++
    } else {
      if (this.voxels.has(`${x + 1}|${y}|${z}`)) occ++
      if (this.voxels.has(`${x - 1}|${y}|${z}`)) occ++
      if (this.voxels.has(`${x}|${y + 1}|${z}`)) occ++
      if (this.voxels.has(`${x}|${y - 1}|${z}`)) occ++
    }
    return 1 - occ * 0.13
  }

  private emitVoxels(): void {
    for (const [key, rgb] of this.voxels) {
      const parts = key.split('|')
      const x = Number(parts[0])
      const y = Number(parts[1])
      const z = Number(parts[2])
      let buried = 0
      for (const f of FACE_DIRS) {
        if (this.voxels.has(`${x + f.nx}|${y + f.ny}|${z + f.nz}`)) buried++
      }
      const occ = 1 - buried * 0.05
      const pollen = this.pollenCells.has(key)
      for (const f of FACE_DIRS) {
        if (this.voxels.has(`${x + f.nx}|${y + f.ny}|${z + f.nz}`)) continue
        const mul = f.shade * this.faceAo(x, y, z, f.nx, f.ny, f.nz) * occ
        const q = f.quad(x, y, z)
        const a: [number, number, number] = [snap(q[0]! * VOXEL), snap(q[1]! * VOXEL), snap(q[2]! * VOXEL)]
        const b: [number, number, number] = [snap(q[3]! * VOXEL), snap(q[4]! * VOXEL), snap(q[5]! * VOXEL)]
        const c: [number, number, number] = [snap(q[6]! * VOXEL), snap(q[7]! * VOXEL), snap(q[8]! * VOXEL)]
        const d: [number, number, number] = [snap(q[9]! * VOXEL), snap(q[10]! * VOXEL), snap(q[11]! * VOXEL)]
        const tint = shade(rgb, mul)
        this.face(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], tint, pollen ? mul : 0)
      }
    }
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
    pollen = 0,
  ): void {
    this.tri([ax, ay, az], [bx, by, bz], [cx, cy, cz], rgb, rgb, rgb, pollen)
    this.tri([ax, ay, az], [cx, cy, cz], [dx, dy, dz], rgb, rgb, rgb, pollen)
  }

  toGeometry(scale = 1): BufferGeometry {
    this.emitVoxels()
    this.voxels.clear()
    this.pollenCells.clear()
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(this.positions, 3))
    geo.setAttribute('color', new Float32BufferAttribute(this.colors, 3))
    geo.setAttribute('pollen', new Float32BufferAttribute(this.pollens, 1))
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

function satStem(rgb: [number, number, number]): [number, number, number] {
  return [
    Math.min(1.15, rgb[0] * 0.88),
    Math.min(1.4, rgb[1] * 1.28),
    Math.min(1.1, rgb[2] * 0.92),
  ]
}

function leafRgb(tone: 'lite' | 'mid' | 'deep'): [number, number, number] {
  if (tone === 'lite') return satStem(hexRgb(PASTEL.grassLight))
  if (tone === 'deep') return satStem(hexRgb(PASTEL.stemDark))
  return satStem(hexRgb(PASTEL.stem))
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
