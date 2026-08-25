// Streaming is deferred (see ROADMAP "Later"), but the parsers stay in the tree.
import { describe, expect, it } from 'vitest'
import { parseQobuzTrackUrl } from './qobuzUrl'

describe('parseQobuzTrackUrl', () => {
  it('reads a player URL', () => {
    expect(parseQobuzTrackUrl('https://play.qobuz.com/track/12345678')).toEqual({
      ok: true,
      trackId: '12345678',
    })
  })

  it('reads an open.qobuz.com URL with a query string', () => {
    expect(
      parseQobuzTrackUrl('https://open.qobuz.com/track/12345678?utm_source=share'),
    ).toEqual({ ok: true, trackId: '12345678' })
  })

  it('reads a store page track slug', () => {
    expect(
      parseQobuzTrackUrl(
        'https://www.qobuz.com/us-en/album/some-album/track-some-song/87654321',
      ),
    ).toEqual({ ok: true, trackId: '87654321' })
  })

  it('accepts a bare host without a scheme', () => {
    expect(parseQobuzTrackUrl('play.qobuz.com/track/12345678')).toEqual({
      ok: true,
      trackId: '12345678',
    })
  })

  it('rejects empty input', () => {
    expect(parseQobuzTrackUrl('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseQobuzTrackUrl('   ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('points a Spotify link at the other parser', () => {
    expect(
      parseQobuzTrackUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'),
    ).toEqual({ ok: false, reason: 'spotify' })
    expect(parseQobuzTrackUrl('spotify:track:4cOdK2wGLETKBW3PvgPWqT')).toEqual({
      ok: false,
      reason: 'spotify',
    })
  })

  it('rejects a non-Qobuz host', () => {
    expect(parseQobuzTrackUrl('https://example.com/track/12345678')).toEqual({
      ok: false,
      reason: 'not-qobuz',
    })
  })

  it('rejects a Qobuz URL with no track id', () => {
    expect(parseQobuzTrackUrl('https://www.qobuz.com/us-en/discover')).toEqual({
      ok: false,
      reason: 'no-track-id',
    })
  })
})
