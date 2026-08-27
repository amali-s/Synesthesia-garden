import { pitchClassT } from '../audio/pitch'
import { tintedBloomHeadCanvas } from './bloomArt'
import { bouquetWrapImage, loadCritterArt } from './critters'
import { bloomPaintRgb, rgbCss } from './palette'
import type { FlowerPlant } from './world'

/** Head anchors on the 100×100 wrap, back to front in the leaf V. */
const SLOTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 50, y: 16 },
  { x: 32, y: 20 },
  { x: 68, y: 20 },
  { x: 22, y: 28 },
  { x: 50, y: 24 },
  { x: 78, y: 28 },
  { x: 30, y: 34 },
  { x: 42, y: 30 },
  { x: 58, y: 30 },
  { x: 70, y: 34 },
  { x: 40, y: 38 },
  { x: 60, y: 38 },
]

/** Integer scale of the whole sticker so wrap and heads stay the same pixel size. */
const OUT_SCALE = 3

export function bouquetFilename(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `synesthesia-bouquet-${y}-${m}-${d}.png`
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  plant: FlowerPlant,
  x: number,
  y: number,
  scale: number,
): void {
  const sheet = tintedBloomHeadCanvas(plant.kind, plant.hz, plant.pitchT, plant.timbreT, 0)
  if (sheet) {
    // Wrap slots sit near y=16; keep heads inside the 100×100 sticker.
    const destH = Math.min(16, sheet.height)
    const destW = Math.max(1, Math.round(destH * (sheet.width / Math.max(1, sheet.height))))
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(
      sheet,
      0,
      0,
      sheet.width,
      sheet.height,
      Math.round(x - destW / 2) * scale,
      Math.round(y - destH) * scale,
      destW * scale,
      destH * scale,
    )
    ctx.restore()
    return
  }
  const pcT = plant.hz > 0 ? pitchClassT(plant.hz) : 0
  const paint = bloomPaintRgb(pcT, plant.pitchT, plant.timbreT, 0)
  const s = scale
  const petals: Array<[number, number]> = [
    [-2, -1],
    [2, -1],
    [0, -3],
    [-2, 1],
    [2, 1],
  ]
  for (const [dx, dy] of petals) {
    ctx.fillStyle = rgbCss(paint.mid)
    ctx.fillRect((x + dx) * s, (y + dy) * s, 2 * s, 2 * s)
  }
  ctx.fillStyle = rgbCss(paint.center)
  ctx.fillRect(x * s, y * s, 2 * s, 2 * s)
}

/**
 * Transparent PNG: the cream wrap with harvested bloom heads scaled to the sticker.
 */
export async function renderBouquetPng(flowers: readonly FlowerPlant[]): Promise<Blob> {
  await loadCritterArt()
  const wrap = bouquetWrapImage()
  const lw = wrap?.naturalWidth ?? 100
  const lh = wrap?.naturalHeight ?? 100
  const out = document.createElement('canvas')
  out.width = lw * OUT_SCALE
  out.height = lh * OUT_SCALE
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, out.width, out.height)

  if (wrap) {
    ctx.drawImage(wrap, 0, 0, out.width, out.height)
  }

  const n = Math.min(flowers.length, SLOTS.length)
  for (let i = 0; i < n; i++) {
    const slot = SLOTS[i]!
    drawHead(ctx, flowers[i]!, slot.x, slot.y, OUT_SCALE)
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    out.toBlob((b) => resolve(b), 'image/png')
  })
  if (!blob) throw new Error('Could not encode the bouquet')
  return blob
}
