import { beforeEach, describe, expect, it } from 'vitest'
import { pitchNorm, type PitchSample } from '../audio/pitch'
import { bedFromPitch } from './beds'
import { Garden } from './world'

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

  it('respects the spawn cooldown between blooms', () => {
    frame(garden, sung(220), 1000)
    frame(garden, sung(220), 1050)
    expect(garden.plants).toHaveLength(1)

    frame(garden, sung(220), 1000 + 240)
    expect(garden.plants).toHaveLength(2)
  })

  it('sends low and high pitch to different beds', () => {
    frame(garden, sung(100), 1000)
    frame(garden, sung(900), 1000 + 240)

    const beds = garden.plants.map((p) => p.bedId)
    expect(new Set(beds).size).toBe(2)
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
