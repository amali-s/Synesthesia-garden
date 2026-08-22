import { createHash } from 'node:crypto'

const QOBUZ_API = 'https://www.qobuz.com/api.json/0.2'
/** MP3 320 — small enough for pitch analysis + proxying */
export const FORMAT_MP3_320 = 5

export type QobuzCredentials = {
  appId: string
  appSecret: string
  userAuthToken: string
}

export type QobuzTrackInfo = {
  id: string
  title: string
  artist: string
  duration: number
  streamable: boolean
}

export type QobuzFileUrl = {
  url: string
  mimeType: string | null
}

export function getQobuzCredentials(): QobuzCredentials | { error: string } {
  const appId = process.env.QOBUZ_APP_ID?.trim()
  const appSecret = process.env.QOBUZ_APP_SECRET?.trim()
  const userAuthToken = process.env.QOBUZ_USER_AUTH_TOKEN?.trim()
  if (!appId || !appSecret || !userAuthToken) {
    return {
      error:
        'Qobuz is not configured. Set QOBUZ_APP_ID, QOBUZ_APP_SECRET, and QOBUZ_USER_AUTH_TOKEN.',
    }
  }
  return { appId, appSecret, userAuthToken }
}

export function parseTrackIdFromUrl(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    const host = url.hostname.replace(/^www\./, '')
    const isQobuz =
      host === 'open.qobuz.com' ||
      host === 'play.qobuz.com' ||
      host === 'qobuz.com' ||
      host.endsWith('.qobuz.com')
    if (!isQobuz) return null
    const trackPath = url.pathname.match(/\/track\/(\d+)/i)
    if (trackPath?.[1]) return trackPath[1]
    const storeTrack = url.pathname.match(/\/track-[^/]+\/(\d+)/i)
    if (storeTrack?.[1]) return storeTrack[1]
    const trailing = url.pathname.match(/\/(\d+)\/?$/)
    if (trailing?.[1]) return trailing[1]
  } catch {
    return null
  }
  return null
}

function signGetFileUrl(
  trackId: string,
  formatId: number,
  ts: string,
  appSecret: string,
): string {
  const raw = `trackgetFileUrlformat_id${formatId}intentstreamtrack_id${trackId}${ts}${appSecret}`
  return createHash('md5').update(raw).digest('hex')
}

export async function fetchTrackInfo(
  creds: QobuzCredentials,
  trackId: string,
): Promise<QobuzTrackInfo> {
  const params = new URLSearchParams({
    app_id: creds.appId,
    track_id: trackId,
  })
  const res = await fetch(`${QOBUZ_API}/track/get?${params}`, {
    headers: {
      'X-User-Auth-Token': creds.userAuthToken,
      'X-App-Id': creds.appId,
    },
  })
  if (!res.ok) {
    throw new Error(`Qobuz track/get failed (${res.status})`)
  }
  const data = (await res.json()) as {
    id?: number | string
    title?: string
    duration?: number
    streamable?: boolean
    performer?: { name?: string }
    album?: { artist?: { name?: string } }
  }
  if (data.id == null) {
    throw new Error('Track not found on Qobuz')
  }
  return {
    id: String(data.id),
    title: data.title ?? `Track ${trackId}`,
    artist:
      data.performer?.name ?? data.album?.artist?.name ?? 'Unknown artist',
    duration: data.duration ?? 0,
    streamable: Boolean(data.streamable),
  }
}

export async function fetchFileUrl(
  creds: QobuzCredentials,
  trackId: string,
  formatId: number = FORMAT_MP3_320,
): Promise<QobuzFileUrl> {
  const ts = String(Math.floor(Date.now() / 1000))
  const requestSig = signGetFileUrl(trackId, formatId, ts, creds.appSecret)
  const params = new URLSearchParams({
    app_id: creds.appId,
    track_id: trackId,
    format_id: String(formatId),
    intent: 'stream',
    request_ts: ts,
    request_sig: requestSig,
  })
  const res = await fetch(`${QOBUZ_API}/track/getFileUrl?${params}`, {
    headers: {
      'X-User-Auth-Token': creds.userAuthToken,
      'X-App-Id': creds.appId,
    },
  })
  const data = (await res.json()) as {
    url?: string
    mime_type?: string
    message?: string
    code?: number | string
  }
  if (!res.ok || !data.url) {
    throw new Error(
      data.message ??
        `Qobuz getFileUrl failed (${res.status}). Check subscription rights and credentials.`,
    )
  }
  return { url: data.url, mimeType: data.mime_type ?? 'audio/mpeg' }
}

export function corsHeaders(origin?: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Expose-Headers':
      'Content-Length, Content-Range, Accept-Ranges, Content-Type',
  }
}
