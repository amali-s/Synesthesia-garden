// Streaming is deferred (see ROADMAP "Later"), but the parsers stay in the tree.
import { describe, expect, it } from 'vitest'
import { parseSpotifyTrackUrl } from './spotifyUrl'

describe('parseSpotifyTrackUrl', () => {
  it('reads a share URL', () => {
    expect(
      parseSpotifyTrackUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'),
    ).toEqual({ ok: true, trackId: '4cOdK2wGLETKBW3PvgPWqT' })
  })

  it('ignores query strings and a locale segment', () => {
    expect(
      parseSpotifyTrackUrl(
        'https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT?si=abc123',
      ),
    ).toEqual({ ok: true, trackId: '4cOdK2wGLETKBW3PvgPWqT' })
  })

  it('accepts a bare host without a scheme', () => {
    expect(
      parseSpotifyTrackUrl('open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'),
    ).toEqual({ ok: true, trackId: '4cOdK2wGLETKBW3PvgPWqT' })
  })

  it('reads a spotify:track: URI', () => {
    expect(parseSpotifyTrackUrl('spotify:track:4cOdK2wGLETKBW3PvgPWqT')).toEqual({
      ok: true,
      trackId: '4cOdK2wGLETKBW3PvgPWqT',
    })
  })

  it('trims surrounding whitespace', () => {
    expect(
      parseSpotifyTrackUrl('  spotify:track:4cOdK2wGLETKBW3PvgPWqT  '),
    ).toEqual({ ok: true, trackId: '4cOdK2wGLETKBW3PvgPWqT' })
  })

  it('rejects empty input', () => {
    expect(parseSpotifyTrackUrl('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseSpotifyTrackUrl('   ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('points a Qobuz link at the other parser', () => {
    expect(
      parseSpotifyTrackUrl('https://open.qobuz.com/track/12345678'),
    ).toEqual({ ok: false, reason: 'qobuz' })
  })

  it('rejects a non-Spotify host', () => {
    expect(parseSpotifyTrackUrl('https://example.com/track/abc')).toEqual({
      ok: false,
      reason: 'not-spotify',
    })
  })

  it('rejects a Spotify URL that is not a track', () => {
    expect(
      parseSpotifyTrackUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'),
    ).toEqual({ ok: false, reason: 'no-track-id' })
    expect(parseSpotifyTrackUrl('https://open.spotify.com/track/')).toEqual({
      ok: false,
      reason: 'no-track-id',
    })
  })
})
