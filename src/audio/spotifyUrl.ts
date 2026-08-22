export type ParsedSpotifyLink =
  | { ok: true; trackId: string }
  | { ok: false; reason: 'empty' | 'qobuz' | 'not-spotify' | 'no-track-id' }

/**
 * Extract a Spotify track id from share URLs or spotify:track: URIs.
 */
export function parseSpotifyTrackUrl(input: string): ParsedSpotifyLink {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }

  const lower = trimmed.toLowerCase()
  if (lower.includes('qobuz.com')) {
    return { ok: false, reason: 'qobuz' }
  }

  const uri = trimmed.match(/^spotify:track:([a-zA-Z0-9]+)$/i)
  if (uri?.[1]) return { ok: true, trackId: uri[1] }

  let url: URL
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return { ok: false, reason: 'not-spotify' }
  }

  const host = url.hostname.replace(/^www\./, '')
  if (host !== 'open.spotify.com' && !host.endsWith('.spotify.com')) {
    return { ok: false, reason: 'not-spotify' }
  }

  const match = url.pathname.match(/\/track\/([a-zA-Z0-9]+)/)
  if (match?.[1]) return { ok: true, trackId: match[1] }

  return { ok: false, reason: 'no-track-id' }
}

export function spotifyApiBase(): string {
  const base =
    (import.meta.env.VITE_SPOTIFY_API_BASE as string | undefined) ||
    (import.meta.env.VITE_QOBUZ_API_BASE as string | undefined)
  if (base && base.length > 0) return base.replace(/\/$/, '')
  return ''
}

export type SpotifyResolveResponse = {
  title: string
  artist: string
  durationMs: number
  trackId: string
  previewUrl: string
}

export async function resolveSpotifyTrack(
  trackIdOrUrl: string,
): Promise<SpotifyResolveResponse> {
  const base = spotifyApiBase()
  const params = new URLSearchParams()
  if (/^[a-zA-Z0-9]{22}$/.test(trackIdOrUrl.trim())) {
    params.set('track_id', trackIdOrUrl.trim())
  } else {
    params.set('url', trackIdOrUrl.trim())
  }
  const res = await fetch(`${base}/api/spotify-preview?${params}`)
  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    title?: string
    artist?: string
    durationMs?: number
    trackId?: string
    previewUrl?: string
  }
  if (!res.ok) {
    throw new Error(body.error ?? `Spotify resolve failed (${res.status})`)
  }
  if (!body.trackId || !body.previewUrl || !body.title) {
    throw new Error('Spotify resolve returned an incomplete response')
  }
  return {
    title: body.title,
    artist: body.artist ?? '',
    durationMs: body.durationMs ?? 30_000,
    trackId: body.trackId,
    previewUrl: body.previewUrl,
  }
}
