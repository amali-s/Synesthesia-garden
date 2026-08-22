import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  corsHeaders,
  fetchTrackInfo,
  getQobuzCredentials,
  parseTrackIdFromUrl,
} from './_lib/qobuz'

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

  const creds = getQobuzCredentials()
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
    ? parseTrackIdFromUrl(trackParam)
    : urlParam
      ? parseTrackIdFromUrl(urlParam)
      : null

  if (!trackId) {
    applyHeaders(res, cors)
    res.status(400).json({
      error:
        'Paste a Qobuz track link (open.qobuz.com / play.qobuz.com), or upload an audio file.',
    })
    return
  }

  try {
    const track = await fetchTrackInfo(creds, trackId)
    if (!track.streamable) {
      applyHeaders(res, cors)
      res.status(403).json({
        error:
          'This track is not streamable on Qobuz (rights). Try another track or upload a file.',
      })
      return
    }
    applyHeaders(res, cors)
    res.status(200).json({
      title: track.title,
      artist: track.artist,
      duration: track.duration,
      trackId: track.id,
      streamPath: `/api/qobuz-stream?track_id=${encodeURIComponent(track.id)}`,
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to resolve Qobuz track'
    applyHeaders(res, cors)
    res.status(502).json({ error: message })
  }
}
