import vineFrameUrl from '../vine-frame.svg?url'

/** Source SVG is 80×80; CSS `border-image-slice: 20`. */
const SLICE = 20
const SRC = 80
const EDGE = SRC - SLICE * 2
const SHADOW_CSS = 4

const FRAME_DARK = '#2f6f42'
const FRAME_MID = '#a5c5a3'
const FRAME_LIGHT = '#f7f1e8'
const INK = '#4a2e2a'
const CREAM = '#f7f1e8'

let vineImage: HTMLImageElement | null = null
let vineLoad: Promise<HTMLImageElement> | null = null

function loadVine(): Promise<HTMLImageElement> {
  if (vineImage?.complete && vineImage.naturalWidth > 0) return Promise.resolve(vineImage)
  if (vineLoad) return vineLoad
  vineLoad = new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      vineImage = img
      resolve(img)
    }
    img.onerror = () => {
      vineLoad = null
      reject(new Error('Could not load the vine frame'))
    }
    img.src = vineFrameUrl
  })
  return vineLoad
}

function roundTileCount(destPx: number, tilePx: number): number {
  return Math.max(1, Math.round(destPx / Math.max(1, tilePx)))
}

/** CSS `border-image-repeat: round` along one axis. */
function drawRoundStrip(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  axis: 'x' | 'y',
): void {
  if (dw < 1 || dh < 1 || sw < 1 || sh < 1) return
  if (axis === 'x') {
    const n = roundTileCount(dw, sw * (dh / sh))
    const tw = dw / n
    for (let i = 0; i < n; i++) {
      ctx.drawImage(img, sx, sy, sw, sh, dx + i * tw, dy, tw, dh)
    }
    return
  }
  const n = roundTileCount(dh, sh * (dw / sw))
  const th = dh / n
  for (let i = 0; i < n; i++) {
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy + i * th, dw, th)
  }
}

function drawVineBorder(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  pad: number,
): void {
  const mid = EDGE
  ctx.drawImage(img, 0, 0, SLICE, SLICE, x, y, pad, pad)
  ctx.drawImage(img, SRC - SLICE, 0, SLICE, SLICE, x + w - pad, y, pad, pad)
  ctx.drawImage(img, 0, SRC - SLICE, SLICE, SLICE, x, y + h - pad, pad, pad)
  ctx.drawImage(
    img,
    SRC - SLICE,
    SRC - SLICE,
    SLICE,
    SLICE,
    x + w - pad,
    y + h - pad,
    pad,
    pad,
  )
  drawRoundStrip(ctx, img, SLICE, 0, mid, SLICE, x + pad, y, w - pad * 2, pad, 'x')
  drawRoundStrip(
    ctx,
    img,
    SLICE,
    SRC - SLICE,
    mid,
    SLICE,
    x + pad,
    y + h - pad,
    w - pad * 2,
    pad,
    'x',
  )
  drawRoundStrip(ctx, img, 0, SLICE, SLICE, mid, x, y + pad, pad, h - pad * 2, 'y')
  drawRoundStrip(
    ctx,
    img,
    SRC - SLICE,
    SLICE,
    SLICE,
    mid,
    x + w - pad,
    y + pad,
    pad,
    h - pad * 2,
    'y',
  )
}

function drawGlassStroke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number,
): void {
  const line = Math.max(1, Math.round(2 * scale))
  ctx.save()
  ctx.lineJoin = 'miter'
  ctx.strokeStyle = FRAME_DARK
  ctx.lineWidth = line
  ctx.strokeRect(x + line / 2, y + line / 2, w - line, h - line)
  ctx.strokeStyle = FRAME_LIGHT
  ctx.strokeRect(
    x + line + line / 2,
    y + line + line / 2,
    w - line * 3,
    h - line * 3,
  )
  ctx.restore()
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  captionEl: HTMLElement,
  glassX: number,
  glassY: number,
  glassW: number,
  glassH: number,
  scale: number,
): void {
  const text = captionEl.textContent?.trim()
  if (!text) return
  const cs = getComputedStyle(captionEl)
  const fontSize = parseFloat(cs.fontSize) || 12
  const padX = parseFloat(cs.paddingLeft) || 8
  const padY = parseFloat(cs.paddingTop) || 4
  const border = parseFloat(cs.borderTopWidth) || 2
  const shadow = 2
  const fontPx = fontSize * scale
  ctx.save()
  ctx.font = `700 ${fontPx}px ${cs.fontFamily}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const metrics = ctx.measureText(text)
  const boxW = metrics.width + (padX * 2 + border * 2) * scale
  const boxH = fontPx + (padY * 2 + border * 2) * scale
  const cx = glassX + glassW / 2
  const bottomFrac = glassH < 280 ? 0.08 : 0.1
  const boxX = Math.round(cx - boxW / 2)
  const boxY = Math.round(glassY + glassH * (1 - bottomFrac) - boxH)
  const sh = shadow * scale
  const bw = border * scale
  ctx.fillStyle = INK
  ctx.fillRect(boxX + sh, boxY + sh, boxW, boxH)
  ctx.fillStyle = CREAM
  ctx.fillRect(boxX, boxY, boxW, boxH)
  ctx.strokeStyle = INK
  ctx.lineWidth = bw
  ctx.strokeRect(boxX + bw / 2, boxY + bw / 2, boxW - bw, boxH - bw)
  ctx.fillStyle = INK
  ctx.fillText(text, boxX + (padX + border) * scale, boxY + boxH / 2)
  ctx.restore()
}

export type PostcardSource = {
  frameEl: HTMLElement
  gardenCanvas: HTMLCanvasElement
  captionEl: HTMLElement
  /** False when any plants are in the bed — do not stamp the empty-courtyard line. */
  showCaption: boolean
}

export function postcardFilename(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `synesthesia-garden-${y}-${m}-${d}.png`
}

/**
 * Offscreen composite of the vine window + garden glass (CSS frame, live canvas).
 */
export async function renderPostcardPng(source: PostcardSource): Promise<Blob> {
  const vine = await loadVine()
  await document.fonts.ready

  const frame = source.frameEl
  const cssW = Math.max(1, frame.offsetWidth)
  const cssH = Math.max(1, frame.offsetHeight)
  const padCss = parseFloat(getComputedStyle(frame).getPropertyValue('--frame-pad')) || 22
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const scale = Math.max(2, Math.min(3, Math.round(dpr) || 2))
  const shadow = SHADOW_CSS * scale
  const w = Math.round(cssW * scale)
  const h = Math.round(cssH * scale)
  const pad = Math.max(1, Math.round(padCss * scale))

  const out = document.createElement('canvas')
  out.width = w + shadow
  out.height = h + shadow
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')
  ctx.imageSmoothingEnabled = false

  ctx.fillStyle = FRAME_DARK
  ctx.fillRect(shadow, shadow, w, h)

  ctx.fillStyle = FRAME_MID
  ctx.fillRect(0, 0, w, h)

  const gx = pad
  const gy = pad
  const gw = Math.max(1, w - pad * 2)
  const gh = Math.max(1, h - pad * 2)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(source.gardenCanvas, gx, gy, gw, gh)

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  drawVineBorder(ctx, vine, 0, 0, w, h, pad)
  ctx.imageSmoothingEnabled = false
  drawGlassStroke(ctx, gx, gy, gw, gh, scale)

  if (source.showCaption) {
    drawCaption(ctx, source.captionEl, gx, gy, gw, gh, scale)
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    out.toBlob((b) => resolve(b), 'image/png')
  })
  if (!blob) throw new Error('Could not encode the postcard')
  return blob
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
