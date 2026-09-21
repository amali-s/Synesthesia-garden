import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import type { FlowerPlant } from '../world'
import {
  LOOK_DEFAULT_PITCH,
  LOOK_DRAG_PX,
  LOOK_EYE_Y,
  LOOK_PITCH_MAX,
  LOOK_PITCH_MIN,
  LookControl,
  clampPitch,
  flowerFromInstance,
  pointerToNdc,
  wrapYaw,
} from './look'

class FakeTarget {
  private readonly map = new Map<string, Set<(e: Event) => void>>()

  addEventListener(type: string, fn: EventListenerOrEventListenerObject): void {
    const set = this.map.get(type) ?? new Set()
    set.add(fn as (e: Event) => void)
    this.map.set(type, set)
  }

  removeEventListener(type: string, fn: EventListenerOrEventListenerObject): void {
    this.map.get(type)?.delete(fn as (e: Event) => void)
  }

  emit(
    type: string,
    init: { clientX: number; clientY: number; pointerId?: number },
  ): void {
    const ev = {
      type,
      pointerId: init.pointerId ?? 1,
      clientX: init.clientX,
      clientY: init.clientY,
      pointerType: 'mouse',
    } as PointerEvent
    for (const fn of this.map.get(type) ?? []) fn(ev)
  }
}

function flower(kind: FlowerPlant['kind'] = 'daisy'): FlowerPlant {
  return {
    type: 'flower',
    x: 40,
    y: 80,
    bedId: 'f0',
    kind,
    pitchT: 0.25,
    loudnessT: 0.5,
    timbreT: 0.4,
    hz: 440,
    born: 1000,
    baseHue: 200,
    wiltStarted: null,
    singingUntil: 0,
    glowPulseUntil: 0,
  }
}

function direction(look: LookControl): Vector3 {
  const cam = new PerspectiveCamera()
  look.apply(cam)
  const dir = new Vector3()
  cam.getWorldDirection(dir)
  return dir
}

describe('wrapYaw', () => {
  it('wraps a full turn into [0, 2π)', () => {
    expect(wrapYaw(0)).toBeCloseTo(0, 8)
    expect(wrapYaw(Math.PI * 2)).toBeCloseTo(0, 8)
    expect(wrapYaw(-0.2)).toBeCloseTo(Math.PI * 2 - 0.2, 8)
    expect(wrapYaw(Math.PI * 2 + 0.3)).toBeCloseTo(0.3, 8)
  })
})

describe('clampPitch', () => {
  it('keeps the view from going upside down', () => {
    expect(clampPitch(0)).toBe(0)
    expect(clampPitch(LOOK_PITCH_MIN - 1)).toBe(LOOK_PITCH_MIN)
    expect(clampPitch(LOOK_PITCH_MAX + 1)).toBe(LOOK_PITCH_MAX)
    expect(LOOK_PITCH_MIN).toBeCloseTo((-40 * Math.PI) / 180, 8)
    expect(LOOK_PITCH_MAX).toBeCloseTo((50 * Math.PI) / 180, 8)
  })
})

describe('pointerToNdc', () => {
  it('maps the canvas rect, not a second surface', () => {
    const rect = { left: 10, top: 20, width: 200, height: 100 }
    expect(pointerToNdc(10, 20, rect)).toEqual({ x: -1, y: 1 })
    expect(pointerToNdc(210, 120, rect)).toEqual({ x: 1, y: -1 })
    expect(pointerToNdc(110, 70, rect)?.x).toBeCloseTo(0, 8)
    expect(pointerToNdc(110, 70, rect)?.y).toBeCloseTo(0, 8)
  })

  it('returns null for an empty rect', () => {
    expect(pointerToNdc(1, 1, { left: 0, top: 0, width: 0, height: 10 })).toBeNull()
  })
})

describe('flowerFromInstance', () => {
  const daisyMesh = { name: 'daisy' }
  const tulipMesh = { name: 'tulip' }
  const stemMesh = { name: 'stem' }
  const grass = { name: 'grass' }
  const daisy = flower('daisy')
  const tulip = flower('tulip')
  const blooms = {
    daisy: { mesh: daisyMesh },
    tulip: { mesh: tulipMesh },
    bell: { mesh: { name: 'bell' } },
    rose: { mesh: { name: 'rose' } },
    star: { mesh: { name: 'star' } },
    poppy: { mesh: { name: 'poppy' } },
    orchid: { mesh: { name: 'orchid' } },
  }
  const bloomAt = {
    daisy: [daisy],
    tulip: [tulip],
    bell: [],
    rose: [],
    star: [],
    poppy: [],
    orchid: [],
  }
  const stemAt = [daisy, tulip]

  it('resolves bloom instanceId before treating the object as a stem', () => {
    expect(flowerFromInstance(daisyMesh, 0, blooms, bloomAt, stemMesh, stemAt)).toBe(daisy)
    expect(flowerFromInstance(tulipMesh, 0, blooms, bloomAt, stemMesh, stemAt)).toBe(tulip)
  })

  it('falls back to stems and misses empty / unknown meshes', () => {
    expect(flowerFromInstance(stemMesh, 1, blooms, bloomAt, stemMesh, stemAt)).toBe(tulip)
    expect(flowerFromInstance(stemMesh, 9, blooms, bloomAt, stemMesh, stemAt)).toBeNull()
    expect(flowerFromInstance(grass, 0, blooms, bloomAt, stemMesh, stemAt)).toBeNull()
    expect(flowerFromInstance(daisyMesh, undefined, blooms, bloomAt, stemMesh, stemAt)).toBeNull()
  })

  it('resolves foliage hits when leaf pools are provided', () => {
    const daisyLeaf = { name: 'daisy-leaf' }
    const leaves = {
      daisy: { mesh: daisyLeaf },
      tulip: { mesh: { name: 'tulip-leaf' } },
      bell: { mesh: { name: 'bell-leaf' } },
      rose: { mesh: { name: 'rose-leaf' } },
      star: { mesh: { name: 'star-leaf' } },
      poppy: { mesh: { name: 'poppy-leaf' } },
      orchid: { mesh: { name: 'orchid-leaf' } },
    }
    const leafAt = {
      daisy: [daisy],
      tulip: [],
      bell: [],
      rose: [],
      star: [],
      poppy: [],
      orchid: [],
    }
    expect(flowerFromInstance(daisyLeaf, 0, blooms, bloomAt, stemMesh, stemAt, leaves, leafAt)).toBe(
      daisy,
    )
  })
})

describe('LookControl', () => {
  it('stays on the seat and faces −Z, slightly down', () => {
    const look = new LookControl()
    const cam = new PerspectiveCamera()
    look.apply(cam)
    expect(cam.position.x).toBe(0)
    expect(cam.position.y).toBe(LOOK_EYE_Y)
    expect(cam.position.z).toBe(0)
    const dir = new Vector3()
    cam.getWorldDirection(dir)
    expect(dir.z).toBeLessThan(-0.9)
    expect(dir.y).toBeLessThan(0)
    expect(Math.abs(dir.x)).toBeLessThan(0.05)
    expect(LOOK_DEFAULT_PITCH).toBeLessThan(0)
  })

  it('does not start a drag until the pointer moves a few pixels', () => {
    const target = new FakeTarget()
    const look = new LookControl()
    look.attach(target)
    target.emit('pointerdown', { clientX: 40, clientY: 40 })
    target.emit('pointermove', { clientX: 40 + LOOK_DRAG_PX - 2, clientY: 40 })
    expect(look.isDragging).toBe(false)
    expect(look.didDrag).toBe(false)
    target.emit('pointermove', { clientX: 40 + LOOK_DRAG_PX + 4, clientY: 40 })
    expect(look.isDragging).toBe(true)
    expect(look.didDrag).toBe(true)
  })

  it('looks right when dragged right, and keeps didDrag after pointerup', () => {
    const target = new FakeTarget()
    const look = new LookControl()
    look.attach(target)
    target.emit('pointerdown', { clientX: 80, clientY: 80 })
    target.emit('pointermove', { clientX: 160, clientY: 80 })
    expect(direction(look).x).toBeGreaterThan(0.2)
    target.emit('pointerup', { clientX: 160, clientY: 80 })
    expect(look.isDragging).toBe(false)
    expect(look.didDrag).toBe(true)
    expect(direction(look).x).toBeGreaterThan(0.2)
  })

  it('clamps pitch so a huge vertical drag cannot flip the camera', () => {
    const target = new FakeTarget()
    const look = new LookControl()
    look.attach(target)
    target.emit('pointerdown', { clientX: 80, clientY: 80 })
    target.emit('pointermove', { clientX: 80, clientY: 80 + 4000 })
    const down = direction(look)
    expect(down.y).toBeLessThan(0)
    expect(down.y).toBeGreaterThan(-0.8)
    target.emit('pointerup', { clientX: 80, clientY: 4080 })
    target.emit('pointerdown', { clientX: 80, clientY: 80, pointerId: 2 })
    target.emit('pointermove', { clientX: 80, clientY: 80 - 4000, pointerId: 2 })
    const up = direction(look)
    expect(up.y).toBeGreaterThan(0)
    expect(up.y).toBeLessThan(0.85)
  })

  it('never translates the camera', () => {
    const target = new FakeTarget()
    const look = new LookControl()
    look.attach(target)
    target.emit('pointerdown', { clientX: 10, clientY: 10 })
    target.emit('pointermove', { clientX: 200, clientY: 90 })
    const cam = new PerspectiveCamera()
    look.apply(cam)
    expect(cam.position.toArray()).toEqual([0, LOOK_EYE_Y, 0])
  })

  it('idles a little unless reduced motion is on', () => {
    const look = new LookControl()
    const cam = new PerspectiveCamera()
    look.update(1, false)
    look.apply(cam)
    const a = cam.quaternion.clone()
    look.update(1, false)
    look.apply(cam)
    expect(cam.quaternion.equals(a)).toBe(false)

    const still = new LookControl()
    still.update(1, true)
    still.apply(cam)
    const b = cam.quaternion.clone()
    still.update(1, true)
    still.apply(cam)
    expect(cam.quaternion.equals(b)).toBe(true)
  })

  it('ignores a second finger and drops listeners on dispose', () => {
    const target = new FakeTarget()
    const look = new LookControl()
    look.attach(target)
    target.emit('pointerdown', { clientX: 50, clientY: 50, pointerId: 1 })
    target.emit('pointerdown', { clientX: 90, clientY: 50, pointerId: 2 })
    target.emit('pointermove', { clientX: 90, clientY: 50, pointerId: 2 })
    expect(look.isDragging).toBe(false)
    look.dispose()
    target.emit('pointermove', { clientX: 200, clientY: 50, pointerId: 1 })
    expect(look.isDragging).toBe(false)
  })
})
