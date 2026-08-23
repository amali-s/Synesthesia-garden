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
    (14 + loudnessT * 10) *
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
