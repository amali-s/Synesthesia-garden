# Project state

Living snapshot of Synesthesia Garden. Update this file at the start of a session (if the repo moved) and at the end of any phase or sizable change.

**Last reviewed:** 2026-08-19  
**Active phase:** none (Phases 1–4 done)  
**Next recommended work:** [Phase 5 — Keep what grew](./ROADMAP.md#phase-5--keep-what-grew)

Plan and acceptance criteria: [`ROADMAP.md`](./ROADMAP.md)

---

## What it is

A pixel-art meadow that grows from **voice or music already playing on the device**: pitch, loudness, timbre, and rhythm become kind, hue, size, and motion. Speaker mode uses the microphone; Music mode captures tab/window/system audio. Autocorrelation pitch detector; flowers from pitched sound, grass from quiet. Art Nouveau frame and palette (Mucha / Tiffany jewel tones).

Shipped loop: **Speaker or Music → Listen → flowers; pause → grass in gaps; Stop; Clear garden.**

---

## Current snapshot

| Area | Status |
| --- | --- |
| Mic pitch garden | **Shipped** — Listen / Stop / Clear |
| Speaker vs Music listen | **Shipped** — top-bar toggle; Music uses `getDisplayMedia` + Share audio |
| Pitch → kind + hue | **Shipped** — log2 80–1000 Hz |
| Loudness → stem + bloom | **Shipped** — log RMS, AGC off |
| Timbre → kind nudge + contrast | **Shipped** — spectral centroid |
| Rhythm → sway / petal-open | **Shipped** — garden-level onset pulse; grass rustles on hits |
| Silence → grass | **Shipped** — grass fills empty cells |
| Percussion → motion only | **Shipped** — drum-like frames pulse, do not plant |
| Duration + pan → side | **Shipped** — long vs staccato and L/R as combined x biases |
| Section energy → depth | **Shipped** — quiet front, loud/chorus back |
| Tempo → spawn rate | **Shipped** — BPM from inter-onset intervals; cooldown 105–480 ms |
| Full-page meadow | **Shipped** — 320×200 logical, canvas fills leftover viewport |
| Organic placement | **Shipped** — same-pitch clusters + jitter |
| Lifecycle | **Shipped** — seed → bloom → rest; oldest wilt instead of splice |
| Listen-time sky | **Shipped** — sky/mist shift over ~9 min of listening |
| Local file / song playback | **Deferred** — `SongPlayer` + CSS exist, not in `main.ts` (see Later) |
| Spotify previews | **Hidden** — API + Vite plugin exist; UI gone |
| Qobuz streaming | **Hidden / deferred** — API + Vite plugin exist; UI gone |
| Export / share | **Not started** |
| Tests | **None** |
| Deploy | GitHub Pages (`base: /Synesthesia-garden/`) or Vercel (`VERCEL` → `/`) |

---

## What works in the running app

UI in `src/main.ts` is a full-page meadow with two listen sources (one at a time):

- **Top bar** — Listen, Stop, Clear garden, **Speaker | Music**, pitch meter
- **Speaker** (default) — `getUserMedia`, echo cancellation / noise suppression on, **AGC off**, vocal 80–1000 Hz
- **Music** — `getDisplayMedia` with audio required; video track muted/ignored; echo cancel / noise suppress / AGC **off**; wider pitch window (50–2000 Hz) for planting; `pitchNorm` still 80–1000 Hz. Capture is **not** played through the garden (no double audio)
- **Listen / Stop** — uses the selected mode; switching mode while listening stops the current stream, then starts the new one
- **Clear garden** — instant reset of plants (listen-time sky keeps going)
- **Pixel garden** — 320×200 logical, integer scale to leftover viewport, seven flower kinds, swaying grass, blocky clouds, Nouveau window chrome

Pitch pipeline (`src/audio/pitch.ts`):

- Autocorrelation + parabolic interpolation
- Speaker: plant if RMS ≥ `0.012` and Hz in 80–1000
- Music: plant if RMS ≥ `0.008` and Hz in 50–2000 (`isVoice` is the plant gate for both)
- `pitchNorm` is **log2** 80–1000 Hz (drives kind walk + hue; clamps outside)
- `loudnessT` log-maps RMS from the mode’s silence floor to ~0.25
- `timbreT` log-maps spectral centroid ~200–4000 Hz
- Onset via spectral flux and positive d(RMS)/dt (~120 ms refractory)
- Mix layout (Phase 4): `durationMs` (reset on silence or ~3 semitone jump), `panT` from L/R RMS on display capture (center if mono / Speaker), `sectionEnergyT` (~1.45 s loudness smooth), `bpm` / `spawnScale` from inter-onset intervals, `percussive` when the spectrum is broadband and pitch is weak (`corr ≥ 0.52` always plants so sung pitch is not swallowed)

Garden (`src/garden/world.ts`):

- Flower while pitched; cooldown **105–480 ms** from tempo (220 ms at 120 BPM); drums do not spawn
- Stores `pitchT`, `loudnessT`, `timbreT`
- Kind: `round(pitchT * 6 + (timbreT - 0.5) * 2.5)` clamped 0–6
- Stem ~5–14 logical px × grow envelope; quiet = compact bloom, loud = full petals
- Bright timbre raises petal contrast; onsets add ~200 ms extra sway + petal-open; grass rustles on the same pulse
- Grass after ~360 ms accumulated pause, using **real frame delta**
- Placement: same-pitch clusters + jitter; **x** from duration (staccato left, long right) **and** pan; **y** from section energy (quiet nearer the viewer, loud toward the back / denser mid-bed)
- Grass prefers empty neighbor cells
- Cap ~560 living plants; oldest **wilt/fade** (~2.6 s) instead of hard splice
- Lifecycle: seed (~0.8 s) → bloom (~12 s) → rest (droop) → wilt when over cap

Manual checks (2026-08-15): sung scale walks all 7 kinds; low vs high → different kinds/hues; quiet vs belt at one pitch → stem/bloom only; oo vs ee at one pitch → kind + contrast; staccato refreshes onset, drone does not; silence → grass.

Music path (2026-08-18): Speaker + Listen still mic-only; Music + Listen prompts tab/window share; no audio / cancel / Safari leaves Speaker working; streams are never mixed.

Music layout (2026-08-19): stereo mix uses L/R tap (not played through the garden); Speaker / mono pan stays center; duration, tempo, and section energy apply in both modes.

---

## Built but not in the product

These files are in the tree; the live UI does not use them.

| Piece | Path | Notes |
| --- | --- | --- |
| Song player | `src/audio/songPlayer.ts` | File or URL → `PitchDetector.attachMediaElement` |
| Media / node tap | `PitchDetector` | `attachMediaElement`, `connectSource` unused by `main.ts` |
| Song form / playback CSS | `src/style.css` | `.song-form`, `.playback`, `.file-btn` |
| Spotify URL + resolve | `src/audio/spotifyUrl.ts`, `api/spotify-preview.ts` | 30s preview |
| Qobuz URL + stream | `src/audio/qobuzUrl.ts`, `api/qobuz-resolve.ts`, `api/qobuz-stream.ts` | Full-track; ToS risk |
| Dev middleware | `vite-plugin-spotify-api.ts`, `vite-plugin-qobuz-api.ts` | Still loaded in `vite.config.ts` |

`.env.example` says streaming is hidden and Listen needs no secrets. That matches the UI, not Vite (plugins still register).

---

## Known gaps (by roadmap phase)

### Phase 1 — Mapping

Done. Leftover: `plant.baseHue` is still unused by `drawFlower` (it uses `baseHueForKind`); `FLOWER_BASE_HUES` overlaps that map.

### Phase 2 — Music vs Speaker

Done. Leftovers / honest limits:

- Chrome/Edge tab share + “Share audio” is the reliable path; Safari is refused up front
- Firefox / some OS combos may offer share without an audio track — status says so
- Dominant pitch of the mix only (no source separation)
- Mode is session-only (not persisted)
- `SongPlayer` / file upload remains deferred (Later)

### Phase 3 — Garden feel

Done. Leftover: soil speckles still redraw every frame (Phase 6); loudness/timbre meters left the HUD when the top bar took pitch only.

### Phase 4 — Music mix layout

Done. Leftovers / honest limits:

- Dominant mix pitch only (no source separation or instrument→flower)
- Pan needs stereo tab/system capture; Speaker and silent-R “mono” stay center
- BPM is folded into ~58–188; noisy onset storms cannot drop cooldown below 105 ms
- No verse/chorus labels — section energy is smoothed loudness only

### Phase 5 — Keep

- No PNG, seed, or clip

### Phase 6 — Perf

- Soil speckles: per-pixel `fillRect` every frame (~320 × 112)
- Plants copy-sorted by `y` every frame
- Naive autocorrelation on fftSize 2048 every frame

### Phase 7 — Teach / a11y

- HUD shows pitch only; no legend or note name
- Listen has no `aria-pressed`; no keyboard shortcuts (mode toggle does use `aria-pressed`)
- No `prefers-reduced-motion`
- Google Fonts CDN in `src/style.css`

### Phase 8 — Hygiene

- `tsconfig.json` `include` is `["src"]` — `api/` and Vite plugins are not in `npm run build` typecheck
- README still describes the old centered layout, not the full-page meadow
- `vite.config.ts` comment (“Spotify is active now”) disagrees with README and `.env.example`

---

## Roadmap progress

| Phase | Name | Status |
| --- | --- | --- |
| 1 | Richer audio mapping | Done |
| 2 | Music mode vs Speaker mode | Done |
| 3 | Organic garden + lifecycle | Done |
| 4 | Music mix → garden layout | Done |
| 5 | Keep what grew (PNG / share) | Not started |
| 6 | Canvas + pitch performance | Not started |
| 7 | Teach the mapping + a11y | Not started |
| 8 | Engineering hygiene | Not started |
| — | Spotify / Qobuz | Deferred (code retained) |

---

## Layout (as of last review)

```
src/main.ts                 UI + rAF loop (Speaker/Music top bar + meadow)
src/audio/pitch.ts          Detector + mic / display capture + mix layout (pan, duration, tempo, drums)
src/audio/songPlayer.ts     Unused by UI
src/audio/spotifyUrl.ts     Unused by UI
src/audio/qobuzUrl.ts       Unused by UI
src/garden/world.ts         Clusters, mix-layout x/y, tempo cooldown, gap grass, lifecycle
src/garden/renderer.ts      Full-scene draw; listen-time sky
src/garden/sprites.ts       Pixel flowers / grass (life + wilt)
src/garden/palette.ts       Nouveau colors + pitch hue + sky watch
api/                        Vercel functions (hidden features)
vite-plugin-*-api.ts        Dev stubs for those APIs
```

---

## How to update this file

After a change that ships, hides, or finishes a phase:

1. Set **Last reviewed** to today.
2. Set **Active phase** / **Next recommended work**.
3. Flip the matching row in **Roadmap progress** (`Not started` → `In progress` → `Done`).
4. Move items between **What works**, **Built but not in the product**, and **Known gaps**.
5. If phase order or acceptance changes, edit [`ROADMAP.md`](./ROADMAP.md) too.

Do not treat leftover CSS or API files as shipped. Shipped means a visitor can use it in the current UI with no extra env vars (unless the phase says otherwise).
