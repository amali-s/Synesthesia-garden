# Roadmap

Sequenced plan for Synesthesia Garden. Status lives in [`project-state.md`](./project-state.md) — update that file when a phase starts or finishes.

Order is deliberate: richer mapping first (the core idea), then local playback (the existing unfinished path), then garden feel, then keep/share, then performance and polish.

---

## North star

A pixel meadow that *feels* like synesthesia: several qualities of sound (pitch, loudness, timbre, rhythm) become several qualities of plants (kind, color, size, motion). People can grow from voice or from a song they already have, and they can keep what grew.

---

## Phase 1 — Richer audio mapping

**Why first:** The garden currently maps almost everything to Hz. More axes is the difference between a pitch meter with flowers and synesthesia.

| Work | Intent |
| --- | --- |
| Logarithmic pitch | A sung scale walks flower kinds evenly (`pitchNorm` is linear 80–1000 Hz today) |
| Loudness → size | RMS / envelope drives stem height and bloom scale |
| Timbre → species or texture | Brightness / harmonic richness picks daisy vs rose vs orchid (or petal treatment) instead of pitch band alone |
| Rhythm → motion | Onsets pulse sway, petal open, or small fauna |

**Done when:** Humming quietly vs belting, and low vs high, produce visibly different gardens. A short sung scale does not dump every bloom into the same two kinds.

**Touches:** `src/audio/pitch.ts`, `src/garden/world.ts`, `src/garden/sprites.ts`, `src/garden/palette.ts`, HUD in `src/main.ts`

---

## Phase 2 — Local song playback

**Why next:** `SongPlayer`, media tap in `PitchDetector`, and song-form CSS already exist; they are just unhooked. Local files need no keys and no streaming ToS.

| Work | Intent |
| --- | --- |
| Re-wire upload + play/pause | File picker, playback bar, garden grows from the track |
| Mute mic while a song plays | One audio source at a time |
| Honest errors | Unsupported type, decode failure, autoplay block |

**Done when:** Dropping an MP3/WAV/M4A grows a garden in time with the song, with play/pause and progress. Mic still works when no song is loaded.

**Out of scope:** Spotify previews and Qobuz streams stay deferred (see Later).

**Touches:** `src/audio/songPlayer.ts`, `src/main.ts`, `src/style.css` (styles already present)

---

## Phase 3 — Organic garden + lifecycle

**Why:** Plants fill a left-to-right grid, then wrap. After a minute it reads as a spreadsheet, not a bed.

| Work | Intent |
| --- | --- |
| Organic placement | Cluster same-pitch blooms; more jitter; grass fills gaps instead of taking the next slot |
| Lifecycle | Seed → bloom → rest; wilt or fade oldest plants instead of hard-delete at 480 |
| Time-of-day sky | Sky / mist shift with how long the session has been listening |

**Done when:** A few minutes of voice or a song looks like a meadow, not rows. Clearing is still instant.

**Touches:** `src/garden/world.ts`, `src/garden/renderer.ts`, maybe `src/garden/palette.ts`

---

## Phase 4 — Keep what grew

**Why:** There is no save, share, or export. The framed canvas is already a postcard.

| Work | Intent |
| --- | --- |
| Download PNG | Export the garden (optionally including the window frame) |
| Optional share URL / seed | Reopen a garden later |
| Optional short clip | GIF or WebM of sway — only if PNG feels incomplete |

**Done when:** One click yields an image someone can send. Clear garden still exists beside it.

**Touches:** `src/garden/renderer.ts`, `src/main.ts`, `src/style.css`

---

## Phase 5 — Canvas + pitch performance

**Why:** Every frame redraws soil pixel-by-pixel, sorts every plant, and runs naive autocorrelation on 2048 samples. It will hitch as the bed fills — more so after Phases 1–3 add work per plant.

| Work | Intent |
| --- | --- |
| Cache background | Sky, soil, horizon on an offscreen canvas; redraw plants + clouds only |
| Cheaper plant order | Y-bucket or insertion order instead of copy-sort each frame |
| Better pitch detector | YIN or McLeod (MPM); downsample before autocorrelation if staying in-house |

**Done when:** A full bed (hundreds of plants) stays smooth on a laptop and a mid-range phone, while listening.

**Touches:** `src/garden/renderer.ts`, `src/audio/pitch.ts`

---

## Phase 6 — Teach the mapping + accessibility

**Why:** The HUD shows Hz but not *why* a tulip appeared. The mapping should be readable without a README.

| Work | Intent |
| --- | --- |
| Legend | Tiny key: low → daisy / gold, high → orchid / mauve (update copy if Phase 1 changes the map) |
| Note name | Show `A4` / `C5` next to Hz |
| Keyboard | `L` listen/pause, `C` clear (and export if Phase 4 exists) |
| A11y | `aria-pressed` on Listen, `prefers-reduced-motion` for sway/grow |

**Done when:** A new visitor can predict the next bloom from the HUD, and the app is usable from the keyboard with reduced motion respected.

**Touches:** `src/main.ts`, `src/style.css`, `index.html`

---

## Phase 7 — Engineering hygiene

**Why last:** Cleanup should follow the product shape, not freeze the hidden streaming stack in place.

| Work | Intent |
| --- | --- |
| Align Vite plugins with UI | Don’t load Spotify/Qobuz middleware while those UIs are hidden |
| Typecheck `api/` | `tsconfig` currently includes only `src` |
| Tests | `pitchNorm`, `Garden.ingest`, URL parsers if streaming stays |
| Fonts | Self-host Pixelify / Cormorant / DM Sans instead of Google Fonts CDN |
| README | Match shipped features; link this roadmap and `project-state.md` |

**Done when:** `npm run build` typechecks what we ship, dead paths are either gone or clearly marked deferred, and the README matches the running app.

---

## Later / deferred

Do not start these until Phases 1–2 are real. Streaming is optional flavor, not the product.

| Idea | Notes |
| --- | --- |
| Spotify 30s previews | Backend already exists (`api/spotify-preview.ts`). Weak garden (half a minute) and extra secrets. |
| Qobuz full-track stream | Backend exists; ToS / rights risk for a public web app. Prefer local files. |
| MIDI keyboard input | Natural cousin of log-pitch mapping. |
| Day/night, weather, fauna | After lifecycle (Phase 3) so they have a world to live in. |
| PWA / offline | After fonts are local and streaming is decided. |

---

## Suggested build order in one line

**Mapping → file playback → organic bed → PNG export → perf → legend/a11y → hygiene.**
