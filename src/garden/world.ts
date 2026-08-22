import { type PitchSample } from '../audio/pitch'
import {
  GARDEN_BEDS,
  bedById,
  bedCols,
  bedFromPitch,
  bedRows,
  bedsBackToFront,
  soilRect,
  type BedId,
  type GardenBed,
} from './beds'
import { FLOWER_BASE_HUES } from './palette'
import { kindFromPitch, type FlowerKind } from './sprites'

export type PlantLife = 'seed' | 'bloom' | 'rest' | 'wilt'

export type Plant =
  | {
      type: 'flower'
      x: number
      y: number
      bedId: BedId
      kind: FlowerKind
      pitchT: number
      loudnessT: number
      timbreT: number
      hz: number
      born: number
      baseHue: number
      wiltStarted: number | null
    }
  | {
      type: 'grass'
      x: number
      y: number
      bedId: BedId
      variant: number
      born: number
      wiltStarted: number | null
    }

export type FlowerPlant = Extract<Plant, { type: 'flower' }>

export type GardenConfig = {
  width: number
  height: number
}

const SPAWN_COOLDOWN_MS = 220
const PAUSE_GRASS_MS = 360
/** Living plants before the oldest begin to wilt */
const MAX_LIVING = 560
const CELL_W = 8
const CELL_H = 7

export const SEED_MS = 800
export const BLOOM_MS = 12_000
export const REST_EASE_MS = 8_000
export const WILT_MS = 2_600

export class Garden {
  plants: Plant[] = []
  lastOnset = 0
  /** Accumulated time while ingesting (listening), for sky */
  listenMs = 0
  readonly config: GardenConfig

  private lastSpawn = 0
  private lastVoice = 0
  private pauseAccum = 0
  private lastTick = 0
  private frameDt = 16
  private lastBedId: BedId = 'f0'
  private grassBedCursor = 0

  constructor(config: GardenConfig) {
    this.config = config
  }

  clear(): void {
    this.plants = []
    this.pauseAccum = 0
    this.lastSpawn = 0
    this.lastVoice = 0
    this.lastOnset = 0
  }

  /**
   * Front-most flower at a logical pixel, or null for grass / empty soil.
   * Draw order is back beds then y-sort; hit-test walks the reverse.
   */
  hitFlowerAt(lx: number, ly: number, now: number): FlowerPlant | null {
    const beds = bedsBackToFront()
    for (let b = beds.length - 1; b >= 0; b--) {
      const bed = beds[b]!
      const flowers: FlowerPlant[] = []
      for (const p of this.plants) {
        if (p.type === 'flower' && p.bedId === bed.id) flowers.push(p)
      }
      flowers.sort((a, c) => c.y - a.y)
      for (const plant of flowers) {
        if (flowerContains(plant, lx, ly, now)) return plant
      }
    }
    return null
  }

  /**
   * Advance wilt / listen clock. Call once per frame, before ingest.
   */
  tick(now: number, listening: boolean): void {
    const dt = this.lastTick > 0 ? Math.min(48, Math.max(0, now - this.lastTick)) : 16
    this.lastTick = now
    this.frameDt = dt
    if (listening) this.listenMs += dt
    if (this.plants.some((p) => p.wiltStarted !== null)) {
      this.plants = this.plants.filter((p) => {
        if (p.wiltStarted === null) return true
        return now - p.wiltStarted < WILT_MS
      })
    }
    this.startWilts(now)
  }

  /**
   * Feed a pitch sample. Voice → flower; sustained pause → grass in gaps.
   */
  ingest(sample: PitchSample, now: number): void {
    const dt = this.frameDt

    if (sample.onset) this.lastOnset = now

    if (sample.isVoice && sample.hz !== null) {
      this.lastVoice = now
      this.pauseAccum = 0
      const cooldown = spawnCooldownMs(sample.spawnScale)
      if (now - this.lastSpawn >= cooldown) {
        this.spawnFlower(sample, now)
        this.lastSpawn = now
      }
      return
    }

    if (this.lastVoice === 0 && this.plants.length === 0) {
      this.pauseAccum += dt
    } else if (now - this.lastVoice > 180 || this.lastVoice === 0) {
      this.pauseAccum += dt
    }

    if (this.pauseAccum >= PAUSE_GRASS_MS) {
      this.spawnGrass(now)
      this.pauseAccum = 0
      this.lastSpawn = now
    }
  }

  private startWilts(now: number): void {
    const living = this.plants.filter((p) => p.wiltStarted === null)
    const over = living.length - MAX_LIVING
    if (over <= 0) return
    living.sort((a, b) => a.born - b.born)
    for (let i = 0; i < over; i++) {
      living[i]!.wiltStarted = now
    }
  }

  private occupied(): Set<string> {
    const keys = new Set<string>()
    for (const p of this.plants) {
      if (p.wiltStarted !== null) continue
      keys.add(this.cellKey(p.bedId, p.x, p.y))
    }
    return keys
  }

  private cellKey(bedId: BedId, x: number, y: number): string {
    const bed = bedById(bedId)
    const r = soilRect(bed)
    const col = Math.round((x - r.x0) / CELL_W)
    const row = Math.round((y - r.y0) / CELL_H)
    return `${bedId}:${col},${row}`
  }

  private clampPos(bed: GardenBed, x: number, y: number): { x: number; y: number } {
    const b = soilRect(bed)
    return {
      x: clamp(x, b.x0, b.x1),
      y: clamp(y, b.y0, b.y1),
    }
  }

  /** Place on an empty soil cell, preferring spots farthest from plants already in the bed. */
  private placeFlower(bed: GardenBed): { x: number; y: number } {
    const occ = this.occupied()
    const b = soilRect(bed)
    const cols = bedCols(bed, CELL_W)
    const rows = bedRows(bed, CELL_H)
    const inBed = this.plants.filter((p) => p.bedId === bed.id && p.wiltStarted === null)
    const empty: Array<{ x: number; y: number; spread: number }> = []

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = b.x0 + col * CELL_W + (Math.random() * 4 - 2)
        const y = b.y0 + row * CELL_H + (Math.random() * 4 - 2)
        const pos = this.clampPos(bed, x, y)
        if (occ.has(this.cellKey(bed.id, pos.x, pos.y))) continue
        let nearest = 96
        for (const p of inBed) {
          const d = Math.hypot(p.x - pos.x, p.y - pos.y)
          if (d < nearest) nearest = d
        }
        empty.push({ ...pos, spread: nearest })
      }
    }

    if (empty.length === 0) {
      return this.clampPos(
        bed,
        b.x0 + Math.random() * (b.x1 - b.x0),
        b.y0 + Math.random() * (b.y1 - b.y0),
      )
    }

    empty.sort((a, c) => c.spread - a.spread)
    const roomiest = empty[0]!.spread
    const spacious = empty.filter((c) => c.spread >= roomiest * 0.7)
    const pool = spacious.length > 0 ? spacious : empty
    return pool[Math.floor(Math.random() * pool.length)]!
  }

  /** Grass fills empty cells in a patch, preferring gaps beside existing plants. */
  private placeGrass(bed: GardenBed): { x: number; y: number } {
    const occ = this.occupied()
    const b = soilRect(bed)
    const cols = bedCols(bed, CELL_W)
    const rows = bedRows(bed, CELL_H)
    const gaps: Array<{ x: number; y: number; score: number }> = []
    const inBed = this.plants.filter((p) => p.bedId === bed.id && p.wiltStarted === null)

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = b.x0 + col * CELL_W + (Math.random() * 6 - 3)
        const y = b.y0 + row * CELL_H + (Math.random() * 5 - 2)
        const pos = this.clampPos(bed, x, y)
        if (occ.has(this.cellKey(bed.id, pos.x, pos.y))) continue
        const neighbors = neighborCount(occ, bed.id, col, row)
        if (neighbors === 0 && inBed.length > 8) continue
        gaps.push({ ...pos, score: neighbors })
      }
    }

    if (gaps.length === 0) {
      return this.clampPos(
        bed,
        b.x0 + Math.random() * (b.x1 - b.x0),
        b.y0 + Math.random() * (b.y1 - b.y0),
      )
    }

    gaps.sort((a, bGap) => bGap.score - a.score)
    const prefer = gaps.filter((g) => g.score >= 1 && g.score <= 3)
    const pool = prefer.length > 0 ? prefer : gaps.slice(0, Math.min(24, gaps.length))
    return pool[Math.floor(Math.random() * pool.length)]!
  }

  private spawnFlower(sample: PitchSample, now: number): void {
    const hz = sample.hz!
    const pitchT = sample.pitchT
    const bed = bedFromPitch(pitchT)
    this.lastBedId = bed.id
    const kind = kindFromPitch(pitchT, sample.timbreT)
    const hueIndex = Math.floor(pitchT * FLOWER_BASE_HUES.length) % FLOWER_BASE_HUES.length
    const { x, y } = this.placeFlower(bed)
    this.plants.push({
      type: 'flower',
      x,
      y,
      bedId: bed.id,
      kind,
      pitchT,
      loudnessT: sample.loudnessT,
      timbreT: sample.timbreT,
      hz,
      born: now,
      baseHue: FLOWER_BASE_HUES[hueIndex]!,
      wiltStarted: null,
    })
    this.startWilts(now)
  }

  private spawnGrass(now: number): void {
    const livingBeds = new Set(
      this.plants.filter((p) => p.wiltStarted === null).map((p) => p.bedId),
    )
    let bed: GardenBed
    if (livingBeds.size === 0) {
      bed = GARDEN_BEDS[this.grassBedCursor % GARDEN_BEDS.length]!
      this.grassBedCursor += 1
    } else {
      bed = bedById(this.lastBedId)
    }
    const { x, y } = this.placeGrass(bed)
    this.plants.push({
      type: 'grass',
      x,
      y,
      bedId: bed.id,
      variant: Math.floor(Math.random() * 8),
      born: now,
      wiltStarted: null,
    })
    this.startWilts(now)
  }
}

export type PlantLifeState = {
  phase: PlantLife
  grow: number
  restT: number
  wiltT: number
}

export function plantLife(plant: Plant, now: number): PlantLifeState {
  if (plant.wiltStarted !== null) {
    const wiltT = clamp((now - plant.wiltStarted) / WILT_MS, 0, 1)
    return { phase: 'wilt', grow: Math.max(0.15, 1 - wiltT * 0.5), restT: 1, wiltT }
  }
  const age = now - plant.born
  if (age < SEED_MS) {
    return { phase: 'seed', grow: age / SEED_MS, restT: 0, wiltT: 0 }
  }
  if (age < SEED_MS + BLOOM_MS) {
    return { phase: 'bloom', grow: 1, restT: 0, wiltT: 0 }
  }
  const restT = clamp((age - SEED_MS - BLOOM_MS) / REST_EASE_MS, 0, 1)
  return { phase: 'rest', grow: 1, restT, wiltT: 0 }
}

function flowerContains(plant: FlowerPlant, lx: number, ly: number, now: number): boolean {
  const life = plantLife(plant, now)
  const stemH = Math.max(
    1,
    Math.round((5 + plant.loudnessT * 9) * life.grow * (1 - life.wiltT * 0.4)),
  )
  const bloomScale = Math.min(
    1.15,
    (0.5 + 0.5 * plant.loudnessT) * (1 - life.restT * 0.12) * (1 - life.wiltT * 0.35),
  )
  const r = 6 * Math.max(0.45, bloomScale)
  const x0 = plant.x - r - 2
  const x1 = plant.x + r + 2
  const y0 = plant.y - stemH - r - 1
  const y1 = plant.y + 2
  return lx >= x0 && lx <= x1 && ly >= y0 && ly <= y1
}

function spawnCooldownMs(spawnScale: number): number {
  return clamp(Math.round(SPAWN_COOLDOWN_MS * spawnScale), 105, 480)
}

function neighborCount(
  occ: Set<string>,
  bedId: BedId,
  col: number,
  row: number,
): number {
  let n = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      if (occ.has(`${bedId}:${col + dx},${row + dy}`)) n++
    }
  }
  return n
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
