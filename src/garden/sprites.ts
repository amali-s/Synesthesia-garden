import { bloomLean, bloomPixelSize, drawBloomArt } from './bloomArt'
import { drawCoreSprite, drawHaloSprite } from './halo'
import { PASTEL } from './palette'

export type FlowerKind = 'daisy' | 'tulip' | 'bell' | 'rose' | 'star' | 'poppy' | 'orchid'

export const FLOWER_KINDS: FlowerKind[] = [
  'daisy',
  'tulip',
  'bell',
  'rose',
  'star',
  'poppy',
  'orchid',
]

/**
 * Pick flower shape from timbre + note class (not register).
 * Same octave-equivalent note can still change kind when the vowel / instrument
 * brightens; a scale mixes kinds inside one timber patch.
 */
export function kindFromSound(timbreT: number, pitchClassT: number): FlowerKind {
  const n = FLOWER_KINDS.length
  const ti = Math.round(Math.min(1, Math.max(0, timbreT)) * (n - 1))
  const ci = Math.round(Math.min(1, Math.max(0, pitchClassT)) * (n - 1))
  return FLOWER_KINDS[(ti + ci) % n]!
}

/** Draw a single logical pixel */
function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  scale: number,
): void {
  ctx.fillStyle = color
  ctx.fillRect(Math.floor(x) * scale, Math.floor(y) * scale, scale, scale)
}

export function drawGrass(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  scale: number,
  variant: number,
  sway: number,
  grow = 1,
  wiltT = 0,
  onsetPulse = 0,
): void {
  const height = Math.max(0.25, grow * (1 - wiltT * 0.55))
  ctx.save()
  ctx.globalAlpha = 1 - wiltT * 0.85
  const tip = Math.round(
    Math.sin(sway) * (1.5 + onsetPulse * 2.2) * (1 - wiltT),
  )
  const blades: Array<[number, number, number, number]> = [
    [0, 0, tip, Math.round((-6 - (variant % 3)) * height)],
    [1, 0, 1 + tip, Math.round((-8 - (variant % 2)) * height)],
    [-1, 0, -1 - tip, Math.round(-5 * height)],
    [2, 0, 2 + Math.round(tip * 0.5), Math.round(-4 * height)],
  ]
  const dry = wiltT > 0.35
  for (const [x0, y0, x1, y1] of blades) {
    const steps = Math.abs(y1 - y0) + Math.abs(x1 - x0) + 1
    for (let s = 0; s < steps; s++) {
      const t = s / Math.max(1, steps - 1)
      const x = Math.round(x0 + (x1 - x0) * t)
      const y = Math.round(y0 + (y1 - y0) * t)
      const color = dry
        ? PASTEL.soilLight
        : s > steps - 3
          ? PASTEL.grassLight
          : PASTEL.grass
      px(ctx, gx + x, gy + y, color, scale)
    }
  }
  px(ctx, gx, gy, PASTEL.grassDark, scale)
  px(ctx, gx + 1, gy, PASTEL.grassDark, scale)
  ctx.restore()
}

export function drawFlower(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  scale: number,
  kind: FlowerKind,
  pitchT: number,
  age: number,
  sway: number,
  loudnessT: number,
  timbreT: number,
  onsetPulse: number,
  restT = 0,
  wiltT = 0,
  hz?: number,
  reducedMotion = false,
  glowT = 0,
  pulseT = 0,
  resonance = 0,
): void {
  const grow = reducedMotion ? 1 : Math.min(1, age / 0.8)
  const flash = Math.min(1.5, onsetPulse + glowT * 0.28 + pulseT * 0.9)
  const { w: destW, h: destH } = bloomPixelSize(kind, loudnessT, grow, restT, wiltT, flash)
  if (resonance > 0) {
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.translate(gx * scale, gy * scale)
    ctx.rotate(bloomLean(sway, pitchT, flash, restT, wiltT))
    drawHaloSprite(ctx, scale, destW, destH, kind, hz ?? 0, resonance)
    ctx.restore()
  }
  drawBloomArt(
    ctx,
    gx,
    gy,
    scale,
    kind,
    hz ?? 0,
    pitchT,
    timbreT,
    loudnessT,
    sway,
    flash,
    grow,
    restT,
    wiltT,
  )
  if (resonance > 0) {
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.translate(gx * scale, gy * scale)
    ctx.rotate(bloomLean(sway, pitchT, flash, restT, wiltT))
    drawCoreSprite(ctx, scale, destW, destH, kind, hz ?? 0, resonance)
    ctx.restore()
  }
}
