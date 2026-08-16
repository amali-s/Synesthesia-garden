import { pitchNorm, type PitchSample } from '../audio/pitch'
import { FLOWER_BASE_HUES } from './palette'
import { kindFromPitch, type FlowerKind } from './sprites'

export type Plant =
  | {
      type: 'flower'
      x: number
      y: number
      kind: FlowerKind
      pitchT: number
      loudnessT: number
      timbreT: number
      hz: number
      born: number
      baseHue: number
    }
  | {
      type: 'grass'
      x: number
      y: number
      variant: number
      born: number
    }

export type GardenConfig = {
  /** Logical pixel width of the garden bed */
  width: number
  /** Logical pixel height of the garden bed */
  height: number
  /** Soil band starts at this y (logical) */
  soilY: number
}

const SPAWN_COOLDOWN_MS = 220
const PAUSE_GRASS_MS = 360
const MAX_PLANTS = 480
const CELL_W = 10
const CELL_H = 9

export class Garden {
  plants: Plant[] = []
  lastOnset = 0
  readonly config: GardenConfig

  private lastSpawn = 0
  private lastVoice = 0
  private pauseAccum = 0
  private cursorCol = 0
  private row = 0
  private cols: number
  private rows: number

  constructor(config: GardenConfig) {
    this.config = config
    this.cols = Math.floor(config.width / CELL_W)
    this.rows = Math.max(1, Math.floor((config.height - config.soilY - 4) / CELL_H))
  }

  clear(): void {
    this.plants = []
    this.cursorCol = 0
    this.row = 0
    this.pauseAccum = 0
    this.lastSpawn = 0
    this.lastVoice = 0
    this.lastOnset = 0
  }

  /**
   * Feed a pitch sample. Voice → flower; sustained pause → grass.
   */
  ingest(sample: PitchSample, now: number): void {
    if (sample.onset) this.lastOnset = now

    if (sample.isVoice && sample.hz !== null) {
      this.lastVoice = now
      this.pauseAccum = 0
      if (now - this.lastSpawn >= SPAWN_COOLDOWN_MS) {
        this.spawnFlower(sample, now)
        this.lastSpawn = now
      }
      return
    }

    // Silence / pause → grow grass
    if (this.lastVoice === 0 && this.plants.length === 0) {
      // Warm-up: still plant a little grass so the bed isn't empty
      this.pauseAccum += 16
    } else if (now - this.lastVoice > 180 || this.lastVoice === 0) {
      this.pauseAccum += 16
    }

    if (this.pauseAccum >= PAUSE_GRASS_MS) {
      this.spawnGrass(now)
      this.pauseAccum = 0
      this.lastSpawn = now
    }
  }

  private nextSlot(): { x: number; y: number } {
    const col = this.cursorCol
    const row = this.row
    this.cursorCol++
    if (this.cursorCol >= this.cols) {
      this.cursorCol = 0
      this.row = (this.row + 1) % this.rows
    }
    // Jitter so the bed feels organic
    const jitterX = ((col * 17 + row * 3) % 7) - 3
    const jitterY = ((col * 7 + row * 11) % 5) - 2
    const x = 6 + col * CELL_W + jitterX
    const y = this.config.soilY + 8 + row * CELL_H + jitterY
    return {
      x: clamp(x, 4, this.config.width - 5),
      y: clamp(y, this.config.soilY + 4, this.config.height - 4),
    }
  }

  private spawnFlower(sample: PitchSample, now: number): void {
    const hz = sample.hz!
    const pitchT = pitchNorm(hz)
    const kind = kindFromPitch(pitchT, sample.timbreT)
    const hueIndex = Math.floor(pitchT * FLOWER_BASE_HUES.length) % FLOWER_BASE_HUES.length
    const { x, y } = this.nextSlot()
    this.plants.push({
      type: 'flower',
      x,
      y,
      kind,
      pitchT,
      loudnessT: sample.loudnessT,
      timbreT: sample.timbreT,
      hz,
      born: now,
      baseHue: FLOWER_BASE_HUES[hueIndex]!,
    })
    this.trim()
  }

  private spawnGrass(now: number): void {
    const { x, y } = this.nextSlot()
    this.plants.push({
      type: 'grass',
      x,
      y,
      variant: Math.floor(Math.random() * 8),
      born: now,
    })
    this.trim()
  }

  private trim(): void {
    if (this.plants.length > MAX_PLANTS) {
      this.plants.splice(0, this.plants.length - MAX_PLANTS)
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
