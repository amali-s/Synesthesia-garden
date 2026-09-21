import { beforeEach, describe, expect, it } from 'vitest'
import { noteNameFromHz, pitchNorm, type PitchSample } from '../audio/pitch'
import { bedFromPitch } from './beds'
import {
  Garden,
  GLOW_PULSE_MS,
  SINGING_HOLD_MS,
  centsBetweenHz,
  findLivingPitchMatch,
  flowerGlow,
  type FlowerPlant,
} from './world'

/** Frame delta the garden accepts without clamping (tick caps dt at 48 ms). */
const FRAME_MS = 40

function silence(): PitchSample {
  return {
    hz: null,
    pitchT: 0,
    rms: 0.001,
    isVoice: false,
    loudnessT: 0,
    timbreT: 0.5,
    centroidHz: null,
    onset: false,
    durationMs: 0,
    panT: 0.5,
    bpm: null,
    spawnScale: 1,
    percussive: false,
    sectionEnergyT: 0,
  }
}

function sung(hz: number, overrides: Partial<PitchSample> = {}): PitchSample {
  return {
    ...silence(),
    hz,
    pitchT: pitchNorm(hz),
    rms: 0.08,
    isVoice: true,
    loudnessT: 0.5,
    timbreT: 0.4,
    centroidHz: 900,
    durationMs: 120,
    ...overrides,
  }
}

/** What `PitchDetector` emits for a drum hit: pitch guess, but `isVoice` is off. */
function drumHit(): PitchSample {
  return sung(180, { isVoice: false, percussive: true, onset: true, timbreT: 0.85 })
}

function newGarden(): Garden {
  return new Garden({ width: 320, height: 200 })
}

/** Advance one frame and feed a sample, the way the rAF loop does. */
function frame(garden: Garden, sample: PitchSample, now: number): void {
  garden.tick(now, true)
  garden.ingest(sample, now)
}

describe('Garden.ingest — flowers', () => {
  let garden: Garden

  beforeEach(() => {
    garden = newGarden()
  })

  it('plants a flower from a pitched voice sample', () => {
    frame(garden, sung(220), 1000)

    expect(garden.plants).toHaveLength(1)
    const plant = garden.plants[0]!
    expect(plant.type).toBe('flower')
    if (plant.type !== 'flower') return
    expect(plant.hz).toBe(220)
    expect(plant.bedId).toBe(bedFromPitch(pitchNorm(220)).id)
  })

  it('glows the same note instead of planting after cooldown', () => {
    frame(garden, sung(220), 1000)
    frame(garden, sung(220), 1050)
    expect(garden.plants).toHaveLength(1)

    frame(garden, sung(220), 1000 + 240)
    expect(garden.plants).toHaveLength(1)
    const plant = garden.plants[0] as FlowerPlant
    expect(plant.singingUntil).toBe(1000 + 240 + SINGING_HOLD_MS)
  })

  it('sends low and high pitch to different beds', () => {
    frame(garden, sung(100), 1000)
    frame(garden, sung(900), 1000 + 240)

    const beds = garden.plants.map((p) => p.bedId)
    expect(new Set(beds).size).toBe(2)
  })
})

function hzAtCents(baseHz: number, cents: number): number {
  return baseHz * 2 ** (cents / 1200)
}

function onlyFlower(garden: Garden): FlowerPlant {
  expect(garden.plants).toHaveLength(1)
  const plant = garden.plants[0]!
  expect(plant.type).toBe('flower')
  return plant as FlowerPlant
}

describe('Garden.ingest — unique pitch', () => {
  let garden: Garden

  beforeEach(() => {
    garden = newGarden()
  })

  it('does not spawn a second A4 within 50 cents; it glows instead', () => {
    frame(garden, sung(440, { loudnessT: 0.3, timbreT: 0.2 }), 1000)
    const first = onlyFlower(garden)
    const kind = first.kind
    const x = first.x
    const y = first.y

    frame(garden, sung(hzAtCents(440, 20), { loudnessT: 0.9, timbreT: 0.9, onset: true }), 1000 + 240)

    const plant = onlyFlower(garden)
    expect(plant.hz).toBe(440)
    expect(plant.loudnessT).toBe(0.3)
    expect(plant.timbreT).toBe(0.2)
    expect(plant.kind).toBe(kind)
    expect(plant.x).toBe(x)
    expect(plant.y).toBe(y)
    expect(plant.singingUntil).toBe(1240 + SINGING_HOLD_MS)
    expect(plant.glowPulseUntil).toBe(1240 + GLOW_PULSE_MS)
    expect(flowerGlow(plant, 1240).singing).toBe(1)
    expect(flowerGlow(plant, 1240).pulse).toBeCloseTo(1, 5)
  })

  it('glows a repeat even during spawn cooldown', () => {
    frame(garden, sung(440), 1000)
    frame(garden, sung(442), 1050)

    const plant = onlyFlower(garden)
    expect(plant.singingUntil).toBe(1050 + SINGING_HOLD_MS)
    expect(plant.glowPulseUntil).toBe(0)
  })

  it('plants A5 as a new flower beside A4', () => {
    frame(garden, sung(440), 1000)
    frame(garden, sung(880), 1000 + 240)

    expect(garden.plants).toHaveLength(2)
    const notes = garden.plants.map((p) => {
      expect(p.type).toBe('flower')
      return noteNameFromHz((p as FlowerPlant).hz)
    })
    expect(notes.sort()).toEqual(['A4', 'A5'])
  })

  it('can plant two A4s at opposite edges of the 50-cent window', () => {
    const low = hzAtCents(440, -49)
    const high = hzAtCents(440, 49)
    expect(noteNameFromHz(low)).toBe('A4')
    expect(noteNameFromHz(high)).toBe('A4')
    expect(centsBetweenHz(low, high)).toBeGreaterThan(50)

    frame(garden, sung(low), 1000)
    frame(garden, sung(high), 1000 + 240)

    expect(garden.plants).toHaveLength(2)
    expect(garden.plants.every((p) => p.type === 'flower')).toBe(true)
  })

  it('picks the closest living match when several sit inside the window', () => {
    const near = hzAtCents(440, -20)
    const far = hzAtCents(440, 40)
    frame(garden, sung(near), 1000)
    frame(garden, sung(far), 1000 + 240)
    expect(garden.plants).toHaveLength(2)

    frame(garden, sung(440, { onset: true }), 1000 + 480)
    expect(garden.plants).toHaveLength(2)
    const match = findLivingPitchMatch(garden.plants, 440)
    expect(match?.hz).toBe(near)
    expect(match?.singingUntil).toBe(1480 + SINGING_HOLD_MS)
    expect(match?.glowPulseUntil).toBe(1480 + GLOW_PULSE_MS)
  })

  it('can plant the same note again after it has wilted', () => {
    frame(garden, sung(440), 1000)
    const first = onlyFlower(garden)
    first.wiltStarted = 1000

    frame(garden, sung(440), 1000 + 240)
    const living = garden.plants.filter((p) => p.type === 'flower' && p.wiltStarted === null)
    expect(living).toHaveLength(1)
    expect(living[0]).not.toBe(first)
  })
})

describe('centsBetweenHz + findLivingPitchMatch', () => {
  it('measures 50 cents exactly at the match edge', () => {
    expect(centsBetweenHz(440, 440)).toBe(0)
    expect(centsBetweenHz(440, hzAtCents(440, 50))).toBeCloseTo(50, 8)
  })

  it('ignores wilted flowers and grass', () => {
    const garden = newGarden()
    garden.restorePlants([
      {
        type: 'flower',
        x: 40,
        y: 80,
        bedId: 'f0',
        kind: 'daisy',
        pitchT: 0.5,
        loudnessT: 0.5,
        timbreT: 0.4,
        hz: 440,
        born: 1000,
        baseHue: 20,
        wiltStarted: 1100,
        singingUntil: 0,
        glowPulseUntil: 0,
      },
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
    expect(findLivingPitchMatch(garden.plants, 440)).toBeNull()
  })
})

describe('Garden.ingest — grass in the gaps', () => {
  it('sprouts grass after a sustained pause', () => {
    const garden = newGarden()
    let now = 1000
    for (let i = 0; i < 14; i++) {
      now += FRAME_MS
      frame(garden, silence(), now)
    }

    expect(garden.plants.length).toBeGreaterThan(0)
    expect(garden.plants.every((p) => p.type === 'grass')).toBe(true)
  })

  it('does not sprout grass from a couple of quiet frames', () => {
    const garden = newGarden()
    let now = 1000
    for (let i = 0; i < 3; i++) {
      now += FRAME_MS
      frame(garden, silence(), now)
    }

    expect(garden.plants).toHaveLength(0)
  })
})

describe('Garden.ingest — percussion is motion only', () => {
  it('does not plant a flower from a drum frame', () => {
    const garden = newGarden()
    frame(garden, drumHit(), 1000)

    expect(garden.plants.filter((p) => p.type === 'flower')).toHaveLength(0)
  })

  it('still records the onset so the bed can rustle', () => {
    const garden = newGarden()
    frame(garden, drumHit(), 1000)

    expect(garden.lastOnset).toBe(1000)
  })

  it('plants nothing over a whole bar of drums', () => {
    const garden = newGarden()
    let now = 1000
    for (let i = 0; i < 8; i++) {
      now += 250
      frame(garden, drumHit(), now)
    }

    expect(garden.plants.filter((p) => p.type === 'flower')).toHaveLength(0)
  })
})

describe('Garden.clear', () => {
  it('empties the plants', () => {
    const garden = newGarden()
    frame(garden, sung(220), 1000)
    frame(garden, sung(440), 1000 + 240)
    expect(garden.plants.length).toBeGreaterThan(0)

    garden.clear()
    expect(garden.plants).toHaveLength(0)
  })

  it('leaves the listen-time sky clock running', () => {
    const garden = newGarden()
    let now = 1000
    for (let i = 0; i < 5; i++) {
      now += FRAME_MS
      frame(garden, sung(220), now)
    }
    const listened = garden.listenMs
    expect(listened).toBeGreaterThan(0)

    garden.clear()
    expect(garden.listenMs).toBe(listened)
  })

  it('can restore a snapshot after a clear (Undo)', () => {
    const garden = newGarden()
    frame(garden, sung(220), 1000)
    const snapshot = garden.snapshotPlants()

    garden.clear()
    garden.restorePlants(snapshot)

    expect(garden.plants).toHaveLength(1)
    expect(garden.plantsInBed(snapshot[0]!.bedId)).toHaveLength(1)
  })
})

describe('Garden.hitFlowerAt', () => {
  it('picks the nearer bloom head when dest boxes overlap', () => {
    const garden = newGarden()
    const now = 4000
    const back: FlowerPlant = {
      type: 'flower',
      x: 50,
      y: 90,
      bedId: 'f0',
      kind: 'daisy',
      pitchT: 0.2,
      loudnessT: 0.9,
      timbreT: 0.4,
      hz: 220,
      born: now - 2000,
      baseHue: 20,
      wiltStarted: null,
      singingUntil: 0,
      glowPulseUntil: 0,
    }
    const front: FlowerPlant = {
      ...back,
      y: 112,
      hz: 330,
      kind: 'tulip',
    }
    garden.restorePlants([back, front])

    const overBackHead = garden.hitFlowerAt(50, 68, now)
    expect(overBackHead?.hz).toBe(220)

    const overFrontHead = garden.hitFlowerAt(50, 92, now)
    expect(overFrontHead?.hz).toBe(330)
  })
})
