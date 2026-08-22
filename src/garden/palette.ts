/**
 * Chrome / ground only — UI frame, timber, gravel.
 * Do not use these for flowers or grass (flowers use BLOOM_HEX; grass stays PASTEL).
 */
export const GROUND = {
  ink: '#4A2E2A',
  brass: '#D8C7A5',
  brassLite: '#E8E2D5',
  cream: '#F7F1E8',
  patina: '#1C5E3B',
  gravel: '#E8E2D5',
  gravelLight: '#F4EEE2',
  gravelDark: '#C9B38C',
  timber: '#C6B27C',
  timberDark: '#897C59',
  timberShadow: '#8B8478',
  timberLite: '#D8C7A5',
  bedSoil: '#4A2E2A',
  bedSoilDark: '#3E281E',
  bedSoilLight: '#734834',
} as const

/** Lace frame + planter strokes (from Figma palette) */
export const ACCENTS = {
  softGreen: '#A5C5A3',
  borderGreen: '#2F6F42',
  planterStroke: '#6E3A07',
  rivetStroke: '#944D06',
  planterLedge: '#C9AFA8',
  soilOutline: '#4A2E2A',
} as const

/** Plant colors — unchanged by the chrome palette */
export const PASTEL = {
  skyTop: '#b7cfc8',
  skyBottom: '#d9c8d4',
  soil: '#a89070',
  soilDark: '#8a7358',
  soilLight: '#c4ae90',
  grass: '#7f9a72',
  grassDark: '#5f7a58',
  grassLight: '#a3b892',
  stem: '#5a7a5e',
  stemDark: '#3f5a44',
  outline: '#3d2f2a',
  cream: '#f5ede0',
  mist: '#d4c4d0',
  gold: '#c4a35a',
  goldLight: '#e0c888',
  brass: '#8a6e3e',
  teal: '#3d6b6b',
  rose: '#c4878a',
  mauve: '#9b7b9e',
} as const

/** Sky / mist over accumulated listen time (dawn → day → dusk). */
export const SKY_WATCH: ReadonlyArray<{
  t: number
  top: string
  bottom: string
  mist: string
}> = [
  { t: 0, top: '#c9d6e2', bottom: '#edd6c8', mist: '#e4d4ce' },
  { t: 0.22, top: '#b7cfc8', bottom: '#d9c8d4', mist: '#d4c4d0' },
  { t: 0.55, top: '#9eb4c8', bottom: '#d4b6a4', mist: '#d8c4b8' },
  { t: 0.82, top: '#7a88a8', bottom: '#c4878a', mist: '#c4a8b4' },
  { t: 1, top: '#4a5878', bottom: '#8a6e82', mist: '#9a8898' },
]

/** Full listen-time sky shift, in ms (does not loop). */
export const SKY_LISTEN_MS = 9 * 60 * 1000

function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '')
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ]
}

function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return `rgb(${r} ${g} ${bl})`
}

export function skyForListenMs(listenMs: number): {
  top: string
  bottom: string
  mist: string
} {
  const t = Math.min(1, Math.max(0, listenMs / SKY_LISTEN_MS))
  let i = 0
  while (i < SKY_WATCH.length - 2 && t > SKY_WATCH[i + 1]!.t) i++
  const a = SKY_WATCH[i]!
  const b = SKY_WATCH[i + 1]!
  const span = b.t - a.t || 1
  const u = (t - a.t) / span
  return {
    top: lerpHex(a.top, b.top, u),
    bottom: lerpHex(a.bottom, b.bottom, u),
    mist: lerpHex(a.mist, b.mist, u),
  }
}

/**
 * Art Nouveau bloom jewels (Mucha / Tiffany). Petals only mix these hexes —
 * no free HSL hue walk, which was drifting into extra reds and greens.
 */
export const BLOOM_HEX = {
  lilac: '#B6A9C9',
  lilacMist: '#E9E1F2',
  slate: '#5A6B7A',
  terracotta: '#B0563C',
  coral: '#D98962',
  gold: '#D7B46A',
  teal: '#1F5C5A',
  plum: '#5A2E5C',
  rose: '#A25D7C',
  amber: '#D7A13A',
  taupe: '#9C6B6A',
  blush: '#E7B9B1',
} as const

/**
 * Parallel chroma walks (same note class).
 * Soft = low pitch / dull timbre; jewel = high pitch or bright timbre.
 */
export const BLOOM_SOFT = [
  BLOOM_HEX.slate,
  BLOOM_HEX.taupe,
  BLOOM_HEX.lilac,
  BLOOM_HEX.blush,
  BLOOM_HEX.rose,
  BLOOM_HEX.lilacMist,
] as const

export const BLOOM_JEWEL = [
  BLOOM_HEX.teal,
  BLOOM_HEX.terracotta,
  BLOOM_HEX.plum,
  BLOOM_HEX.gold,
  BLOOM_HEX.coral,
  BLOOM_HEX.amber,
] as const

export type Hsl = { h: number; s: number; l: number }
export type Rgb = [number, number, number]

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const u = Math.min(1, Math.max(0, t))
  return [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ]
}

function rgbToHsl([r, g, b]: Rgb): Hsl {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0)
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  return { h: h * 60, s: s * 100, l: l * 100 }
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const H = ((h % 360) + 360) % 360 / 360
  const S = Math.min(1, Math.max(0, s / 100))
  const L = Math.min(1, Math.max(0, l / 100))
  if (S < 1e-6) {
    const v = Math.round(L * 255)
    return [v, v, v]
  }
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S
  const p = 2 * L - q
  const hue = (t: number) => {
    let u = t
    if (u < 0) u += 1
    if (u > 1) u -= 1
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  return [
    Math.round(hue(H + 1 / 3) * 255),
    Math.round(hue(H) * 255),
    Math.round(hue(H - 1 / 3) * 255),
  ]
}

function isWarmHue(h: number): boolean {
  const x = ((h % 360) + 360) % 360
  return x < 55 || x >= 330
}

function mixHex(a: Rgb, hex: string, t: number): Rgb {
  return mixRgb(a, hexToRgb(hex), t)
}

function chromaRgb(stops: readonly string[], pcT: number): Rgb {
  const n = stops.length
  const x = ((((pcT % 1) + 1) % 1) * n) % n
  const i = Math.floor(x)
  const f = x - i
  return mixRgb(hexToRgb(stops[i]!), hexToRgb(stops[(i + 1) % n]!), f)
}

/** 0 = dusty / mist; 1 = stained-glass. High pitch or bright timbre either count. */
function jewelMix(pitchT: number, timbreT: number): number {
  const t = Math.min(1, Math.max(0, 0.58 * pitchT + 0.42 * timbreT))
  return t * t * (3 - 2 * t)
}

/** Note class picks the family; pitch + timbre pick soft vs jewel. */
export function colorFromBloom(pcT: number, pitchT = 0.5, timbreT = 0.5): Hsl {
  const soft = chromaRgb(BLOOM_SOFT, pcT)
  const jewel = chromaRgb(BLOOM_JEWEL, pcT)
  const rgb = mixRgb(soft, jewel, jewelMix(pitchT, timbreT))
  return rgbToHsl(rgb)
}

export function hueFromPitchClass(pcT: number): number {
  return colorFromBloom(pcT, 0.45, 0.5).h
}

export function bloomDeep(mid: Hsl, pitchT: number, timbreT: number): string {
  const j = jewelMix(pitchT, timbreT)
  const shade = isWarmHue(mid.h)
    ? j > 0.45
      ? BLOOM_HEX.terracotta
      : BLOOM_HEX.taupe
    : j > 0.45
      ? BLOOM_HEX.teal
      : BLOOM_HEX.slate
  return hslCss(rgbToHsl(mixHex(hslToRgb(mid), shade, 0.22 + j * 0.2)))
}

export function bloomLite(mid: Hsl, pitchT: number, timbreT: number): string {
  const j = jewelMix(pitchT, timbreT)
  const tint = isWarmHue(mid.h) ? BLOOM_HEX.blush : BLOOM_HEX.lilacMist
  return hslCss(rgbToHsl(mixHex(hslToRgb(mid), tint, 0.42 - j * 0.22)))
}

export function bloomCenter(mid: Hsl): Hsl {
  const jewel = mid.s > 38 || mid.l < 48
  return rgbToHsl(mixHex(hslToRgb(mid), jewel ? BLOOM_HEX.gold : BLOOM_HEX.blush, 0.42))
}

export function bloomWilt(mid: Hsl, wiltT: number): Hsl {
  return rgbToHsl(mixHex(hslToRgb(mid), BLOOM_HEX.taupe, wiltT))
}

export function bloomPaintRgb(
  pcT: number,
  pitchT: number,
  timbreT: number,
  wiltT = 0,
): { mid: Rgb; deep: Rgb; lite: Rgb; center: Rgb } {
  let midH = colorFromBloom(pcT, pitchT, timbreT)
  if (wiltT > 0) midH = bloomWilt(midH, wiltT)
  const j = jewelMix(pitchT, timbreT)
  const deepShade = isWarmHue(midH.h)
    ? j > 0.45
      ? BLOOM_HEX.terracotta
      : BLOOM_HEX.taupe
    : j > 0.45
      ? BLOOM_HEX.teal
      : BLOOM_HEX.slate
  const liteTint = isWarmHue(midH.h) ? BLOOM_HEX.blush : BLOOM_HEX.lilacMist
  const mid = hslToRgb(midH)
  let deep = mixHex(mid, deepShade, 0.22 + j * 0.2)
  let lite = mixHex(mid, liteTint, 0.42 - j * 0.22)
  let center = mixHex(mid, midH.s > 38 || midH.l < 48 ? BLOOM_HEX.gold : BLOOM_HEX.blush, 0.42)
  if (wiltT > 0) {
    const taupe = hexToRgb(BLOOM_HEX.taupe)
    deep = mixRgb(deep, taupe, wiltT)
    lite = mixRgb(lite, taupe, wiltT)
    center = mixRgb(center, taupe, wiltT)
  }
  return { mid, deep, lite, center }
}

export function colorFromPitch(baseHue: number, pitchT: number, timbreT = 0.5): Hsl {
  return colorFromBloom((((baseHue % 360) + 360) % 360) / 360, pitchT, timbreT)
}

export function hslCss({ h, s, l }: Hsl): string {
  return `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`
}

export function hslDarker(c: Hsl, amount = 12): string {
  return hslCss({ h: c.h, s: c.s, l: Math.max(20, c.l - amount) })
}

export function hslLighter(c: Hsl, amount = 10): string {
  return hslCss({ h: c.h, s: Math.max(10, c.s - 8), l: Math.min(95, c.l + amount) })
}
