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
