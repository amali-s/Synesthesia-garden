export type ParsedQobuzLink =
  | { ok: true; trackId: string }
  | { ok: false; reason: 'empty' | 'spotify' | 'not-qobuz' | 'no-track-id' }

/**
 * Extract a Qobuz track id from common share / player URLs.
 */
export function parseQobuzTrackUrl(input: string): ParsedQobuzLink {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }

  const lower = trimmed.toLowerCase()
  if (lower.includes('spotify.com') || lower.startsWith('spotify:')) {
    return { ok: false, reason: 'spotify' }
  }

  let url: URL
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return { ok: false, reason: 'not-qobuz' }
  }

  const host = url.hostname.replace(/^www\./, '')
  const isQobuz =
    host === 'open.qobuz.com' ||
    host === 'play.qobuz.com' ||
    host === 'qobuz.com' ||
    host.endsWith('.qobuz.com')

  if (!isQobuz) return { ok: false, reason: 'not-qobuz' }

  // /track/{id}
  const trackPath = url.pathname.match(/\/track\/(\d+)/i)
  if (trackPath?.[1]) return { ok: true, trackId: trackPath[1] }

  // /…/track-slug/{id} on www.qobuz.com store pages
  const storeTrack = url.pathname.match(/\/track-[^/]+\/(\d+)/i)
  if (storeTrack?.[1]) return { ok: true, trackId: storeTrack[1] }

  // Bare numeric path segment as last resort on qobuz hosts
  const trailing = url.pathname.match(/\/(\d+)\/?$/)
  if (trailing?.[1]) return { ok: true, trackId: trailing[1] }

  return { ok: false, reason: 'no-track-id' }
}

export function qobuzApiBase(): string {
  const base = import.meta.env.VITE_QOBUZ_API_BASE as string | undefined
  if (base && base.length > 0) return base.replace(/\/$/, '')
  return ''
}

export type QobuzResolveResponse = {
  title: string
  artist: string
  duration: number
  trackId: string
  streamPath: string
}

export async function resolveQobuzTrack(
  trackIdOrUrl: string,
): Promise<QobuzResolveResponse> {
  const base = qobuzApiBase()
  const params = new URLSearchParams()
  if (/^\d+$/.test(trackIdOrUrl.trim())) {
    params.set('track_id', trackIdOrUrl.trim())
  } else {
    params.set('url', trackIdOrUrl.trim())
  }
  const res = await fetch(`${base}/api/qobuz-resolve?${params}`)
  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    title?: string
    artist?: string
    duration?: number
    trackId?: string
    streamPath?: string
  }
  if (!res.ok) {
    throw new Error(body.error ?? `Qobuz resolve failed (${res.status})`)
  }
  if (!body.trackId || !body.streamPath || !body.title) {
    throw new Error('Qobuz resolve returned an incomplete response')
  }
  return {
    title: body.title,
    artist: body.artist ?? '',
    duration: body.duration ?? 0,
    trackId: body.trackId,
    streamPath: body.streamPath.startsWith('http')
      ? body.streamPath
      : `${base}${body.streamPath}`,
  }
}
