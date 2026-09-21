import { describe, expect, it } from 'vitest'
import { FOX_ENTER, FOX_SNIFF } from '../critters'
import { ForageRun, planBouquet, type ForageView } from '../forage'
import { Garden, type FlowerPlant } from '../world'
import { plantToWorld, RING_RADIUS } from './layout'
import {
  FOX_ENTER_WORLD,
  FOX_MAIL_WORLD,
  FOX_SNIFF_WORLD,
  MAILBOX_WORLD,
  foxWorldPose,
  walkProgress,
  worldForLandmark,
} from './forage3d'

function flower(overrides: Partial<FlowerPlant> = {}): FlowerPlant {
  return {
    type: 'flower',
    x: 40,
    y: 80,
    bedId: 'f0',
    kind: 'daisy',
    pitchT: 0.2,
    loudnessT: 0.4,
    timbreT: 0.4,
    hz: 220,
    born: 1000,
    baseHue: 20,
    wiltStarted: null,
    singingUntil: 0,
    glowPulseUntil: 0,
    ...overrides,
  }
}

function fillBed(bedId: FlowerPlant['bedId'], n: number, start = 0): FlowerPlant[] {
  return Array.from({ length: n }, (_, i) =>
    flower({
      bedId,
      x: 20 + (start + i) * 6,
      y: 40 + (i % 3) * 8,
      pitchT: bedId.startsWith('b') ? 0.7 : 0.15,
      hz: 200 + i * 12,
      born: 1000 + i,
    }),
  )
}

function dummyView(partial: Partial<ForageView> & Pick<ForageView, 'ring'>): ForageView {
  return {
    foxX: FOX_ENTER.x,
    foxY: FOX_ENTER.y,
    facing: 1,
    frame: 0,
    pose: 'walk',
    bundle: [],
    lifting: null,
    liftX: 0,
    liftY: 0,
    mailboxFlag: false,
    ...partial,
  }
}

describe('mailbox world', () => {
  it('sits behind the origin on +Z, off the seat, inside the ring', () => {
    expect(MAILBOX_WORLD.x).toBeCloseTo(0, 8)
    expect(MAILBOX_WORLD.y).toBe(0)
    expect(MAILBOX_WORLD.z).toBeGreaterThan(2)
    expect(MAILBOX_WORLD.z).toBeLessThan(RING_RADIUS)
    const r = Math.hypot(MAILBOX_WORLD.x, MAILBOX_WORLD.z)
    expect(r).toBeGreaterThan(2.05)
    expect(r).toBeLessThan(RING_RADIUS)
  })
})

describe('worldForLandmark', () => {
  it('puts enter on the left (−X) rim', () => {
    const p = worldForLandmark({ kind: 'enter' })
    expect(p.x).toBeLessThan(-RING_RADIUS + 0.05)
    expect(p.x).toBeCloseTo(FOX_ENTER_WORLD.x, 8)
    expect(Math.abs(p.z)).toBeLessThan(1)
    expect(p.y).toBe(0)
  })

  it('puts sniff a few meters inward on the left', () => {
    const p = worldForLandmark({ kind: 'sniff' })
    expect(p.x).toBeGreaterThan(FOX_ENTER_WORLD.x)
    expect(p.x).toBeLessThan(-1)
    expect(p.x).toBeCloseTo(FOX_SNIFF_WORLD.x, 8)
    expect(p.y).toBe(0)
  })

  it('puts mail next to the mailbox', () => {
    const p = worldForLandmark({ kind: 'mail' })
    const d = Math.hypot(p.x - MAILBOX_WORLD.x, p.z - MAILBOX_WORLD.z)
    expect(d).toBeGreaterThan(0.25)
    expect(d).toBeLessThan(1.2)
    expect(p.x).toBeCloseTo(FOX_MAIL_WORLD.x, 8)
    expect(p.y).toBe(0)
  })

  it('picks using plantToWorld xz, ignoring bedId soil', () => {
    const a = flower({ bedId: 'f0', x: 12, y: 24, pitchT: 0.42, hz: 330, born: 40 })
    const b = flower({ bedId: 'b3', x: 210, y: 170, pitchT: 0.42, hz: 330, born: 40 })
    const wa = worldForLandmark({ kind: 'pick', plant: a })
    const wb = worldForLandmark({ kind: 'pick', plant: b })
    const ring = plantToWorld(a)
    expect(wa.x).toBeCloseTo(ring.x, 8)
    expect(wa.z).toBeCloseTo(ring.z, 8)
    expect(wa.y).toBe(0)
    expect(wa.x).toBeCloseTo(wb.x, 8)
    expect(wa.z).toBeCloseTo(wb.z, 8)
    expect(wa.x).not.toBeCloseTo(a.x, 0)
  })
})

describe('foxWorldPose', () => {
  it('starts at the left rim, not the origin', () => {
    const view = dummyView({
      pose: 'walk',
      foxX: FOX_ENTER.x,
      foxY: FOX_ENTER.y,
      ring: { from: { kind: 'enter' }, to: { kind: 'sniff' }, pickT: 0 },
    })
    const pose = foxWorldPose(view)
    expect(pose.x).toBeCloseTo(FOX_ENTER_WORLD.x, 5)
    expect(pose.z).toBeCloseTo(FOX_ENTER_WORLD.z, 5)
    expect(Math.hypot(pose.x, pose.z)).toBeGreaterThan(1)
  })

  it('sits at the plant on the ring while picking', () => {
    const plant = flower({ bedId: 'f1', x: 80, y: 90, pitchT: 0.31, hz: 392, born: 9 })
    const view = dummyView({
      pose: 'pick',
      ring: { from: { kind: 'enter' }, to: { kind: 'pick', plant }, pickT: 0.5 },
    })
    const pose = foxWorldPose(view)
    const ring = plantToWorld(plant)
    expect(pose.x).toBeCloseTo(ring.x, 8)
    expect(pose.z).toBeCloseTo(ring.z, 8)
    expect(pose.y).toBe(0)
  })

  it('lerps in xz with the same t as the 2D walk', () => {
    const from = { kind: 'enter' as const }
    const to = { kind: 'sniff' as const }
    const midX = (FOX_ENTER.x + FOX_SNIFF.x) / 2
    const t = walkProgress(midX, FOX_ENTER.y, from, to)
    expect(t).toBeGreaterThan(0.35)
    expect(t).toBeLessThan(0.65)
    const view = dummyView({
      pose: 'walk',
      foxX: midX,
      foxY: FOX_ENTER.y,
      ring: { from, to, pickT: 0 },
    })
    const pose = foxWorldPose(view)
    expect(pose.x).toBeCloseTo(FOX_ENTER_WORLD.x + (FOX_SNIFF_WORLD.x - FOX_ENTER_WORLD.x) * t, 5)
    expect(pose.z).toBeCloseTo(FOX_ENTER_WORLD.z + (FOX_SNIFF_WORLD.z - FOX_ENTER_WORLD.z) * t, 5)
  })
})

describe('ForageRun mapping', () => {
  it('sniff-and-leave walks left, sniffs, and returns to enter', () => {
    const garden = new Garden({ width: 320, height: 200 })
    const run = new ForageRun(garden, [], 0)
    const start = foxWorldPose(run.view(0))
    expect(start.x).toBeLessThan(-4)

    let now = 0
    let sawSniff = false
    for (let i = 0; i < 800; i++) {
      now += 48
      run.tick(now)
      const v = run.view(now)
      const pose = foxWorldPose(v)
      expect(Number.isFinite(pose.x)).toBe(true)
      if (v.pose === 'sniff' && v.ring.to.kind === 'sniff') {
        sawSniff = true
        expect(pose.x).toBeCloseTo(FOX_SNIFF_WORLD.x, 4)
        expect(pose.x).toBeGreaterThan(-RING_RADIUS)
        expect(pose.x).toBeLessThan(-1)
      }
      if (run.done) break
    }
    expect(sawSniff).toBe(true)
    expect(run.done).toBe(true)
    expect(garden.plants).toHaveLength(0)
  })

  it('pick pose uses the plant ring, not the bed’s soil pixels', () => {
    const garden = new Garden({ width: 320, height: 200 })
    const plants = [...fillBed('f0', 4), ...fillBed('b0', 4, 10)]
    garden.restorePlants(plants)
    const picks = planBouquet(garden, 8000)
    expect(picks.length).toBeGreaterThanOrEqual(6)
    const run = new ForageRun(garden, picks, 0)
    let now = 0
    let sawPick = false
    for (let i = 0; i < 2500; i++) {
      now += 48
      run.tick(now)
      const v = run.view(now)
      if (v.pose === 'pick' && v.ring.to.kind === 'pick') {
        sawPick = true
        const pose = foxWorldPose(v)
        const ring = plantToWorld(v.ring.to.plant)
        expect(pose.x).toBeCloseTo(ring.x, 5)
        expect(pose.z).toBeCloseTo(ring.z, 5)
        expect(pose.x).not.toBeCloseTo(v.foxX, 0)
        break
      }
      if (run.done) break
    }
    expect(sawPick).toBe(true)
  })
})
