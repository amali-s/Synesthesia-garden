# Project state

Living snapshot of Synesthesia Garden. Update this file at the start of a session (if the repo moved) and at the end of any phase or sizable change.

**Last reviewed:** 2026-08-15  
**Active phase:** none (Phase 1 done)  
**Next recommended work:** [Phase 2 — Local song playback](./ROADMAP.md#phase-2--local-song-playback)

Plan and acceptance criteria: [`ROADMAP.md`](./ROADMAP.md)

---

## What it is

A pixel-art meadow that grows from **voice**: pitch, loudness, timbre, and rhythm become kind, hue, size, and motion. Microphone in, autocorrelation pitch detector, flowers from voice, grass from quiet. Art Nouveau frame and palette (Mucha / Tiffany jewel tones).

Shipped loop: **Listen → speak/hum → flowers; pause → grass; Clear garden.**

---

## Current snapshot

| Area | Status |
| --- | --- |
| Mic pitch garden | **Shipped** — Listen / Pause / Clear |
| Pitch → kind + hue | **Shipped** — log2 80–1000 Hz |
| Loudness → stem + bloom | **Shipped** — log RMS, AGC off |
| Timbre → kind nudge + contrast | **Shipped** — spectral centroid |
| Rhythm → sway / petal-open | **Shipped** — garden-level onset pulse |
| Silence → grass | **Shipped** |
| Local file / song playback | **Built, unhooked** — `SongPlayer` + CSS, not in `main.ts` |
| Spotify previews | **Hidden** — API + Vite plugin exist; UI gone |
| Qobuz streaming | **Hidden / deferred** — API + Vite plugin exist; UI gone |
| Export / share | **Not started** |
| Tests | **None** |
| Deploy | GitHub Pages (`base: /Synesthesia-garden/`) or Vercel (`VERCEL` → `/`) |

---

## What works in the running app

UI in `src/main.ts` is mic-only:

- **Listen / Pause** — `getUserMedia`, echo cancellation / noise suppression on, **AGC off**
- **HUD** — Pitch (Hz + log fill), Loudness, Timbre
- **Clear garden** — resets plants, spawn cursor, and last onset
- **Pixel garden** — 240×160 logical, integer scale 2–3, seven flower kinds, swaying grass, blocky clouds, Nouveau window chrome

Pitch pipeline (`src/audio/pitch.ts`):

- Autocorrelation + parabolic interpolation
- Voice if RMS ≥ `0.012` and Hz in 80–1000
- `pitchNorm` is **log2** in that range (drives kind walk + hue)
- `loudnessT` log-maps RMS from silence to ~0.25
- `timbreT` log-maps spectral centroid ~200–4000 Hz
- Onset via spectral flux and positive d(RMS)/dt (~120 ms refractory)

Garden (`src/garden/world.ts`):

- Flower every 220 ms while voiced; stores `pitchT`, `loudnessT`, `timbreT`
- Kind: `round(pitchT * 6 + (timbreT - 0.5) * 2.5)` clamped 0–6
- Stem ~5–14 logical px × grow envelope; quiet = compact bloom, loud = full petals
- Bright timbre raises petal contrast; onsets add ~200 ms extra sway + petal-open
- Grass after ~360 ms accumulated pause
- Placement is a **left-to-right cell grid** with light jitter, then wrap
- Cap 480 plants; oldest spliced off (no wilt)

Manual checks (2026-08-15): sung scale walks all 7 kinds; low vs high → different kinds/hues; quiet vs belt at one pitch → stem/bloom only; oo vs ee at one pitch → kind + contrast; staccato refreshes onset, drone does not; silence → grass.

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

### Phase 2 — Playback

- No file picker, no play bar, no `SongPlayer` wiring
- Mic and media cannot be chosen in the UI (detector supports both)

### Phase 3 — Garden feel

- Grid fill reads mechanical after ~30s
- `pauseAccum += 16` assumes ~60 fps, not real frame delta
- No seed/bloom/wilt; trim is a hard splice
- Sky is static

### Phase 4 — Keep

- No PNG, seed, or clip

### Phase 5 — Perf

- Soil speckles: per-pixel `fillRect` every frame (~240 × 90)
- Plants copy-sorted by `y` every frame
- Naive autocorrelation on fftSize 2048 every frame

### Phase 6 — Teach / a11y

- HUD shows pitch / loudness / timbre bars, but no legend or note name
- Listen has no `aria-pressed`; no keyboard shortcuts
- No `prefers-reduced-motion`
- Google Fonts CDN in `src/style.css`

### Phase 7 — Hygiene

- `tsconfig.json` `include` is `["src"]` — `api/` and Vite plugins are not in `npm run build` typecheck
- README is accurate for the **voice** garden; it does not mention this tracker or the hidden stack
- `vite.config.ts` comment (“Spotify is active now”) disagrees with README and `.env.example`

---

## Roadmap progress

| Phase | Name | Status |
| --- | --- | --- |
| 1 | Richer audio mapping | Done |
| 2 | Local song playback | Code present, UI unhooked |
| 3 | Organic garden + lifecycle | Not started |
| 4 | Keep what grew (PNG / share) | Not started |
| 5 | Canvas + pitch performance | Not started |
| 6 | Teach the mapping + a11y | Not started |
| 7 | Engineering hygiene | Not started |
| — | Spotify / Qobuz | Deferred (code retained) |

---

## Layout (as of last review)

```
src/main.ts                 UI + rAF loop (mic only)
src/audio/pitch.ts          Detector + log pitch / loudness / timbre / onset
src/audio/songPlayer.ts     Unused by UI
src/audio/spotifyUrl.ts     Unused by UI
src/audio/qobuzUrl.ts       Unused by UI
src/garden/world.ts         Spawn rules + lastOnset
src/garden/renderer.ts      Full-scene draw each frame
src/garden/sprites.ts       Pixel flowers / grass (loudness + timbre + pulse)
src/garden/palette.ts       Nouveau colors + pitch hue + timbre sat
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
