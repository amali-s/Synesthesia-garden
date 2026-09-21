import { Euler, type PerspectiveCamera } from 'three'
import { FLOWER_KINDS, type FlowerKind } from '../sprites'
import type { FlowerPlant } from '../world'

/** Seat-height camera; never translates. */
export const LOOK_EYE_Y = 1.2

/** Radians. Slightly more room to look up at tall blooms than down at gravel. */
export const LOOK_PITCH_MIN = (-40 * Math.PI) / 180
export const LOOK_PITCH_MAX = (50 * Math.PI) / 180

/** Pixels of movement before a pointer-down becomes a look-drag, not a click. */
export const LOOK_DRAG_PX = 8

/** Radians per pixel; mouse and one-finger touch share this. */
export const LOOK_SENS = 0.0075

/** Idle sine on top of the user’s yaw (radians). */
export const LOOK_DRIFT_YAW = 0.018

/** Idle sine on top of the user’s pitch (radians). */
export const LOOK_DRIFT_PITCH = 0.01

/**
 * Default pitch so (0, 1.2, 0) still gazes toward (0, 0.9, -4) — slightly down
 * the ring, matching the seated lookAt from construction.
 */
export const LOOK_DEFAULT_PITCH = -Math.atan2(0.3, 4)

const TAU = Math.PI * 2

export function wrapYaw(yaw: number): number {
  return ((yaw % TAU) + TAU) % TAU
}

export function clampPitch(pitch: number): number {
  return Math.min(LOOK_PITCH_MAX, Math.max(LOOK_PITCH_MIN, pitch))
}

export function pointerToNdc(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  }
}

/**
 * Map an InstancedMesh raycast hit to the plant written at that instanceId.
 * Bloom meshes are checked by the caller first; this only resolves one hit.
 */
export function flowerFromInstance(
  object: object,
  instanceId: number | undefined,
  blooms: Readonly<Record<FlowerKind, { readonly mesh: object }>>,
  bloomAt: Readonly<Record<FlowerKind, ReadonlyArray<FlowerPlant | undefined>>>,
  stem: object,
  stemAt: ReadonlyArray<FlowerPlant | undefined>,
  leaves?: Readonly<Record<FlowerKind, { readonly mesh: object }>>,
  leafAt?: Readonly<Record<FlowerKind, ReadonlyArray<FlowerPlant | undefined>>>,
): FlowerPlant | null {
  if (instanceId == null || instanceId < 0) return null
  for (const kind of FLOWER_KINDS) {
    if (object === blooms[kind].mesh) return bloomAt[kind][instanceId] ?? null
  }
  if (leaves && leafAt) {
    for (const kind of FLOWER_KINDS) {
      if (object === leaves[kind].mesh) return leafAt[kind][instanceId] ?? null
    }
  }
  if (object === stem) return stemAt[instanceId] ?? null
  return null
}

type LookTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

/**
 * Drag-to-look for Among them. No pointer lock — that would steal hover-chime.
 * Camera stays on the stone seat; yaw wraps; pitch cannot go upside down.
 */
export class LookControl {
  /** True while the active pointer has moved past {@link LOOK_DRAG_PX}. */
  isDragging = false
  /**
   * True if the current or last gesture counted as a look, not a click.
   * Survives pointerup so click handlers can ignore a finished drag.
   */
  didDrag = false

  private yaw = 0
  private pitch = LOOK_DEFAULT_PITCH
  private time = 0
  private reducedMotion = false
  private target: LookTarget | null = null
  private pointerId: number | null = null
  private lastX = 0
  private lastY = 0
  private downX = 0
  private downY = 0
  private readonly euler = new Euler(0, 0, 0, 'YXZ')
  private readonly onDown = (e: Event) => this.handleDown(e as PointerEvent)
  private readonly onMove = (e: Event) => this.handleMove(e as PointerEvent)
  private readonly onUp = (e: Event) => this.handleUp(e as PointerEvent)

  attach(target: LookTarget): void {
    this.dispose()
    this.target = target
    target.addEventListener('pointerdown', this.onDown)
    target.addEventListener('pointermove', this.onMove)
    target.addEventListener('pointerup', this.onUp)
    target.addEventListener('pointercancel', this.onUp)
    target.addEventListener('pointerleave', this.onUp)
  }

  update(dt: number, reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion
    if (!Number.isFinite(dt) || dt <= 0) return
    this.time += Math.min(dt, 0.1)
  }

  apply(camera: PerspectiveCamera): void {
    camera.position.set(0, LOOK_EYE_Y, 0)
    let yaw = this.yaw
    let pitch = this.pitch
    if (!this.reducedMotion && !this.isDragging) {
      yaw += Math.sin(this.time * 0.22) * LOOK_DRIFT_YAW
      pitch = clampPitch(pitch + Math.sin(this.time * 0.17 + 1.3) * LOOK_DRIFT_PITCH)
    }
    this.euler.set(pitch, yaw, 0, 'YXZ')
    camera.quaternion.setFromEuler(this.euler)
  }

  dispose(): void {
    const target = this.target
    if (!target) return
    target.removeEventListener('pointerdown', this.onDown)
    target.removeEventListener('pointermove', this.onMove)
    target.removeEventListener('pointerup', this.onUp)
    target.removeEventListener('pointercancel', this.onUp)
    target.removeEventListener('pointerleave', this.onUp)
    this.target = null
    this.pointerId = null
    this.isDragging = false
  }

  private handleDown(e: PointerEvent): void {
    if (this.pointerId !== null) return
    this.pointerId = e.pointerId
    this.didDrag = false
    this.isDragging = false
    this.downX = e.clientX
    this.downY = e.clientY
    this.lastX = e.clientX
    this.lastY = e.clientY
  }

  private handleMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return
    const dx = e.clientX - this.lastX
    const dy = e.clientY - this.lastY
    this.lastX = e.clientX
    this.lastY = e.clientY
    if (!this.isDragging) {
      const dist = Math.hypot(e.clientX - this.downX, e.clientY - this.downY)
      if (dist < LOOK_DRAG_PX) return
      this.isDragging = true
      this.didDrag = true
    }
    this.yaw = wrapYaw(this.yaw - dx * LOOK_SENS)
    this.pitch = clampPitch(this.pitch - dy * LOOK_SENS)
  }

  private handleUp(e: PointerEvent): void {
    if (this.pointerId === null) return
    if (e.pointerId !== this.pointerId) return
    this.pointerId = null
    this.isDragging = false
  }
}
