import type { Plugin } from 'vite'
import {
  corsHeaders,
  fetchTrackPreview,
  getSpotifyCredentials,
  parseSpotifyTrackId,
} from './api/_lib/spotify'

/**
 * Local /api/spotify-preview during `vite dev` (reads process.env / .env*).
 */
export function spotifyApiPlugin(): Plugin {
  return {
    name: 'spotify-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/spotify-preview')) return next()

        const origin =
          typeof req.headers.origin === 'string' ? req.headers.origin : '*'
        const cors = corsHeaders(origin)

        if (req.method === 'OPTIONS') {
          res.writeHead(204, cors)
          res.end()
          return
        }

        if (req.method !== 'GET') {
          res.writeHead(405, { ...cors, 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        try {
          const creds = getSpotifyCredentials()
          if ('error' in creds) {
            res.writeHead(503, { ...cors, 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: creds.error }))
            return
          }

          const q = new URL(url, 'http://localhost').searchParams
          const trackId =
            parseSpotifyTrackId(q.get('track_id') ?? '') ??
            parseSpotifyTrackId(q.get('url') ?? '')

          if (!trackId) {
            res.writeHead(400, { ...cors, 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                error:
                  'Paste a Spotify track link (open.spotify.com/track/…), or upload an audio file.',
              }),
            )
            return
          }

          const track = await fetchTrackPreview(creds, trackId)
          res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              title: track.title,
              artist: track.artist,
              durationMs: track.durationMs,
              trackId: track.id,
              previewUrl: track.previewUrl,
            }),
          )
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Failed to resolve Spotify track'
          const status = message.includes('No preview') ? 404 : 502
          if (!res.headersSent) {
            res.writeHead(status, {
              ...cors,
              'Content-Type': 'application/json',
            })
            res.end(JSON.stringify({ error: message }))
          } else {
            res.end()
          }
        }
      })
    },
  }
}
