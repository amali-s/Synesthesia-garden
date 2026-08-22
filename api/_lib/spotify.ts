const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SPOTIFY_API = 'https://api.spotify.com/v1'

export type SpotifyCredentials = {
  clientId: string
  clientSecret: string
}

export type SpotifyTrackPreview = {
  id: string
  title: string
  artist: string
  durationMs: number
  previewUrl: string
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null

export function getSpotifyCredentials(): SpotifyCredentials | { error: string } {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim()
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    return {
      error:
        'Spotify is not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.',
    }
  }
  return { clientId, clientSecret }
}

export function parseSpotifyTrackId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const uri = trimmed.match(/^spotify:track:([a-zA-Z0-9]+)$/)
  if (uri?.[1]) return uri[1]

  if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) return trimmed

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    const host = url.hostname.replace(/^www\./, '')
    if (host !== 'open.spotify.com' && host !== 'spotify.link') {
      // spotify.link is short links — may not contain track id without redirect
      if (!host.endsWith('spotify.com')) return null
    }
    const match = url.pathname.match(/\/track\/([a-zA-Z0-9]+)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

export async function getAccessToken(
  creds: SpotifyCredentials,
): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.accessToken
  }

  const body = new URLSearchParams({ grant_type: 'client_credentials' })
  const basic = Buffer.from(
    `${creds.clientId}:${creds.clientSecret}`,
  ).toString('base64')

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const data = (await res.json()) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }

  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        `Spotify token request failed (${res.status})`,
    )
  }

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  }
  return data.access_token
}

type SpotifyTrackJson = {
  id?: string
  name?: string
  duration_ms?: number
  preview_url?: string | null
  artists?: { name?: string }[]
  external_ids?: { isrc?: string }
  error?: { message?: string; status?: number }
}

function trackFromJson(data: SpotifyTrackJson): Omit<SpotifyTrackPreview, 'previewUrl'> & {
  previewUrl: string | null
} {
  return {
    id: data.id ?? '',
    title: data.name ?? '',
    artist: (data.artists ?? []).map((a) => a.name).filter(Boolean).join(', '),
    durationMs: data.duration_ms ?? 30_000,
    previewUrl: data.preview_url ?? null,
  }
}

async function spotifyGet(
  token: string,
  path: string,
): Promise<{ ok: boolean; status: number; data: SpotifyTrackJson & { tracks?: { items?: SpotifyTrackJson[] } } }> {
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = (await res.json()) as SpotifyTrackJson & {
    tracks?: { items?: SpotifyTrackJson[] }
  }
  return { ok: res.ok, status: res.status, data }
}

/**
 * Resolve a 30s preview. GET /tracks often returns a null preview_url;
 * a market hint and a search fallback still succeed for some tracks.
 */
export async function fetchTrackPreview(
  creds: SpotifyCredentials,
  trackId: string,
): Promise<SpotifyTrackPreview> {
  const token = await getAccessToken(creds)
  const primary = await spotifyGet(
    token,
    `/tracks/${encodeURIComponent(trackId)}?market=US`,
  )

  if (!primary.ok) {
    throw new Error(
      primary.data.error?.message ??
        `Spotify track request failed (${primary.status})`,
    )
  }

  if (!primary.data.id || !primary.data.name) {
    throw new Error('Track not found on Spotify')
  }

  let previewUrl = primary.data.preview_url ?? null

  if (!previewUrl) {
    const isrc = primary.data.external_ids?.isrc
    const artist = primary.data.artists?.[0]?.name ?? ''
    const query = isrc
      ? `isrc:${isrc}`
      : `track:"${primary.data.name}"${artist ? ` artist:"${artist}"` : ''}`
    const search = await spotifyGet(
      token,
      `/search?${new URLSearchParams({
        q: query,
        type: 'track',
        limit: '5',
        market: 'US',
      })}`,
    )
    if (search.ok) {
      const match =
        search.data.tracks?.items?.find(
          (item) => item.id === trackId && item.preview_url,
        ) ?? search.data.tracks?.items?.find((item) => item.preview_url)
      if (match?.preview_url) previewUrl = match.preview_url
    }
  }

  if (!previewUrl) {
    throw new Error(
      'No preview available for this track — try another Spotify link or upload a file.',
    )
  }

  const base = trackFromJson(primary.data)
  return { ...base, previewUrl }
}

export function corsHeaders(origin?: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
