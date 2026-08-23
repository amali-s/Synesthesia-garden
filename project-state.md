# Project state

Living snapshot of Synesthesia Garden. Update this file at the start of a session (if the repo moved) and at the end of any phase or sizable change.

**Last reviewed:** 2026-08-23 (Phase 6 Keep)  
**Active phase:** none (Phases 1–6 done)  
**Next recommended work:** [Phase 7 — Canvas + pitch performance](./ROADMAP.md#phase-7--canvas--pitch-performance)

Plan and acceptance criteria: [`ROADMAP.md`](./ROADMAP.md)

---

## What it is

A pixel-art meadow that grows from **voice or music already playing on the device**: pitch, loudness, timbre, and rhythm become kind, hue, size, and motion. Speaker mode uses the microphone; Music mode captures tab/window/system audio. Autocorrelation pitch detector; flowers from pitched sound, grass from quiet. Art Nouveau frame and palette (Mucha / Tiffany jewel tones).

Shipped loop: **Speaker or Music → Listen → flowers; pause → grass in gaps; Stop (same button); hover/tap a bloom to hear its pitch; Keep a framed PNG; Clear garden.**

---

## Current snapshot

| Area | Status |
| --- | --- |
| Mic pitch garden | **Shipped** — Listen / Stop on one primary button; Keep; Clear |
| Speaker vs Music listen | **Shipped** — segmented cream/brass toggle; Music uses `getDisplayMedia` + Share audio; only Listen is filled green |
| Pitch → patch; chroma + timbre → kind/hue | **Shipped** — log2 80–1000 Hz (Speaker); 50–4000 Hz (Music) |
| Loudness → stem + bloom | **Shipped** — log RMS, AGC off |
| Timbre → kind (with chroma) + contrast | **Shipped** — spectral centroid |
| Rhythm → sway / petal-open | **Shipped** — per-plant breeze + gust; onset pulse ripples across `x`; grass rustles |
| Silence → grass | **Shipped** — grass fills empty cells |
| Percussion → motion only | **Shipped** — drum-like frames pulse, do not plant |
| Duration + pan → side | **Shipped** — long vs staccato and L/R as combined x biases |
| Section energy → depth | **Shipped** — quiet front, loud/chorus back |
| Tempo → spawn rate | **Shipped** — BPM from inter-onset intervals; cooldown 105–480 ms |
| Bloom chime | **Shipped** — hover (desktop) / tap (touch) plays stored `hz`; grass silent |
| Full-page meadow | **Shipped** — 320×200 logical, canvas fills leftover viewport |
| Organic placement | **Shipped** — even fill of empty cells in each patch |
| Lifecycle | **Shipped** — seed → bloom → rest; oldest wilt instead of splice |
| Listen-time sky | **Shipped** — low-opacity hour gel on the canvas (cool → bright → warm; Pause holds; Clear keeps the clock) |
| Postcard PNG | **Shipped** — Keep downloads a framed vine-glass PNG (`synesthesia-garden-YYYY-MM-DD.png`); empty courtyard keeps the caption; plants hide it |
| Local file / song playback | **Deferred** — `SongPlayer` + CSS exist, not in `main.ts` (see Later) |
| Spotify previews | **Hidden** — API + Vite plugin exist; UI gone |
| Qobuz streaming | **Hidden / deferred** — API + Vite plugin exist; UI gone |
| Export / share | **PNG shipped** — share URL/seed and GIF/WebM not started (optional) |
| Tests | **None** |
| Deploy | GitHub Pages (`base: /Synesthesia-garden/`) or Vercel (`VERCEL` → `/`) |

---

## What works in the running app

UI in `src/main.ts` is a full-page meadow with two listen sources (one at a time):

- **Top bar** — Listen (Stop while capturing), Keep, Clear garden, **Speaker | Music**, pitch meter
- **Speaker** (default) — `getUserMedia`, echo cancellation / noise suppression on, **AGC off**, vocal 80–1000 Hz
- **Music** — `getDisplayMedia` with audio required; video track muted/ignored; echo cancel / noise suppress / AGC **off**; pitch window **50–4000 Hz** for planting *and* `pitchNorm` (so high instruments are not all clamped to the top bed). Capture is **not** played through the garden (no double audio)
- **Listen / Stop** — one `#listen-btn` (`.btn.primary`, `aria-pressed` while capturing). Idle label **Listen** starts the selected mode; while listening the same button reads **Stop**. Disabled only during the mic/share permission wait. Switching mode while listening stops the current stream, then starts the new one. Share-ended and capture errors return the button to Listen.
- **Keep** — one-click PNG of the vine window + glass (CSS frame composited around the live canvas). Caption “A courtyard at rest” is included only when the bed is empty. Filename `synesthesia-garden-YYYY-MM-DD.png`.
- **Clear garden** — instant reset of plants (listen-time sky keeps going); separate from Keep
- **Pixel garden** — 320×200 logical, integer backing scale; CSS fills the vine glass (square-pixel letterbox was tried, then dropped so the bed sits against the frame). **2×4** timber patches (`f0`–`f3` front / `b0`–`b3` back); empty visit shows gravel courtyard + “A courtyard at rest”; seven flower kinds; per-plant breeze + onset ripple; integer bloom dest sizes; green vine frame and Figma chrome
- **Bloom chime** — hover a flower (mouse/pen) or tap (touch) plays a short sine/bell at that plant’s stored `hz`; click while hovering chimes again; one hover-chime until the pointer leaves; grass and empty soil are silent; wilted blooms still chime while on screen. Uses the same AudioContext as Listen, routed to destination (not the analyser). `BloomChime.muted` is the later reduced-motion gate; it is not wired yet.

Pitch pipeline (`src/audio/pitch.ts`):

- Autocorrelation + parabolic interpolation
- Speaker: plant if RMS ≥ `0.012` and Hz in 80–1000
- Music: plant if RMS ≥ `0.008` and Hz in 50–4000 (`isVoice` is the plant gate for both)
- `pitchNorm` is **log2** 80–1000 Hz in Speaker, **50–4000 Hz** in Music (drives beds + mild sat/light; clamps outside)
- `pitchClassT` is octave position from A (drives petal hue + part of kind)
- `loudnessT` log-maps RMS from the mode’s silence floor to ~0.25
- `timbreT` log-maps spectral centroid ~200–4000 Hz
- Onset via spectral flux and positive d(RMS)/dt (~120 ms refractory)
- Mix layout (Phase 4): `durationMs` (reset on silence or ~3 semitone jump), `panT` from L/R RMS on display capture (center if mono / Speaker), `sectionEnergyT` (~1.45 s loudness smooth), `bpm` / `spawnScale` from inter-onset intervals, `percussive` when the spectrum is broadband and pitch is weak (`corr ≥ 0.52` always plants so sung pitch is not swallowed)

Garden (`src/garden/world.ts`):

- Flower while pitched; cooldown **105–480 ms** from tempo (220 ms at 120 BPM); drums do not spawn
- Stores `pitchT`, `loudnessT`, `timbreT`, `hz`
- `hitFlowerAt` — front-most flower in logical space (ignore grass / empty soil)
- Kind: `(round(timbreT * 6) + round(pitchClassT * 6)) % 7` — not register, so a patch can mix species
- Hue: chroma picks the family (soft walk is slate/sage/ice/butter/lilac/blush — not stacked pinks); high pitch/timbre mixes to jewel hexes; taupe wilt. Petal lite/deep are punched so blooms do not melt into one blob under the hour gel.
- Stem ~5–14 logical px × grow envelope; quiet = compact bloom, loud = full petals
- Bright timbre raises petal contrast + saturation; onsets add ~200 ms extra sway + petal-open, delayed by `x` so a beat rustles left→right; each stem has a hashed phase (slow breeze + gust); grass rustles on the same pulse; PNG bloom dest W/H round to whole logical pixels (hitboxes match)
- Grass after ~360 ms accumulated pause, using **real frame delta**
- Placement: empty soil cells across the whole patch, preferring spots farthest from plants already in the bed (no same-pitch clumps)
- Grass prefers empty neighbor cells
- Flowers fill a patch cell by cell on a grid that spans the whole soil (stems sit low in each cell so blooms stay on the dirt). Only when every cell has a living flower does a new bloom wilt the oldest in that bed and take its cell. Garden-wide cap ~560 living plants (flowers + grass); oldest wilt/fade (~2.6 s) instead of hard splice
- Lifecycle: seed (~0.8 s) → bloom (~12 s) → rest (droop) → wilt when over cap

Manual checks (2026-08-15): sung scale walks kinds; quiet vs belt at one pitch → stem/bloom only; oo vs ee at one pitch → kind + contrast; staccato refreshes onset, drone does not; silence → grass.

Mapping check (2026-08-22): a sung scale no longer dumps one red kind per timber; notes in one patch mix hues; same note in two octaves can share a kind across front/back.

Music path (2026-08-18): Speaker + Listen still mic-only; Music + Listen prompts tab/window share; no audio / cancel / Safari leaves Speaker working; streams are never mixed.

Music layout (2026-08-19): stereo mix uses L/R tap (not played through the garden); Speaker / mono pan stays center; duration, tempo, and section energy apply in both modes.

Bloom chime (2026-08-22): pointer maps canvas CSS box → backing store / `getScale()` → logical pixel. Flowers chime at stored `hz` (not the live mix); grass does not.

Keep (2026-08-23): offscreen canvas composites the live meadow with a 9-slice of `vine-frame.svg` (same slice/round as CSS `border-image`). No extra dependency. Share URL and clip deferred.

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

Done. Leftover: `baseHueForKind` is only a draw fallback if `baseHue` is omitted.

### Phase 2 — Music vs Speaker

Done. Leftovers / honest limits:

- Chrome/Edge tab share + “Share audio” is the reliable path; Safari is refused up front
- Firefox / some OS combos may offer share without an audio track — status says so
- Dominant pitch of the mix only (no source separation)
- Mode is session-only (not persisted)
- `SongPlayer` / file upload remains deferred (Later)
- **UI audit #3:** done — Speaker | Music is a cream/brass segmented toggle (shared inset pressed); only Listen is filled green

### Phase 3 — Garden feel

Done as a 2×4 timber grid + full-page shell. Picture leftovers (UI audit #1, #2, #6, #9–#11) shipped 2026-08-22:

- **Integer letterbox (#1):** backing store is still an integer scale. CSS fill of the glass was restored after letterbox left large side gutters and a postage-stamp bed. Pixels can be non-square on a wide window.
- **Empty courtyard (#2):** gravel walk + caption “A courtyard at rest”; no fake flowers; Clear empties instantly
- **Mobile HUD (#6):** top bar wraps; `--frame-pad` shrinks; overflow clipped so the eight patches stay in view
- **Listen-time sky (#9):** low-opacity canvas overlay (`hourTintForListenMs`); gravel courtyard underneath. Vertical sky bands were dropped (brown top stroke).
- **Per-plant wind (#10):** hashed phase, breeze + gust, onset ripple across `x`
- **Integer bloom sizes (#11):** `bloomPixelSize` rounds dest W/H; hit-test uses the same size

Still later: soil speckles redraw every frame (Phase 7); loudness/timbre meters left the HUD when the top bar took pitch only

### Phase 4 — Music mix layout

Done. Leftovers / honest limits:

- Dominant mix pitch only (no source separation or instrument→flower)
- Pan needs stereo tab/system capture; Speaker and silent-R “mono” stay center
- BPM is folded into ~58–188; noisy onset storms cannot drop cooldown below 105 ms
- No verse/chorus labels — section energy is smoothed loudness only

### Phase 5 — Replay bloom as chime

Done. Leftovers / honest limits:

- Approximate note (sine + partials), not a sample of the voice or mix
- No chord per cluster
- `BloomChime.muted` exists for Phase 8; chimes are not yet skipped for `prefers-reduced-motion`

### Phase 6 — Keep

Done (PNG). Leftovers / optional:

- No share URL / seed
- No GIF / WebM clip
- Postcard is a compositor (vine SVG 9-slice + live canvas), not an HTML screenshot — inner glass stroke is an approximation of `.window-frame::after`

### Phase 7 — Perf

- Soil speckles: per-pixel `fillRect` every frame (~320 × 112)
- Plants copy-sorted by `y` every frame
- Naive autocorrelation on fftSize 2048 every frame

### Phase 8 — Teach / a11y

UI audit #4, #5, #7, #8, #12, #15, #18:

- HUD shows pitch only; no legend, note name, or bed compass
- No hover inspect (kind + Hz close-up)
- Idle status does not teach hover-to-chime
- Listen now has `aria-pressed`; still no `:focus-visible` or keyboard shortcuts (mode toggle does use `aria-pressed`)
- No `prefers-reduced-motion`; `BloomChime.muted` unwired
- Clear garden has the same visual weight as Keep (cream/brass); Listen remains the only filled green

### Phase 9 — Hygiene

- `tsconfig.json` `include` is `["src"]` — `api/` and Vite plugins are not in `npm run build` typecheck
- README still describes the old centered layout, not the full-page meadow
- `vite.config.ts` comment (“Spotify is active now”) disagrees with README and `.env.example`
- **UI audit #17:** leftover `.song-form` / `.playback` / rounded HUD CSS
- Fonts are already local (Wittgenstein + VCR); drop stale Google Fonts notes in the roadmap (done in ROADMAP.md)

### Later (UI audit #13, #14)

- One frame language (pixel vine vs arched glass)
- Growth-stage flower sheets (bud / open / rest)

---

## Roadmap progress

| Phase | Name | Status |
| --- | --- | --- |
| 1 | Richer audio mapping | Done |
| 2 | Music mode vs Speaker mode | Done |
| 3 | Organic garden + lifecycle | Done |
| 4 | Music mix → garden layout | Done |
| 5 | Replay bloom as chime | Done |
| 6 | Keep what grew (PNG / share) | Done (PNG; share URL and clip optional leftover) |
| 7 | Canvas + pitch performance | Not started |
| 8 | Teach the mapping + a11y | Not started |
| 9 | Engineering hygiene | Not started |
| — | Spotify / Qobuz | Deferred (code retained) |

---

## Layout (as of last review)

```
src/main.ts                 UI + rAF loop (Speaker/Music top bar + meadow + bloom pointer + Keep)
src/audio/pitch.ts          Detector + mic / display capture + mix layout (pan, duration, tempo, drums)
src/audio/chime.ts          Short bloom tone at stored hz (shared AudioContext)
src/audio/songPlayer.ts     Unused by UI
src/audio/spotifyUrl.ts     Unused by UI
src/audio/qobuzUrl.ts       Unused by UI
src/garden/world.ts         Clusters, mix-layout x/y, tempo cooldown, gap grass, lifecycle, bloom hit-test
src/garden/renderer.ts      Full-scene draw; gravel courtyard; hour gel; per-plant wind
src/garden/postcard.ts      Framed PNG composite (vine 9-slice + glass)
src/garden/sprites.ts       Pixel flowers / grass (life + wilt)
src/garden/palette.ts       GROUND + ACCENTS + punchier bloom walk + hour gel
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
