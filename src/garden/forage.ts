import {
  GARDEN_BEDS,
  GRID_COLS,
  GRID_GAP,
  GRID_PAD_BOTTOM,
  GRID_PAD_TOP,
  GRID_PAD_X,
  GRID_ROWS,
  PATCH_H,
  PATCH_W,
  bedById,
  type BedId,
  type GardenBed,
} from './beds'
import {
  FOX_ENTER,
  FOX_EXIT_RIGHT,
  FOX_SNIFF,
  MAILBOX_STAND,
  type FoxPose,
} from './critters'
import { plantLife, type FlowerPlant, type Garden } from './world'

export const MIN_BOUQUET = 6
export const MAX_BOUQUET = 12
export const MAX_PER_BED = 4

const WALK_PX_PER_SEC = 92
const SNIFF_MS = 1400
const PICK_MS = 380
const MAIL_MS = 900

export type ForageView = {
  foxX: number
  foxY: number
  facing: 1 | -1
  frame: 0 | 1
  pose: FoxPose
  bundle: readonly FlowerPlant[]
  lifting: FlowerPlant | null
  liftX: number
  liftY: number
  mailboxFlag: boolean
}

export type ForageEvent =
  | { type: 'pick'; plant: FlowerPlant }
  | { type: 'mail' }
  | { type: 'done'; mailed: boolean }

type Step =
  | { kind: 'walk'; x: number; y: number }
  | { kind: 'sniff' }
  | { kind: 'pick'; plant: FlowerPlant }
  | { kind: 'mail' }

const PHASE_RANK: Record<string, number> = {
  bloom: 0,
  rest: 1,
  seed: 2,
  wilt: 3,
}

export function livingFlowers(garden: Garden): FlowerPlant[] {
  const out: FlowerPlant[] = []
  for (const p of garden.plants) {
    if (p.type === 'flower' && p.wiltStarted === null) out.push(p)
  }
  return out
}

function rankInBed(flowers: FlowerPlant[], now: number): FlowerPlant[] {
  return [...flowers].sort((a, b) => {
    const ra = PHASE_RANK[plantLife(a, now).phase] ?? 9
    const rb = PHASE_RANK[plantLife(b, now).phase] ?? 9
    if (ra !== rb) return ra - rb
    if (b.loudnessT !== a.loudnessT) return b.loudnessT - a.loudnessT
    return a.born - b.born
  })
}

/**
 * Living-count, fullest beds first. At most 4 stems per patch, 12 in the
 * bouquet. Returns [] when the plan cannot reach 6 (fox sniffs and leaves).
 */
export function planBouquet(garden: Garden, now: number): FlowerPlant[] {
  const living = livingFlowers(garden)
  const byBed = new Map<BedId, FlowerPlant[]>()
  for (const f of living) {
    const list = byBed.get(f.bedId) ?? []
    list.push(f)
    byBed.set(f.bedId, list)
  }

  const beds = [...byBed.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length
    const ia = GARDEN_BEDS.findIndex((bed) => bed.id === a[0])
    const ib = GARDEN_BEDS.findIndex((bed) => bed.id === b[0])
    return ia - ib
  })

  const picked: FlowerPlant[] = []
  for (const [, flowers] of beds) {
    if (picked.length >= MAX_BOUQUET) break
    const ranked = rankInBed(flowers, now)
    const take = Math.min(MAX_PER_BED, ranked.length, MAX_BOUQUET - picked.length)
    picked.push(...ranked.slice(0, take))
  }

  if (picked.length < MIN_BOUQUET) return []
  return picked
}

function visitOrder(picks: FlowerPlant[]): FlowerPlant[] {
  const bedOrder: BedId[] = []
  const seen = new Set<BedId>()
  for (const p of picks) {
    if (seen.has(p.bedId)) continue
    seen.add(p.bedId)
    bedOrder.push(p.bedId)
  }
  const ordered: FlowerPlant[] = []
  for (const id of bedOrder) {
    const inBed = picks.filter((p) => p.bedId === id)
    inBed.sort((a, b) => a.x - b.x || a.y - b.y)
    ordered.push(...inBed)
  }
  return ordered
}

/** Feet on the bottom gravel walk (front of the courtyard). */
export const FOX_LANE_BOTTOM =
  GRID_PAD_TOP +
  GRID_ROWS * PATCH_H +
  (GRID_ROWS - 1) * GRID_GAP +
  Math.floor(GRID_PAD_BOTTOM / 2)

function alleyXs(): number[] {
  const xs = [GRID_PAD_X / 2]
  for (let col = 0; col < GRID_COLS - 1; col++) {
    const gutter0 = GRID_PAD_X + (col + 1) * PATCH_W + col * GRID_GAP
    xs.push(gutter0 + GRID_GAP / 2)
  }
  const lastBed = GARDEN_BEDS.find((b) => b.id === 'b3') ?? GARDEN_BEDS[3]!
  xs.push(lastBed.x + lastBed.w + GRID_PAD_X / 2)
  return xs
}

function pickAlley(fromX: number, toX: number): number {
  const alleys = alleyXs()
  return alleys.reduce((best, a) => {
    const cost = Math.abs(fromX - a) + Math.abs(toX - a)
    const bestCost = Math.abs(fromX - best) + Math.abs(toX - best)
    return cost < bestCost ? a : best
  })
}

/** Gravel-only waypoints. Same lane is a straight walk; changing rows uses an alley. */
export function gravelWalk(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  const push = (x: number, y: number) => {
    const last = out[out.length - 1]
    if (last && last.x === x && last.y === y) return
    if (out.length === 0 && x === fromX && y === fromY) return
    out.push({ x, y })
  }
  if (fromY === toY) {
    push(toX, toY)
    return out
  }
  const alley = pickAlley(fromX, toX)
  push(alley, fromY)
  push(alley, toY)
  push(toX, toY)
  return out
}

/** Stand on the gravel walk beside a patch — never on timber. */
export function foxStandForBed(bed: GardenBed): { x: number; y: number } {
  const x = Math.round(bed.x + bed.w / 2)
  const y = bed.y <= GRID_PAD_TOP ? FOX_ENTER.y : FOX_LANE_BOTTOM
  return { x, y }
}

function buildSteps(picks: FlowerPlant[]): Step[] {
  const steps: Step[] = []
  let x: number = FOX_ENTER.x
  let y: number = FOX_ENTER.y
  const walkTo = (tx: number, ty: number) => {
    for (const p of gravelWalk(x, y, tx, ty)) {
      steps.push({ kind: 'walk', x: p.x, y: p.y })
      x = p.x
      y = p.y
    }
  }

  if (picks.length === 0) {
    walkTo(FOX_SNIFF.x, FOX_SNIFF.y)
    steps.push({ kind: 'sniff' })
    walkTo(FOX_ENTER.x, FOX_ENTER.y)
    return steps
  }

  for (const plant of visitOrder(picks)) {
    const stand = foxStandForBed(bedById(plant.bedId))
    walkTo(stand.x, stand.y)
    steps.push({ kind: 'pick', plant })
  }
  walkTo(MAILBOX_STAND.x, MAILBOX_STAND.y)
  steps.push({ kind: 'mail' })
  walkTo(FOX_EXIT_RIGHT.x, FOX_EXIT_RIGHT.y)
  return steps
}

export class ForageRun {
  /** Clones of the planned stems, for the bouquet PNG. */
  readonly bouquet: FlowerPlant[]
  readonly sniffing: boolean

  private readonly garden: Garden
  private readonly steps: Step[]
  private index = 0
  private x: number = FOX_ENTER.x
  private y: number = FOX_ENTER.y
  private facing: 1 | -1 = 1
  private pose: FoxPose = 'walk'
  private lastNow: number
  private dwellStart = 0
  private plucked = false
  private mailed = false
  private mailEmitted = false
  private bundle: FlowerPlant[] = []
  private lifting: FlowerPlant | null = null
  private liftX = 0
  private liftY = 0
  private finished = false

  constructor(garden: Garden, picks: FlowerPlant[], now: number) {
    this.garden = garden
    this.bouquet = picks.map((p) => ({ ...p }))
    this.sniffing = picks.length === 0
    this.steps = buildSteps(picks)
    this.lastNow = now
    this.dwellStart = now
  }

  get done(): boolean {
    return this.finished
  }

  view(now: number): ForageView {
    return {
      foxX: this.x,
      foxY: this.y,
      facing: this.facing,
      frame: (Math.floor(now / 110) % 2) as 0 | 1,
      pose: this.pose,
      bundle: this.bundle,
      lifting: this.lifting,
      liftX: this.liftX,
      liftY: this.liftY,
      mailboxFlag: this.mailed || this.current()?.kind === 'mail',
    }
  }

  tick(now: number): ForageEvent | null {
    if (this.finished) return null
    const dt = Math.min(48, Math.max(0, now - this.lastNow))
    this.lastNow = now
    const step = this.current()
    if (!step) return this.finish()

    if (step.kind === 'walk') {
      this.pose = 'walk'
      this.lifting = null
      const arrived = this.stepToward(step.x, step.y, (WALK_PX_PER_SEC * dt) / 1000)
      if (arrived) return this.advance(now)
      return null
    }

    if (step.kind === 'sniff') {
      this.pose = 'sniff'
      this.lifting = null
      if (now - this.dwellStart >= SNIFF_MS) return this.advance(now)
      return null
    }

    if (step.kind === 'pick') {
      this.pose = 'pick'
      const t = Math.min(1, (now - this.dwellStart) / PICK_MS)
      this.liftX = step.plant.x
      this.liftY = step.plant.y - t * 10
      this.lifting = this.plucked ? step.plant : null
      if (!this.plucked && t >= 0.42) {
        this.plucked = true
        this.garden.removePlant(step.plant)
        this.bundle.push(step.plant)
        this.lifting = step.plant
        return { type: 'pick', plant: step.plant }
      }
      if (t >= 1) {
        this.lifting = null
        return this.advance(now)
      }
      return null
    }

    this.pose = 'walk'
    this.lifting = null
    this.mailed = true
    if (!this.mailEmitted && now - this.dwellStart >= MAIL_MS * 0.28) {
      this.mailEmitted = true
      return { type: 'mail' }
    }
    if (now - this.dwellStart >= MAIL_MS) {
      this.mailed = false
      return this.advance(now)
    }
    return null
  }

  private current(): Step | undefined {
    return this.steps[this.index]
  }

  private finish(): ForageEvent {
    this.finished = true
    return { type: 'done', mailed: this.mailEmitted }
  }

  private advance(now: number): ForageEvent | null {
    this.index += 1
    this.dwellStart = now
    this.plucked = false
    if (!this.current()) return this.finish()
    return null
  }

  private stepToward(tx: number, ty: number, dist: number): boolean {
    const dx = tx - this.x
    const dy = ty - this.y
    const len = Math.hypot(dx, dy)
    if (dx !== 0) this.facing = dx >= 0 ? 1 : -1
    if (len <= dist || len < 0.4) {
      this.x = tx
      this.y = ty
      return true
    }
    this.x += (dx / len) * dist
    this.y += (dy / len) * dist
    return false
  }
}
