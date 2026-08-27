import { pitchClassT } from '../audio/pitch'
import { bloomPaintRgb, type Rgb } from './palette'
import type { FlowerKind } from './sprites'

const ART_KINDS: FlowerKind[] = [
  'daisy',
  'tulip',
  'bell',
  'rose',
  'star',
  'poppy',
  'orchid',
]

type Sheet = { w: number; h: number; data: Uint8ClampedArray }

const sheets = new Map<FlowerKind, Sheet>()
const tintCache = new Map<string, HTMLCanvasElement>()
const headCache = new Map<string, HTMLCanvasElement>()
let loadPromise: Promise<void> | null = null

export function bloomArtReady(): boolean {
  return sheets.size === ART_KINDS.length
}

export function loadBloomArt(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = Promise.all(
    ART_KINDS.map((kind) =>
      loadKind(kind).catch((err) => {
        console.warn(err)
      }),
    ),
  ).then(() => undefined)
  return loadPromise
}

function kindUrl(kind: FlowerKind): string {
  const base = import.meta.env.BASE_URL
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}flowers/${kind}.png`
}

async function loadKind(kind: FlowerKind): Promise<void> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error(`Missing flower art: ${kind}`))
    el.src = kindUrl(kind)
  })
  const w = img.naturalWidth
  const h = img.naturalHeight
  const scratch = document.createElement('canvas')
  scratch.width = w
  scratch.height = h
  const ctx = scratch.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, w, h)
  sheets.set(kind, { w, h, data })
}

function classify(r: number, g: number, b: number, a: number): 'skip' | 'keep' | 'lite' | 'mid' | 'deep' | 'center' {
  if (a < 20 || r + g + b < 18) return 'skip'
  if (g >= r + 6 && g >= b - 12 && g > 36) return 'keep'
  if (r > 200 && g > 155 && b < 175 && g > b + 15) return 'center'
  const lum = (r + g + b) / 3
  if (lum > 198 && b > 170) return 'lite'
  if (r > 175 && g < 160 && lum > 105) return 'mid'
  return 'deep'
}

/** Tinted sprite for hover inspect (same paint path as the meadow). */
export function tintedBloomCanvas(
  kind: FlowerKind,
  hz: number,
  pitchT: number,
  timbreT: number,
  wiltT: number,
): HTMLCanvasElement | null {
  const pcT = hz > 0 ? pitchClassT(hz) : 0
  return tintedSheet(kind, pcT, pitchT, timbreT, wiltT)
}

/**
 * Bloom head only — stem and leaf pixels (source green) stripped, then cropped.
 * Used for forage carry and the mailed bouquet.
 */
export function tintedBloomHeadCanvas(
  kind: FlowerKind,
  hz: number,
  pitchT: number,
  timbreT: number,
  wiltT = 0,
): HTMLCanvasElement | null {
  const pcT = hz > 0 ? pitchClassT(hz) : 0
  const key = `h:${kind}:${Math.round(pcT * 12)}:${Math.round(pitchT * 8)}:${Math.round(timbreT * 8)}:${Math.round(wiltT * 4)}`
  const hit = headCache.get(key)
  if (hit) return hit
  const full = tintedSheet(kind, pcT, pitchT, timbreT, wiltT)
  const sheet = sheets.get(kind)
  if (!full || !sheet) return null
  const ctx = full.getContext('2d')
  if (!ctx) return null
  const { width: w, height: h } = full
  const src = sheet.data
  const img = ctx.getImageData(0, 0, w, h)
  const dst = img.data
  let x0 = w
  let y0 = h
  let x1 = 0
  let y1 = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const role = classify(src[i]!, src[i + 1]!, src[i + 2]!, src[i + 3]!)
      if (role === 'skip' || role === 'keep') {
        dst[i + 3] = 0
        continue
      }
      if (dst[i + 3]! < 20) continue
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
  }
  if (x1 < x0 || y1 < y0) return null
  const hw = x1 - x0 + 1
  const hh = y1 - y0 + 1
  const head = document.createElement('canvas')
  head.width = hw
  head.height = hh
  const hctx = head.getContext('2d')
  if (!hctx) return null
  const crop = hctx.createImageData(hw, hh)
  const cd = crop.data
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const si = (y * w + x) * 4
      const di = ((y - y0) * hw + (x - x0)) * 4
      cd[di] = dst[si]!
      cd[di + 1] = dst[si + 1]!
      cd[di + 2] = dst[si + 2]!
      cd[di + 3] = dst[si + 3]!
    }
  }
  hctx.putImageData(crop, 0, 0)
  if (headCache.size > 220) {
    const first = headCache.keys().next().value
    if (first) headCache.delete(first)
  }
  headCache.set(key, head)
  return head
}

function tintedSheet(
  kind: FlowerKind,
  pcT: number,
  pitchT: number,
  timbreT: number,
  wiltT: number,
): HTMLCanvasElement | null {
  const sheet = sheets.get(kind)
  if (!sheet) return null
  const key = `${kind}:${Math.round(pcT * 12)}:${Math.round(pitchT * 8)}:${Math.round(timbreT * 8)}:${Math.round(wiltT * 4)}`
  const hit = tintCache.get(key)
  if (hit) return hit

  const paint = bloomPaintRgb(pcT, pitchT, timbreT, wiltT)
  const canvas = document.createElement('canvas')
  canvas.width = sheet.w
  canvas.height = sheet.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const out = ctx.createImageData(sheet.w, sheet.h)
  const src = sheet.data
  const dst = out.data
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3]!
    const r = src[i]!
    const g = src[i + 1]!
    const b = src[i + 2]!
    const role = classify(r, g, b, a)
    if (role === 'skip') continue
    let rgb: Rgb
    if (role === 'keep') rgb = [r, g, b]
    else if (role === 'lite') rgb = paint.lite
    else if (role === 'mid') rgb = paint.mid
    else if (role === 'center') rgb = paint.center
    else rgb = paint.deep
    dst[i] = rgb[0]
    dst[i + 1] = rgb[1]
    dst[i + 2] = rgb[2]
    dst[i + 3] = 255
  }
  ctx.putImageData(out, 0, 0)
  if (tintCache.size > 220) {
    const first = tintCache.keys().next().value
    if (first) tintCache.delete(first)
  }
  tintCache.set(key, canvas)
  return canvas
}

export function bloomDrawHeight(
  loudnessT: number,
  grow: number,
  restT: number,
  wiltT: number,
  onsetPulse: number,
): number {
  return (
    (24 + loudnessT * 8) *
    Math.max(0.42, grow) *
    (1 - restT * 0.1) *
    (1 - wiltT * 0.32) *
    (1 + onsetPulse * 0.12)
  )
}

/** Whole logical pixels — shared by draw and hover/tap hitboxes. */
export function bloomPixelSize(
  kind: FlowerKind,
  loudnessT: number,
  grow: number,
  restT: number,
  wiltT: number,
  onsetPulse: number,
): { w: number; h: number } {
  const sheet = sheets.get(kind)
  const aspect = sheet ? sheet.w / sheet.h : 0.65
  const destH = Math.max(1, Math.round(bloomDrawHeight(loudnessT, grow, restT, wiltT, onsetPulse)))
  const destW = Math.max(1, Math.round(destH * aspect))
  return { w: destW, h: destH }
}

export function bloomHitSize(
  kind: FlowerKind,
  loudnessT: number,
  grow: number,
  restT: number,
  wiltT: number,
): { w: number; h: number } {
  return bloomPixelSize(kind, loudnessT, grow, restT, wiltT, 0)
}

/**
 * Pointer vs one bloom. Empty sheet padding does not count; `cx,cy` is the
 * petal cluster so overlapping dest boxes pick the nearest head, not the
 * front-most stem rectangle.
 */
export function bloomHitAt(
  kind: FlowerKind,
  loudnessT: number,
  grow: number,
  restT: number,
  wiltT: number,
  stemX: number,
  stemY: number,
  lx: number,
  ly: number,
): { cx: number; cy: number } | null {
  const { w, h } = bloomHitSize(kind, loudnessT, grow, restT, wiltT)
  const x0 = stemX - Math.floor(w / 2)
  const y0 = stemY - h
  if (lx < x0 || lx >= x0 + w || ly < y0 || ly >= stemY + 1) return null
  const sheet = sheets.get(kind)
  if (sheet && !sheetOpaqueNear(sheet, w, h, x0, y0, lx, ly)) return null
  return { cx: stemX, cy: stemY - h * 0.62 }
}

function sheetOpaqueNear(
  sheet: Sheet,
  destW: number,
  destH: number,
  x0: number,
  y0: number,
  lx: number,
  ly: number,
): boolean {
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const sx = Math.floor(((lx + ox - x0) / destW) * sheet.w)
      const sy = Math.floor(((ly + oy - y0) / destH) * sheet.h)
      if (sx < 0 || sy < 0 || sx >= sheet.w || sy >= sheet.h) continue
      const i = (sy * sheet.w + sx) * 4
      const a = sheet.data[i + 3]!
      const lum = sheet.data[i]! + sheet.data[i + 1]! + sheet.data[i + 2]!
      if (a >= 20 && lum >= 18) return true
    }
  }
  return false
}

export function drawBloomArt(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  scale: number,
  kind: FlowerKind,
  hz: number,
  pitchT: number,
  timbreT: number,
  loudnessT: number,
  sway: number,
  onsetPulse: number,
  grow: number,
  restT: number,
  wiltT: number,
): boolean {
  const pcT = hz > 0 ? pitchClassT(hz) : 0
  const sheet = tintedSheet(kind, pcT, pitchT, timbreT, wiltT)
  if (!sheet) return false

  const { w: destW, h: destH } = bloomPixelSize(
    kind,
    loudnessT,
    grow,
    restT,
    wiltT,
    onsetPulse,
  )
  const lean =
    Math.sin(sway) * (0.12 + pitchT * 0.1) * (1 - wiltT) +
    Math.sin(sway * 2.4) * onsetPulse * 0.16 +
    restT * 0.18 +
    wiltT * 0.28

  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.globalAlpha = 1 - wiltT * 0.82
  ctx.translate(gx * scale, gy * scale)
  ctx.rotate(lean)
  ctx.drawImage(
    sheet,
    0,
    0,
    sheet.width,
    sheet.height,
    (-Math.floor(destW / 2) * scale),
    -destH * scale,
    destW * scale,
    destH * scale,
  )
  ctx.restore()
  return true
}
