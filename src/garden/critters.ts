import { tintedBloomHeadCanvas } from './bloomArt'
import type { FlowerPlant } from './world'

/**
 * Top-left of the mailbox sprite (logical px).
 * Sits on the top gravel walk, above the back-right bed — not on timber.
 */
export const MAILBOX = { x: 297, y: 1 } as const
export const MAILBOX_W = 22
export const MAILBOX_H = 30
/** Where the fox stands to post the bouquet (on the same gravel walk). */
export const MAILBOX_STAND = { x: 286, y: 24 } as const
/** Off-canvas start / empty-handed exit (top left gravel). */
export const FOX_ENTER = { x: -20, y: 22 } as const
/** Courtyard sniff when there is not enough to forage. */
export const FOX_SNIFF = { x: 42, y: 22 } as const
/** Exit after mailing (top right, past the box). */
export const FOX_EXIT_RIGHT = { x: 338, y: 22 } as const

/** Drawn size of the fox sprite in logical pixels (feet at the anchor). */
export const FOX_W = 26
export const FOX_H = 18

export type FoxPose = 'walk' | 'sniff' | 'pick' | 'mail'

type SheetId = 'fox0' | 'fox1' | 'foxStill' | 'mailEmpty' | 'mailOutgoing' | 'bouquet'

const SHEET_FILES: Record<SheetId, string> = {
  fox0: 'fox-walk-0.png',
  fox1: 'fox-walk-1.png',
  foxStill: 'fox-still.png',
  mailEmpty: 'mail-empty.png',
  mailOutgoing: 'mail-outgoing.png',
  bouquet: 'bouquet-wrap.png',
}

const sheets = new Map<SheetId, HTMLImageElement>()
let loadPromise: Promise<void> | null = null

function sheetUrl(file: string): string {
  const base = import.meta.env.BASE_URL
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}critters/${file}`
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.decoding = 'async'
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error(`Missing sprite: ${src}`))
    el.src = src
  })
}

export function loadCritterArt(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = Promise.all(
    (Object.keys(SHEET_FILES) as SheetId[]).map((id) =>
      loadImage(sheetUrl(SHEET_FILES[id]!))
        .then((img) => {
          sheets.set(id, img)
        })
        .catch((err) => {
          console.warn(err)
        }),
    ),
  ).then(() => undefined)
  return loadPromise
}

export function bouquetWrapImage(): HTMLImageElement | null {
  return sheets.get('bouquet') ?? null
}

function blit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  scale: number,
): void {
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    img,
    0,
    0,
    img.naturalWidth,
    img.naturalHeight,
    Math.round(dx) * scale,
    Math.round(dy) * scale,
    Math.max(1, Math.round(dw)) * scale,
    Math.max(1, Math.round(dh)) * scale,
  )
  ctx.restore()
}

/** Anchor is the fox's front paws. */
export function drawFox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  facing: 1 | -1,
  pose: FoxPose,
  frame: 0 | 1,
): void {
  const img =
    pose === 'walk'
      ? sheets.get(frame === 0 ? 'fox0' : 'fox1')
      : sheets.get('foxStill') ?? sheets.get('fox0')
  if (!img) return
  const dx = Math.round(x) - Math.floor(FOX_W / 2)
  const dy = Math.round(y) - FOX_H + 1
  if (facing === 1) {
    blit(ctx, img, dx, dy, FOX_W, FOX_H, scale)
    return
  }
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.translate(Math.round(x) * scale, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(
    img,
    0,
    0,
    img.naturalWidth,
    img.naturalHeight,
    -Math.floor(FOX_W / 2) * scale,
    dy * scale,
    FOX_W * scale,
    FOX_H * scale,
  )
  ctx.restore()
}

export function drawMailbox(
  ctx: CanvasRenderingContext2D,
  scale: number,
  flagUp: boolean,
): void {
  const img = sheets.get(flagUp ? 'mailOutgoing' : 'mailEmpty')
  if (!img) return
  blit(ctx, img, MAILBOX.x, MAILBOX.y, MAILBOX_W, MAILBOX_H, scale)
}

export function drawCarriedBloom(
  ctx: CanvasRenderingContext2D,
  plant: FlowerPlant,
  x: number,
  y: number,
  scale: number,
  destH: number,
): void {
  const sheet = tintedBloomHeadCanvas(plant.kind, plant.hz, plant.pitchT, plant.timbreT, 0)
  if (!sheet) return
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
}
