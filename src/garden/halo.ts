import { bloomHeadMask } from './bloomArt'
import { emissiveGlowPair, type Rgb } from './palette'
import type { FlowerKind } from './sprites'

/**
 * Logical pixels the glow stands out past the petal silhouette.
 * One cached sprite per flower kind and pitch class; glow only picks an alpha.
 */
export const BLOOM_HALO_SPREAD = 3

/** Canonical height of that sprite. Drawn scaled with the live bud, never rebuilt per frame. */
const REF_H = 36

/**
 * Fixed brightness steps for a resonating bloom.
 * The silhouette sprites stay as painted; glow only picks a step.
 */
export const HALO_ALPHA = [0.4, 0.62, 0.84, 1] as const

const PITCH_CLASSES = 12

type HaloField = {
  mask: Uint8Array
  refW: number
  refH: number
  spread: number
  cols: number
  rows: number
  cores: Array<{ x: number; y: number }>
}

const fields = new Map<FlowerKind, HaloField>()
const haloSprites = new Map<string, HTMLCanvasElement>()
const coreSprites: Array<HTMLCanvasElement | undefined> = new Array(PITCH_CLASSES)

/** Nearest pitch class, A = 0, same rounding as `noteNameFromHz`. */
export function pitchClassIndex(hz: number): number {
  if (!(hz > 0)) return 0
  const semis = 12 * Math.log2(hz / 440)
  return ((Math.round(semis) % PITCH_CLASSES) + PITCH_CLASSES) % PITCH_CLASSES
}

/** -1 when dark. Otherwise an index into {@link HALO_ALPHA}. */
export function glowStep(amount: number): number {
  if (!(amount > 0)) return -1
  const t = amount >= 1 ? 1 : amount
  if (t < 0.28) return 0
  if (t < 0.52) return 1
  if (t < 0.76) return 2
  return 3
}

/** Sheet pixels → the logical grid the flower is drawn on. A cell lights if any petal lands in it. */
export function downsampleBloomMask(
  mask: Uint8Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Uint8Array {
  const out = new Uint8Array(dw * dh)
  for (let y = 0; y < sh; y++) {
    const dy = Math.min(dh - 1, Math.floor((y * dh) / sh))
    for (let x = 0; x < sw; x++) {
      if (!mask[y * sw + x]) continue
      const dx = Math.min(dw - 1, Math.floor((x * dw) / sw))
      out[dy * dw + dx] = 1
    }
  }
  return out
}

/** One center per bloom on the stem (a bell plant can carry two). */
export function bloomCorePoints(
  mask: Uint8Array,
  width: number,
  height: number,
): Array<{ x: number; y: number }> {
  const seen = new Uint8Array(mask.length)
  const cores: Array<{ x: number; y: number }> = []
  const stack: number[] = []
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue
    stack.push(i)
    seen[i] = 1
    let n = 0
    let sx = 0
    let sy = 0
    while (stack.length) {
      const p = stack.pop()!
      const x = p % width
      const y = (p / width) | 0
      n++
      sx += x
      sy += y
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue
          const nx = x + ox
          const ny = y + oy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const np = ny * width + nx
          if (!mask[np] || seen[np]) continue
          seen[np] = 1
          stack.push(np)
        }
      }
    }
    if (n >= 2) cores.push({ x: sx / n, y: sy / n })
  }
  return cores
}

/**
 * Dithered rim around petal pixels. The interior stays empty so the light
 * contorts to the bud instead of filling a disc. Alpha is only 0 or 255.
 */
export function paintBloomHalo(
  mask: Uint8Array,
  width: number,
  height: number,
  spread: number,
  body: Rgb,
  core: Rgb,
): Uint8ClampedArray {
  const cols = width + spread * 2
  const rows = height + spread * 2
  const data = new Uint8ClampedArray(cols * rows * 4)
  const bloom: Array<[number, number]> = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) bloom.push([x, y])
    }
  }
  if (bloom.length === 0) return data
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const mx = x - spread
      const my = y - spread
      if (mx >= 0 && my >= 0 && mx < width && my < height && mask[my * width + mx]) continue
      let dist = Infinity
      for (const [bx, by] of bloom) {
        const ddx = mx - bx
        const ddy = my - by
        const d = Math.hypot(ddx, ddy)
        if (d < dist) dist = d
      }
      if (dist > spread) continue
      const sample = rimSample(mx, my, dist / spread, body, core)
      if (!sample) continue
      writePixel(data, cols, x, y, sample)
    }
  }
  return data
}

/** 3×3 plus of the core color. Corners stay empty so the spark stays tiny. */
export function paintCorePixels(core: Rgb): Uint8ClampedArray {
  const size = 3
  const data = new Uint8ClampedArray(size * size * 4)
  writePixel(data, size, 1, 0, core)
  writePixel(data, size, 0, 1, core)
  writePixel(data, size, 1, 1, core)
  writePixel(data, size, 2, 1, core)
  writePixel(data, size, 1, 2, core)
  return data
}

/**
 * Additive halo under the bloom, in the bloom's local pixel space
 * (origin at the stem base). The sprite shares the flower's frame, padded
 * past the petals. Restores source-over before returning.
 */
export function drawHaloSprite(
  ctx: CanvasRenderingContext2D,
  scale: number,
  destW: number,
  destH: number,
  kind: FlowerKind,
  hz: number,
  resonance: number,
): void {
  const step = glowStep(resonance)
  if (step < 0) return
  const halo = coloredHalo(kind, pitchClassIndex(hz))
  if (!halo) return
  const padX = (halo.field.spread * destW) / halo.field.refW
  const padY = (halo.field.spread * destH) / halo.field.refH
  const left = -Math.floor(destW / 2) - padX
  const top = -destH - padY
  ctx.imageSmoothingEnabled = false
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = HALO_ALPHA[step]!
  // Bench (Chrome 148, 1888×992, 560 draws, median of 5): shadowBlur 8.3 ms, these blits 2.3 ms.
  // Sprites stay for the dithered rings.
  ctx.drawImage(
    halo.canvas,
    Math.round(left * scale),
    Math.round(top * scale),
    Math.round((destW + padX * 2) * scale),
    Math.round((destH + padY * 2) * scale),
  )
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

/** Tiny additive spark on each bloom center. Does not retint the flower PNG. */
export function drawCoreSprite(
  ctx: CanvasRenderingContext2D,
  scale: number,
  destW: number,
  destH: number,
  kind: FlowerKind,
  hz: number,
  resonance: number,
): void {
  const step = glowStep(resonance)
  if (step < 0) return
  const halo = coloredHalo(kind, pitchClassIndex(hz))
  if (!halo || halo.field.cores.length === 0) return
  const sprite = coreSprite(pitchClassIndex(hz))
  const { refW, refH } = halo.field
  ctx.imageSmoothingEnabled = false
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = HALO_ALPHA[step]!
  for (const core of halo.field.cores) {
    const lx = Math.round(-Math.floor(destW / 2) + ((core.x + 0.5) / refW) * destW)
    const ly = Math.round(-destH + ((core.y + 0.5) / refH) * destH)
    ctx.drawImage(sprite, (lx - 1) * scale, (ly - 1) * scale, sprite.width * scale, sprite.height * scale)
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

function coloredHalo(
  kind: FlowerKind,
  pitchClass: number,
): { canvas: HTMLCanvasElement; field: HaloField } | null {
  const field = kindField(kind)
  if (!field) return null
  const key = `${kind}:${pitchClass}`
  let canvas = haloSprites.get(key)
  if (!canvas) {
    const { body, core } = emissiveGlowPair(pitchClass)
    const pixels = paintBloomHalo(field.mask, field.refW, field.refH, field.spread, body, core)
    canvas = canvasFrom(field.cols, field.rows, pixels)
    haloSprites.set(key, canvas)
  }
  return { canvas, field }
}

function kindField(kind: FlowerKind): HaloField | null {
  const hit = fields.get(kind)
  if (hit) return hit
  const head = bloomHeadMask(kind)
  if (!head) return null
  const refH = REF_H
  const refW = Math.max(1, Math.round((refH * head.w) / head.h))
  const mask = downsampleBloomMask(head.mask, head.w, head.h, refW, refH)
  const spread = BLOOM_HALO_SPREAD
  const field: HaloField = {
    mask,
    refW,
    refH,
    spread,
    cols: refW + spread * 2,
    rows: refH + spread * 2,
    cores: bloomCorePoints(mask, refW, refH),
  }
  fields.set(kind, field)
  return field
}

function coreSprite(pitchClass: number): HTMLCanvasElement {
  const pc = ((pitchClass % PITCH_CLASSES) + PITCH_CLASSES) % PITCH_CLASSES
  const hit = coreSprites[pc]
  if (hit) return hit
  const { core } = emissiveGlowPair(pc)
  const canvas = canvasFrom(3, 3, paintCorePixels(core))
  coreSprites[pc] = canvas
  return canvas
}

function rimSample(mx: number, my: number, band: number, body: Rgb, core: Rgb): Rgb | null {
  const checker = ((mx + my) & 1) === 0
  if (band < 0.34) return checker ? core : body
  if (band < 0.67) return checker ? body : null
  return (mx & 1) === 0 && (my & 1) === 0 ? body : null
}

function writePixel(data: Uint8ClampedArray, cols: number, x: number, y: number, rgb: Rgb): void {
  const i = (y * cols + x) * 4
  data[i] = rgb[0]
  data[i + 1] = rgb[1]
  data[i + 2] = rgb[2]
  data[i + 3] = 255
}

function canvasFrom(width: number, height: number, data: Uint8ClampedArray): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.imageSmoothingEnabled = false
  const img = ctx.createImageData(width, height)
  img.data.set(data)
  ctx.putImageData(img, 0, 0)
  return canvas
}
