import type { Plugin } from 'vite'
import {
  corsHeaders,
  fetchFileUrl,
  fetchTrackInfo,
  getQobuzCredentials,
  parseTrackIdFromUrl,
} from './api/_lib/qobuz'

/**
 * Local /api/qobuz-* handlers during `vite dev` (reads process.env / .env*).
 */
export function qobuzApiPlugin(): Plugin {
  return {
    name: 'qobuz-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/qobuz-')) return next()

        const origin =
          typeof req.headers.origin === 'string' ? req.headers.origin : '*'
        const cors = corsHeaders(origin)

        if (req.method === 'OPTIONS') {
          res.writeHead(204, cors)
          res.end()
          return
        }

        try {
          if (url.startsWith('/api/qobuz-resolve')) {
            await handleResolve(url, res, cors)
            return
          }
          if (url.startsWith('/api/qobuz-stream')) {
            await handleStream(url, req.headers.range, res, cors)
            return
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'API error'
          if (!res.headersSent) {
            res.writeHead(502, { ...cors, 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: message }))
          } else {
            res.end()
          }
          return
        }

        next()
      })
    },
  }
}

async function handleResolve(
  url: string,
  res: import('http').ServerResponse,
  cors: Record<string, string>,
): Promise<void> {
  const creds = getQobuzCredentials()
  if ('error' in creds) {
    res.writeHead(503, { ...cors, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: creds.error }))
    return
  }

  const q = new URL(url, 'http://localhost').searchParams
  const trackId =
    parseTrackIdFromUrl(q.get('track_id') ?? '') ??
    parseTrackIdFromUrl(q.get('url') ?? '')

  if (!trackId) {
    res.writeHead(400, { ...cors, 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        error:
          'Paste a Qobuz track link (open.qobuz.com / play.qobuz.com), or upload an audio file.',
      }),
    )
    return
  }

  const track = await fetchTrackInfo(creds, trackId)
  if (!track.streamable) {
    res.writeHead(403, { ...cors, 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        error:
          'This track is not streamable on Qobuz (rights). Try another track or upload a file.',
      }),
    )
    return
  }

  res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      title: track.title,
      artist: track.artist,
      duration: track.duration,
      trackId: track.id,
      streamPath: `/api/qobuz-stream?track_id=${encodeURIComponent(track.id)}`,
    }),
  )
}

async function handleStream(
  url: string,
  rangeHeader: string | string[] | undefined,
  res: import('http').ServerResponse,
  cors: Record<string, string>,
): Promise<void> {
  const creds = getQobuzCredentials()
  if ('error' in creds) {
    res.writeHead(503, { ...cors, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: creds.error }))
    return
  }

  const q = new URL(url, 'http://localhost').searchParams
  const trackId = parseTrackIdFromUrl(q.get('track_id') ?? '')
  if (!trackId) {
    res.writeHead(400, { ...cors, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing track_id' }))
    return
  }

  const file = await fetchFileUrl(creds, trackId)
  const range = typeof rangeHeader === 'string' ? rangeHeader : undefined
  const upstream = await fetch(file.url, {
    headers: range ? { Range: range } : undefined,
  })

  if (!upstream.ok && upstream.status !== 206) {
    res.writeHead(502, { ...cors, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: `Upstream audio failed (${upstream.status})` }))
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
}
