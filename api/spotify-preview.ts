import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  corsHeaders,
  fetchTrackPreview,
  getSpotifyCredentials,
  parseSpotifyTrackId,
} from './_lib/spotify'

function applyHeaders(
  res: VercelResponse,
  headers: Record<string, string>,
): void {
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value)
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '*'
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    applyHeaders(res, cors)
    res.status(204).end()
    return
  }

  if (req.method !== 'GET') {
    applyHeaders(res, cors)
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const creds = getSpotifyCredentials()
  if ('error' in creds) {
    applyHeaders(res, cors)
    res.status(503).json({ error: creds.error })
    return
  }

  const urlParam =
    typeof req.query.url === 'string'
      ? req.query.url
      : Array.isArray(req.query.url)
        ? req.query.url[0]
        : ''
  const trackParam =
    typeof req.query.track_id === 'string'
      ? req.query.track_id
      : Array.isArray(req.query.track_id)
        ? req.query.track_id[0]
        : ''

  const trackId = trackParam
    ? parseSpotifyTrackId(trackParam)
    : urlParam
      ? parseSpotifyTrackId(urlParam)
      : null

  if (!trackId) {
    applyHeaders(res, cors)
    res.status(400).json({
      error:
        'Paste a Spotify track link (open.spotify.com/track/…), or upload an audio file.',
    })
    return
  }

  try {
    const track = await fetchTrackPreview(creds, trackId)
    applyHeaders(res, cors)
    res.status(200).json({
      title: track.title,
      artist: track.artist,
      durationMs: track.durationMs,
      trackId: track.id,
      previewUrl: track.previewUrl,
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to resolve Spotify track'
    const status = message.includes('No preview') ? 404 : 502
    applyHeaders(res, cors)
    res.status(status).json({ error: message })
  }
}
