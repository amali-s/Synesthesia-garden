/** Art Nouveau garden palette — Mucha / Tiffany inspired soft jewel tones */

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

/** Art Nouveau flower family base hues (degrees) */
export const FLOWER_BASE_HUES = [
  350, // dusty rose
  28, // apricot / peach
  42, // antique gold
  145, // sage green
  175, // peacock teal
  265, // soft mauve
  320, // orchid lilac
] as const

export type Hsl = { h: number; s: number; l: number }

/**
 * Higher pitch → higher hue shift + saturation.
 * Bright timbre slightly boosts saturation for petal contrast.
 * Kept soft so blooms stay in the Nouveau jewel range.
 */
export function colorFromPitch(baseHue: number, pitchT: number, timbreT = 0.5): Hsl {
  const h = (baseHue + pitchT * 42) % 360
  const s = 28 + pitchT * 44 + (timbreT - 0.5) * 16
  const l = 68 - pitchT * 14
  return { h, s, l }
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
