import { describe, expect, it } from 'vitest'
import {
  GARDEN_BEDS,
  GRID_GAP,
  GRID_PAD_BOTTOM,
  GRID_PAD_TOP,
  PATCH_H,
  bedById,
  isGravel,
  type BedId,
} from './beds'
import { MAILBOX, MAILBOX_H, MAILBOX_W } from './critters'
import {
  ForageRun,
  MAX_BOUQUET,
  MAX_PER_BED,
  MIN_BOUQUET,
  foxLaneBottom,
  foxStandForBed,
  gravelWalk,
  planBouquet,
} from './forage'
import { Garden, type FlowerPlant } from './world'

function newGarden(): Garden {
  return new Garden({ width: 320, height: 200 })
}

function flower(bedId: BedId, i: number, extra: Partial<FlowerPlant> = {}): FlowerPlant {
  return {
    type: 'flower',
    x: 20 + i * 6,
    y: 40 + (i % 3) * 8,
    bedId,
    kind: 'daisy',
    pitchT: 0.2,
    loudnessT: 0.4 + (i % 5) * 0.1,
    timbreT: 0.4,
    hz: 220,
    born: 1000,
    baseHue: 20,
    wiltStarted: null,
    singingUntil: 0,
    glowPulseUntil: 0,
    ...extra,
  }
}

function fillBed(bedId: BedId, n: number, start = 0): FlowerPlant[] {
  return Array.from({ length: n }, (_, i) => flower(bedId, start + i))
}

describe('planBouquet', () => {
  const now = 8000

  it('returns nothing when the garden is empty', () => {
    expect(planBouquet(newGarden(), now)).toEqual([])
  })

  it('returns nothing when there are fewer than 6 living flowers', () => {
    const garden = newGarden()
    garden.restorePlants(fillBed('f0', 4).concat(fillBed('f1', 1, 10)))
    expect(planBouquet(garden, now)).toHaveLength(0)
  })

  it('returns nothing when one full patch cannot supply 6 (max 4 per bed)', () => {
    const garden = newGarden()
    garden.restorePlants(fillBed('f0', 6))
    expect(planBouquet(garden, now)).toHaveLength(0)
  })

  it('picks from the fullest beds first, at most 4 per patch', () => {
    const garden = newGarden()
    garden.restorePlants([
      ...fillBed('f0', 8),
      ...fillBed('f1', 3, 20),
      ...fillBed('b0', 2, 40),
    ])
    const picks = planBouquet(garden, now)
    expect(picks).toHaveLength(4 + 3 + 2)
    expect(picks.filter((p) => p.bedId === 'f0')).toHaveLength(MAX_PER_BED)
    expect(picks.filter((p) => p.bedId === 'f1')).toHaveLength(3)
    expect(picks.filter((p) => p.bedId === 'b0')).toHaveLength(2)
  })

  it('caps the bouquet at 12', () => {
    const garden = newGarden()
    garden.restorePlants([
      ...fillBed('f0', 5),
      ...fillBed('f1', 5, 10),
      ...fillBed('f2', 5, 20),
      ...fillBed('f3', 5, 30),
    ])
    const picks = planBouquet(garden, now)
    expect(picks).toHaveLength(MAX_BOUQUET)
    const perBed = new Map<string, number>()
    for (const p of picks) perBed.set(p.bedId, (perBed.get(p.bedId) ?? 0) + 1)
    for (const n of perBed.values()) expect(n).toBeLessThanOrEqual(MAX_PER_BED)
  })

  it('ignores wilted flowers and grass', () => {
    const garden = newGarden()
    garden.restorePlants([
      ...fillBed('f0', 3),
      ...fillBed('f1', 3, 10),
      flower('f0', 80, { wiltStarted: now - 100 }),
      {
        type: 'grass',
        x: 30,
        y: 50,
        bedId: 'f0',
        variant: 1,
        born: 1000,
        wiltStarted: null,
      },
    ])
    expect(planBouquet(garden, now)).toHaveLength(MIN_BOUQUET)
  })
})

describe('Garden.removePlant', () => {
  it('drops the plant from the flat list and the bed list', () => {
    const garden = newGarden()
    const plants = fillBed('f0', 2)
    garden.restorePlants(plants)
    garden.removePlant(garden.plants[0]!)
    expect(garden.plants).toHaveLength(1)
    expect(garden.plantsInBed('f0')).toHaveLength(1)
  })
})

describe('ForageRun', () => {
  it('sniffs and leaves without harvesting when the plan is empty', () => {
    const garden = newGarden()
    garden.restorePlants(fillBed('f0', 3))
    const run = new ForageRun(garden, [], 0)
    let now = 0
    let done = false
    let mailed = false
    const poses = new Set<string>()
    for (let i = 0; i < 400; i++) {
      now += 48
      const ev = run.tick(now)
      if (!run.done) poses.add(run.view(now).pose)
      if (ev?.type === 'mail') mailed = true
      if (ev?.type === 'done') {
        done = true
        expect(ev.mailed).toBe(false)
        break
      }
    }
    expect(done).toBe(true)
    expect(mailed).toBe(false)
    expect(poses.has('sniff')).toBe(true)
    expect(poses.has('mail')).toBe(false)
    expect(garden.plants).toHaveLength(3)
  })

  it('harvests planned flowers and mails a bouquet', () => {
    const garden = newGarden()
    const plants = [...fillBed('f0', 4), ...fillBed('f1', 4, 10)]
    garden.restorePlants(plants)
    const picks = planBouquet(garden, 8000)
    expect(picks).toHaveLength(8)
    const run = new ForageRun(garden, picks, 0)
    let now = 0
    let picksSeen = 0
    let mailed = false
    let done = false
    const poses = new Set<string>()
    for (let i = 0; i < 2500; i++) {
      now += 48
      const ev = run.tick(now)
      if (!run.done) poses.add(run.view(now).pose)
      if (ev?.type === 'pick') picksSeen += 1
      if (ev?.type === 'mail') mailed = true
      if (ev?.type === 'done') {
        done = true
        expect(ev.mailed).toBe(true)
        break
      }
    }
    expect(done).toBe(true)
    expect(mailed).toBe(true)
    expect(poses.has('mail')).toBe(true)
    expect(picksSeen).toBe(8)
    expect(garden.plants.filter((p) => p.type === 'flower')).toHaveLength(0)
    expect(run.bouquet).toHaveLength(8)
  })

  it('keeps the fox on gravel, never on a patch', () => {
    const garden = newGarden()
    const plants = [...fillBed('f0', 4), ...fillBed('b3', 4, 10)]
    garden.restorePlants(plants)
    const picks = planBouquet(garden, 8000)
    expect(picks).toHaveLength(8)
    const run = new ForageRun(garden, picks, 0)
    let now = 0
    for (let i = 0; i < 2500; i++) {
      now += 48
      const ev = run.tick(now)
      const v = run.view(now)
      expect(isGravel(v.foxX, v.foxY), `${v.foxX.toFixed(1)},${v.foxY.toFixed(1)}`).toBe(true)
      if (ev?.type === 'done') break
    }
    expect(run.done).toBe(true)
  })
})

describe('gravel walks', () => {
  it('stands beside a bed, not in the soil', () => {
    const back = foxStandForBed(bedById('b1'))
    const front = foxStandForBed(bedById('f2'))
    expect(isGravel(back.x, back.y)).toBe(true)
    expect(isGravel(front.x, front.y)).toBe(true)
    expect(back.y).toBeLessThan(GRID_PAD_TOP)
    expect(front.y).toBe(foxLaneBottom())
    expect(front.y).toBeGreaterThanOrEqual(GRID_PAD_TOP + PATCH_H * 2 + GRID_GAP)
  })

  it('routes between rows through an alley, not through timber', () => {
    const from = foxStandForBed(bedById('b0'))
    const to = foxStandForBed(bedById('f3'))
    const path = gravelWalk(from.x, from.y, to.x, to.y)
    expect(path.length).toBeGreaterThan(1)
    for (const p of path) expect(isGravel(p.x, p.y), `${p.x},${p.y}`).toBe(true)
    const ys = new Set(path.map((p) => p.y))
    expect(ys.has(from.y)).toBe(true)
    expect(ys.has(to.y)).toBe(true)
  })
})

describe('mailbox on gravel', () => {
  it('sits entirely above the patches', () => {
    const x0 = MAILBOX.x
    const y0 = MAILBOX.y
    const x1 = MAILBOX.x + MAILBOX_W
    const y1 = MAILBOX.y + MAILBOX_H
    for (const bed of GARDEN_BEDS) {
      const overlap =
        x0 < bed.x + bed.w && x1 > bed.x && y0 < bed.y + bed.h && y1 > bed.y
      expect(overlap, bed.id).toBe(false)
    }
    expect(y1).toBeLessThanOrEqual(GRID_PAD_TOP)
    expect(GRID_PAD_TOP + PATCH_H * 2 + GRID_GAP + GRID_PAD_BOTTOM).toBe(200)
  })
})
