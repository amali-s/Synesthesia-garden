import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  corsHeaders,
  fetchFileUrl,
  getQobuzCredentials,
  parseTrackIdFromUrl,
} from './_lib/qobuz'

export const config = {
  maxDuration: 60,
}

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

  const trackParam =
    typeof req.query.track_id === 'string'
      ? req.query.track_id
      : Array.isArray(req.query.track_id)
        ? req.query.track_id[0]
        : ''
  const trackId = trackParam ? parseTrackIdFromUrl(trackParam) : null
  if (!trackId) {
    applyHeaders(res, cors)
    res.status(400).json({ error: 'Missing track_id' })
    return
  }

  try {
    const file = await fetchFileUrl(creds, trackId)
    const range =
      typeof req.headers.range === 'string' ? req.headers.range : undefined
    const upstream = await fetch(file.url, {
      headers: range ? { Range: range } : undefined,
    })

    if (!upstream.ok && upstream.status !== 206) {
      applyHeaders(res, cors)
      res
        .status(502)
        .json({ error: `Upstream audio failed (${upstream.status})` })
      return
    }

    const headers: Record<string, string> = {
      ...cors,
      'Content-Type':
        upstream.headers.get('content-type') || file.mimeType || 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=60',
    }
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) headers['Content-Length'] = contentLength
    const contentRange = upstream.headers.get('content-range')
    if (contentRange) headers['Content-Range'] = contentRange

    res.writeHead(upstream.status, headers)
    if (!upstream.body) {
      res.end()
      return
    }

    const reader = upstream.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          if (!res.write(Buffer.from(value))) {
            await new Promise<void>((resolve) => res.once('drain', resolve))
          }
        }
      }
      res.end()
    } catch {
      res.end()
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to stream Qobuz audio'
    if (!res.headersSent) {
      applyHeaders(res, cors)
      res.status(502).json({ error: message })
    } else {
      res.end()
    }
  }
}
