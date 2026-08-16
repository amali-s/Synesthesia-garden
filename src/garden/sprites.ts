import {
  PASTEL,
  colorFromPitch,
  hslCss,
  hslDarker,
  hslLighter,
  type Hsl,
} from './palette'

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

/** Pick flower shape: pitch walks the 7 kinds; timbre nudges ±~1 kind */
export function kindFromPitch(pitchT: number, timbreT = 0.5): FlowerKind {
  const base = pitchT * 6
  const offset = (timbreT - 0.5) * 2.5
  const i = Math.min(
    FLOWER_KINDS.length - 1,
    Math.max(0, Math.round(base + offset)),
  )
  return FLOWER_KINDS[i]!
}

export function baseHueForKind(kind: FlowerKind): number {
  const map: Record<FlowerKind, number> = {
    daisy: 42,
    tulip: 350,
    bell: 175,
    rose: 350,
    star: 265,
    poppy: 28,
    orchid: 320,
  }
  return map[kind]
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

function stem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  scale: number,
): void {
  for (let i = 0; i < h; i++) {
    px(ctx, x, y - i, i % 4 === 0 ? PASTEL.stemDark : PASTEL.stem, scale)
    if (i > 2 && i % 5 === 0) {
      px(ctx, x + (i % 2 === 0 ? 1 : -1), y - i, PASTEL.grass, scale)
    }
  }
}

export function drawGrass(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  scale: number,
  variant: number,
  sway: number,
): void {
  const tip = Math.round(Math.sin(sway + variant) * 1.5)
  const blades: Array<[number, number, number, number]> = [
    [0, 0, tip, -6 - (variant % 3)],
    [1, 0, 1 + tip, -8 - (variant % 2)],
    [-1, 0, -1 - tip, -5],
    [2, 0, 2 + Math.round(tip * 0.5), -4],
  ]
  for (const [x0, y0, x1, y1] of blades) {
    const steps = Math.abs(y1 - y0) + Math.abs(x1 - x0) + 1
    for (let s = 0; s < steps; s++) {
      const t = s / Math.max(1, steps - 1)
      const x = Math.round(x0 + (x1 - x0) * t)
      const y = Math.round(y0 + (y1 - y0) * t)
      const color = s > steps - 3 ? PASTEL.grassLight : PASTEL.grass
      px(ctx, gx + x, gy + y, color, scale)
    }
  }
  px(ctx, gx, gy, PASTEL.grassDark, scale)
  px(ctx, gx + 1, gy, PASTEL.grassDark, scale)
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
): void {
  const hsl = colorFromPitch(baseHueForKind(kind), pitchT, timbreT)
  const petal = hslCss(hsl)
  const contrast = 12 + timbreT * 10
  const petalDeep = hslDarker(hsl, contrast)
  const petalLite = hslLighter(hsl, 10 + timbreT * 8)
  const center: Hsl = { h: (hsl.h + 40) % 360, s: hsl.s * 0.7, l: 78 }
  const centerCss = hslCss(center)
  const grow = Math.min(1, age / 0.6)
  const lean = Math.round(
    Math.sin(sway) * (1 + pitchT * 1.5) + Math.sin(sway * 2.4) * onsetPulse * 2,
  )

  const stemH = Math.max(1, Math.round((5 + loudnessT * 9) * grow))
  stem(ctx, gx + lean, gy, stemH, scale)

  const hx = gx + lean
  const hy = gy - stemH
  const bloomOpen = grow * (0.4 + 0.6 * loudnessT) + onsetPulse * 0.2

  if (bloomOpen < 0.35) {
    px(ctx, hx, hy, petal, scale)
    px(ctx, hx, hy - 1, petalDeep, scale)
    px(ctx, hx - 1, hy, petalDeep, scale)
    px(ctx, hx + 1, hy, petalDeep, scale)
    return
  }

  const bloomScale = Math.min(1.15, 0.5 + 0.5 * loudnessT + onsetPulse * 0.15)
  ctx.save()
  ctx.translate(hx * scale, hy * scale)
  ctx.scale(bloomScale, bloomScale)
  ctx.translate(-hx * scale, -hy * scale)

  switch (kind) {
    case 'daisy':
      drawDaisy(ctx, hx, hy, scale, petal, petalLite, centerCss)
      break
    case 'tulip':
      drawTulip(ctx, hx, hy, scale, petal, petalDeep, petalLite)
      break
    case 'bell':
      drawBell(ctx, hx, hy, scale, petal, petalDeep)
      break
    case 'rose':
      drawRose(ctx, hx, hy, scale, petal, petalDeep, petalLite)
      break
    case 'star':
      drawStar(ctx, hx, hy, scale, petal, petalLite, centerCss)
      break
    case 'poppy':
      drawPoppy(ctx, hx, hy, scale, petal, petalDeep, centerCss)
      break
    case 'orchid':
      drawOrchid(ctx, hx, hy, scale, petal, petalDeep, petalLite)
      break
  }

  ctx.restore()
}

function drawDaisy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  petal: string,
  lite: string,
  center: string,
): void {
  const petals = [
    [0, -4],
    [0, 4],
    [-4, 0],
    [4, 0],
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
    [-2, -4],
    [2, -4],
    [-2, 4],
    [2, 4],
    [-4, -2],
    [4, -2],
    [-4, 2],
    [4, 2],
  ]
  for (const [ox, oy] of petals) px(ctx, x + ox!, y + oy!, petal, s)
  for (const [ox, oy] of [
    [0, -5],
    [0, 5],
    [-5, 0],
    [5, 0],
  ]) {
    px(ctx, x + ox!, y + oy!, lite, s)
  }
  px(ctx, x, y, center, s)
  px(ctx, x - 1, y, center, s)
  px(ctx, x + 1, y, center, s)
  px(ctx, x, y - 1, center, s)
  px(ctx, x, y + 1, center, s)
}

function drawTulip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  petal: string,
  deep: string,
  lite: string,
): void {
  for (let dy = 0; dy <= 2; dy++) {
    px(ctx, x, y - dy, petal, s)
    px(ctx, x - 1, y - dy, deep, s)
    px(ctx, x + 1, y - dy, deep, s)
  }
  px(ctx, x - 2, y - 1, petal, s)
  px(ctx, x + 2, y - 1, petal, s)
  px(ctx, x - 2, y - 2, petal, s)
  px(ctx, x + 2, y - 2, petal, s)
  px(ctx, x - 1, y - 3, petal, s)
  px(ctx, x, y - 3, lite, s)
  px(ctx, x + 1, y - 3, petal, s)
  px(ctx, x - 2, y - 4, deep, s)
  px(ctx, x, y - 4, lite, s)
  px(ctx, x + 2, y - 4, deep, s)
}

function drawBell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  petal: string,
  deep: string,
): void {
  px(ctx, x, y - 2, petal, s)
  px(ctx, x - 1, y - 1, petal, s)
  px(ctx, x, y - 1, deep, s)
  px(ctx, x + 1, y - 1, petal, s)
  px(ctx, x - 2, y, deep, s)
  px(ctx, x - 1, y, petal, s)
  px(ctx, x, y, petal, s)
  px(ctx, x + 1, y, petal, s)
  px(ctx, x + 2, y, deep, s)
  px(ctx, x - 2, y + 1, petal, s)
  px(ctx, x - 1, y + 1, deep, s)
  px(ctx, x + 1, y + 1, deep, s)
  px(ctx, x + 2, y + 1, petal, s)
  px(ctx, x - 1, y + 2, petal, s)
  px(ctx, x + 1, y + 2, petal, s)
}

function drawRose(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  petal: string,
  deep: string,
  lite: string,
): void {
  px(ctx, x, y, deep, s)
  for (const [ox, oy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    px(ctx, x + ox!, y + oy!, petal, s)
  }
  for (const [ox, oy] of [
    [-2, -1],
    [-1, -2],
    [1, -2],
    [2, -1],
    [2, 1],
    [1, 2],
    [-1, 2],
    [-2, 1],
  ]) {
    px(ctx, x + ox!, y + oy!, lite, s)
  }
  for (const [ox, oy] of [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
  ]) {
    px(ctx, x + ox!, y + oy!, deep, s)
  }
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  petal: string,
  lite: string,
  center: string,
): void {
  px(ctx, x, y, center, s)
  for (let i = 1; i <= 4; i++) {
    px(ctx, x, y - i, i === 4 ? lite : petal, s)
    px(ctx, x, y + i, i === 4 ? lite : petal, s)
    px(ctx, x - i, y, i === 4 ? lite : petal, s)
    px(ctx, x + i, y, i === 4 ? lite : petal, s)
  }
  for (const [ox, oy] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
    [-3, -1],
    [3, -1],
    [-3, 1],
    [3, 1],
  ]) {
    px(ctx, x + ox!, y + oy!, lite, s)
  }
}

function drawPoppy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  petal: string,
  deep: string,
  center: string,
): void {
  for (const [ox, oy] of [
    [-2, -2],
    [-1, -3],
    [1, -3],
    [2, -2],
    [-3, -1],
    [3, -1],
    [-3, 1],
    [3, 1],
    [-2, 2],
    [-1, 3],
    [1, 3],
    [2, 2],
  ]) {
    px(ctx, x + ox!, y + oy!, petal, s)
  }
  for (const [ox, oy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
    [0, -2],
    [0, 2],
  ]) {
    px(ctx, x + ox!, y + oy!, deep, s)
  }
  px(ctx, x, y, center, s)
  px(ctx, x - 1, y, center, s)
  px(ctx, x + 1, y, center, s)
}

function drawOrchid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  petal: string,
  deep: string,
  lite: string,
): void {
  px(ctx, x, y - 4, lite, s)
  px(ctx, x - 1, y - 3, petal, s)
  px(ctx, x, y - 3, deep, s)
  px(ctx, x + 1, y - 3, petal, s)
  px(ctx, x - 2, y - 2, petal, s)
  px(ctx, x - 1, y - 2, deep, s)
  px(ctx, x, y - 2, petal, s)
  px(ctx, x + 1, y - 2, deep, s)
  px(ctx, x + 2, y - 2, petal, s)
  px(ctx, x - 3, y - 1, deep, s)
  px(ctx, x - 1, y - 1, petal, s)
  px(ctx, x, y - 1, lite, s)
  px(ctx, x + 1, y - 1, petal, s)
  px(ctx, x + 3, y - 1, deep, s)
  px(ctx, x - 2, y, deep, s)
  px(ctx, x, y, petal, s)
  px(ctx, x + 2, y, deep, s)
  px(ctx, x - 1, y + 1, lite, s)
  px(ctx, x, y + 1, petal, s)
  px(ctx, x + 1, y + 1, lite, s)
  px(ctx, x, y + 2, lite, s)
}
