# Project state

Living snapshot of Synesthesia Garden. Update this file at the start of a session (if the repo moved) and at the end of any phase or sizable change.

**Last reviewed:** 2026-08-27 (Music YIN melody-band pick)  
**Active phase:** none (Phases 1–9 done; Forage is the take-home)  
**Next recommended work:** [Later / deferred craft](./ROADMAP.md#later--deferred) — one frame language, growth-stage sheets, share URL / clip, PWA

Plan and acceptance criteria: [`ROADMAP.md`](./ROADMAP.md)

---

## What it is

A pixel-art meadow that grows from **voice or music already playing on the device**: pitch, loudness, timbre, and rhythm become kind, hue, size, and motion. Speaker mode uses the microphone; Music mode captures tab/window/system audio. YIN pitch detector (downsampled); flowers from pitched sound, grass from quiet. Art Nouveau frame and palette (Mucha / Tiffany jewel tones).

Shipped loop: **Speaker or Music → Play → flowers; pause → grass in gaps; Pause (same button); hover/tap a bloom to hear its pitch and inspect kind + note; Pause, then Forage — a fox harvests the fullest beds and mails a bouquet PNG; Clear garden (Undo for a few seconds).**

---

## Current snapshot

| Area | Status |
| --- | --- |
| Mic pitch garden | **Shipped** — Play / Pause on one primary button; Forage; Clear |
| Speaker vs Music listen | **Shipped** — segmented cream/brass toggle next to Pitch; Music uses `getDisplayMedia` + Share audio; only Play is filled green |
| Pitch → patch; chroma + timbre → kind/hue | **Shipped** — log2 80–1000 Hz (Speaker); 50–4000 Hz (Music) |
| Loudness → stem + bloom | **Shipped** — log RMS, AGC off |
| Timbre → kind (with chroma) + contrast | **Shipped** — spectral centroid |
| Rhythm → sway / petal-open | **Shipped** — per-plant breeze + gust; onset pulse ripples across `x`; grass rustles |
| Silence → grass | **Shipped** — grass fills empty cells |
| Percussion → motion only | **Shipped** — drum-like frames pulse, do not plant |
| Duration + pan → side | **Shipped** — long vs staccato and L/R as combined x biases |
| Section energy → depth | **Shipped** — quiet front, loud/chorus back |
| Tempo → spawn rate | **Shipped** — BPM from inter-onset intervals; cooldown 105–480 ms |
| Bloom chime | **Shipped** — hover (desktop) / tap (touch) plays stored `hz`; grass silent; muted under `prefers-reduced-motion` |
| Mapping HUD | **Shipped** — Hz + A440 note; corner map card (2×4 compass + legend); hover inspect |
| Keyboard / a11y | **Shipped** — L / C / K; ink/brass `:focus-visible`; reduced-motion freezes sway |
| Full-page meadow | **Shipped** — 320×200 logical, canvas fills leftover viewport |
| Organic placement | **Shipped** — even fill of empty cells in each patch |
| Lifecycle | **Shipped** — seed → bloom → rest; oldest wilt instead of splice |
| Listen-time sky | **Shipped** — low-opacity hour gel on the canvas (cool → bright → warm; Pause holds; Clear keeps the clock) |
| Postcard PNG | **Replaced** — Keep is gone. `postcard.ts` still has the vine compositor + `downloadBlob` |
| Forage bouquet | **Shipped** — Stop, then Forage (**K**). Fox harvests fullest beds (6–12 stems, max 4/patch); mailbox flag up at drop-off; small cream-wrap PNG. Empty / under 6: sniff and leave. Disabled while listening. |
| Local file / song playback | **Deferred** — `SongPlayer` exists, not in `main.ts`; its old centered CSS was deleted in Phase 9 (see Later) |
| Spotify previews | **Hidden** — API + plugin file exist; UI gone and dev middleware no longer registered |
| Qobuz streaming | **Hidden / deferred** — API + plugin file exist; UI gone and dev middleware no longer registered |
| Export / share | **Bouquet PNG shipped** — share URL/seed and GIF/WebM not started (optional) |
| Tests | **Shipped** — Vitest; `npm test` covers `pitchNorm`, `Garden.ingest`, forage planner, URL parsers |
| Typecheck | **Shipped** — `npm run build` runs `tsconfig.json` (`src`) **and** `tsconfig.node.json` (`api/`, Vite config, dev plugins) |
| Deploy | GitHub Pages (`base: /Synesthesia-garden/`) or Vercel (`VERCEL` → `/`) |

---

## What works in the running app

UI in `src/main.ts` is a full-page meadow with two listen sources (one at a time):

- **Top bar** — Play (Pause while capturing), Forage, Clear garden (ghost), helper copy, **Speaker | Music** next to the pitch meter (Hz + note)
- **Speaker** (default) — `getUserMedia`, echo cancellation / noise suppression on, **AGC off**, vocal 80–1000 Hz
- **Music** — `getDisplayMedia` with audio required; video track muted/ignored; echo cancel / noise suppress / AGC **off**; pitch window **50–4000 Hz** for planting *and* `pitchNorm` (so high instruments are not all clamped to the top bed). Capture is **not** played through the garden (no double audio)
- **Play / Pause** — one `#listen-btn` (`.btn.primary`, `aria-pressed` while capturing, `aria-keyshortcuts="P"`). Idle label **Play** starts the selected mode; while capturing the same button reads **Pause**. Disabled only during the mic/share permission wait. Switching mode while capturing stops the current stream, then starts the new one. Share-ended and capture errors return the button to Play. Keyboard **P** toggles the same path (ignored with Cmd/Ctrl/Alt).
- **Forage** — enabled only when not capturing (Pause first). Pixel fox enters top-left; if fewer than 6 living flowers can be taken under the caps, it sniffs and walks back out. Otherwise it harvests from the fullest patches (living count), at most 4 stems per bed and 12 in the bouquet (minimum 6). Picked flowers leave the bed. A mailbox sits in the top-right with its red flag down except while the fox is posting. Download is a small transparent PNG of the loose bunch in cream paper (`synesthesia-bouquet-YYYY-MM-DD.png`). Keyboard **K**. Reduced motion still plays the walk.
- **Clear garden** — ghost/secondary chrome (not Forage’s brass fill); instant reset of plants (listen-time sky keeps going); **Undo** for ~7 s from a plant snapshot; a new flower drops the snapshot. Keyboard **C**. Cancels an in-flight forage.
- **Pitch meter** — live Hz + equal-temperament note from A440 (`A4` / `C5`); idle shows `—`
- **Mapping card** — floating bottom-right on the meadow: 2×4 bed compass (same `bedFromPitch(pitchNorm)` as planting) + legend (low front-left → high back-right; timbre + chroma pick kind). Hover/tap a flower fills the card with a larger tinted sprite, kind name, Hz + note (chime still plays). Grass / empty soil stay silent and do not inspect.
- **Pixel garden** — 320×200 logical, integer backing scale; CSS fills the vine glass (square-pixel letterbox was tried, then dropped so the bed sits against the frame). **2×4** timber patches (`f0`–`f3` front / `b0`–`b3` back); empty visit shows gravel courtyard + “A courtyard at rest”; seven flower kinds from cropped ~43–68×78–86 sheets (was 16–28×32); dest height ~24–32 logical px; green vine frame and Figma chrome. Courtyard + timber + soil are cached offscreen and blit each frame; plants + live pitch pulse + mailbox/fox + hour gel draw on top.
- **Bloom chime** — hover a flower (mouse/pen) or tap (touch) plays a short sine/bell at that plant’s stored `hz`; click while hovering chimes again; one hover-chime until the pointer leaves; grass and empty soil are silent; wilted blooms still chime while on screen. Uses the same AudioContext as Play, routed to destination (not the analyser). `BloomChime.muted` follows `prefers-reduced-motion`.
- **Reduced motion** — `matchMedia('(prefers-reduced-motion: reduce)')` freezes sway / onset pulse / seed grow and the live pitch blink; lifecycle still advances. Keyboard focus uses ink/brass `:focus-visible` rings on `.btn` / `.mode-btn`.

Pitch pipeline (`src/audio/pitch.ts`):

- YIN (de Cheveigné) on a DC-removed, box-downsampled window (4× when Nyquist allows, else 2×/1×); parabolic tau; reused scratch buffers (no per-sample alloc)
- Speaker: plant if RMS ≥ `0.012` and Hz in 80–1000; classic first-dip YIN
- Music: plant if RMS ≥ `0.008` and Hz in 50–4000 (`isVoice` is the plant gate for both). YIN highpasses (~18 dB/oct at 140 Hz) then prefers a lead in **180–1000 Hz**; hats above 1400 Hz ignored; bass only if that pass finds nothing. 2×4 bed map unchanged.
- `pitchNorm` is **log2** 80–1000 Hz in Speaker, **50–4000 Hz** in Music (drives beds + mild sat/light; clamps outside)
- `pitchClassT` is octave position from A (drives petal hue + part of kind)
- `noteNameFromHz` is equal-temperament from A440 (HUD / inspect only; does not change beds or kind)
- `loudnessT` log-maps RMS from the mode’s silence floor to ~0.25
- `timbreT` log-maps spectral centroid ~200–4000 Hz
- Onset via spectral flux and positive d(RMS)/dt (~120 ms refractory)
- Mix layout (Phase 4): `durationMs` (reset on silence or ~3 semitone jump), `panT` from L/R RMS on display capture (center if mono / Speaker), `sectionEnergyT` (~1.45 s loudness smooth), `bpm` / `spawnScale` from inter-onset intervals, `percussive` when the spectrum is broadband and pitch is weak (`corr` is 1 − YIN CMND; `corr ≥ 0.52` always plants so sung pitch is not swallowed)

Garden (`src/garden/world.ts`):

- Flower while pitched; cooldown **105–480 ms** from tempo (220 ms at 120 BPM); drums do not spawn
- Stores `pitchT`, `loudnessT`, `timbreT`, `hz`
- `hitFlowerAt` — front-most flower in logical space (ignore grass / empty soil)
- Kind: `(round(timbreT * 6) + round(pitchClassT * 6)) % 7` — not register, so a patch can mix species
- Hue: chroma picks the family (soft walk is slate/sage/ice/butter/lilac/blush — not stacked pinks); high pitch/timbre mixes to jewel hexes; taupe wilt. Petal lite/deep are punched so blooms do not melt into one blob under the hour gel.
- Stem ~5–14 logical px × grow envelope; quiet = compact bloom (~24 logical px), loud = full petals (~32); PNG sheets are cropped 100px art
- Bright timbre raises petal contrast + saturation; onsets add ~200 ms extra sway + petal-open, delayed by `x` so a beat rustles left→right; each stem has a hashed phase (slow breeze + gust); grass rustles on the same pulse; PNG bloom dest W/H round to whole logical pixels (hitboxes match)
- Grass after ~360 ms accumulated pause, using **real frame delta**
- Placement: empty soil cells across the whole patch, preferring spots farthest from plants already in the bed (no same-pitch clumps)
- Grass prefers empty neighbor cells
- Flowers fill a patch cell by cell on a grid that spans the whole soil (stems sit low in each cell so blooms stay on the dirt). Only when every cell has a living flower does a new bloom wilt the oldest in that bed and take its cell. Garden-wide cap ~560 living plants (flowers + grass); oldest wilt/fade (~2.6 s) instead of hard splice
- Lifecycle: seed (~0.8 s) → bloom (~12 s) → rest (droop) → wilt when over cap
- Draw order: per-bed lists inserted by `y` (no copy-sort each frame); `hitFlowerAt` still sorts on pointer

Manual checks (2026-08-15): sung scale walks kinds; quiet vs belt at one pitch → stem/bloom only; oo vs ee at one pitch → kind + contrast; staccato refreshes onset, drone does not; silence → grass.

Mapping check (2026-08-22): a sung scale no longer dumps one red kind per timber; notes in one patch mix hues; same note in two octaves can share a kind across front/back.

Music path (2026-08-18): Speaker + Listen still mic-only; Music + Listen prompts tab/window share; no audio / cancel / Safari leaves Speaker working; streams are never mixed.

Music layout (2026-08-19): stereo mix uses L/R tap (not played through the garden); Speaker / mono pan stays center; duration, tempo, and section energy apply in both modes.

Bloom chime (2026-08-22): pointer maps canvas CSS box → backing store / `getScale()` → logical pixel. Flowers chime at stored `hz` (not the live mix); grass does not.

Keep (2026-08-23): offscreen canvas composites the live meadow with a 9-slice of `vine-frame.svg`. Replaced by Forage (2026-08-25). Share URL and clip still deferred.

Forage (2026-08-25): fox harvests fullest beds (6–12, max 4/patch), mailbox flag at drop-off, cream-wrap bouquet PNG. Keep is gone.

Mapping HUD (2026-08-24): note name beside Hz; corner card holds the 2×4 compass + legend; hover inspect reuses the tinted sprite path. Clear is ghost chrome with a few-second undo.

Hygiene smoke (2026-08-25): after the dead-CSS deletes, a synthetic sawtooth sweep (110–784 Hz) fed through the real Speaker path planted across seven beds with mixed kinds per patch; 788 Hz inspected as Star / G5 in the back-right bed, matching `bedFromPitch`. Listen/Stop, L / C / K, hover chime + inspect, Keep (595 kB PNG, `synesthesia-garden-2026-08-25.png`), Clear → Undo → "Garden restored", the Music share-audio copy, and the ink `:focus-visible` ring all survived. `/api/spotify-preview` and `/api/qobuz-*` return 404 in dev.

---

## Built but not in the product

These files are in the tree; the live UI does not use them.

| Piece | Path | Notes |
| --- | --- | --- |
| Song player | `src/audio/songPlayer.ts` | File or URL → `PitchDetector.attachMediaElement` |
| Media / node tap | `PitchDetector` | `attachMediaElement`, `connectSource` unused by `main.ts` |
| Spotify URL + resolve | `src/audio/spotifyUrl.ts`, `api/spotify-preview.ts` | 30s preview; parser covered by tests |
| Qobuz URL + stream | `src/audio/qobuzUrl.ts`, `api/qobuz-resolve.ts`, `api/qobuz-stream.ts` | Full-track; ToS risk; parser covered by tests |
| Dev middleware | `vite-plugin-spotify-api.ts`, `vite-plugin-qobuz-api.ts` | On disk, **not registered** in `vite.config.ts` (Phase 9) |

`.env.example`, `README.md`, and `vite.config.ts` now agree: streaming is hidden and Listen needs no secrets. The song form / playback CSS was deleted in Phase 9 — re-wiring `SongPlayer` means writing new chrome that matches the top bar, not reviving the old centered panel.

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

Still later: loudness/timbre meters left the HUD when the top bar took pitch only

### Phase 4 — Music mix layout

Done. Leftovers / honest limits:

- Dominant mix pitch only (no source separation or instrument→flower). Music YIN now prefers a 180–1000 Hz lead over bass/hats, still one note at a time.
- Pan needs stereo tab/system capture; Speaker and silent-R “mono” stay center
- BPM is folded into ~58–188; noisy onset storms cannot drop cooldown below 105 ms
- No verse/chorus labels — section energy is smoothed loudness only

### Phase 5 — Replay bloom as chime

Done. Leftovers / honest limits:

- Approximate note (sine + partials), not a sample of the voice or mix
- No chord per cluster
- `BloomChime.muted` follows `prefers-reduced-motion` (Phase 8)

### Phase 6 — Keep

Done (PNG). Leftovers / optional:

- No share URL / seed
- No GIF / WebM clip
- Postcard is a compositor (vine SVG 9-slice + live canvas), not an HTML screenshot — inner glass stroke is an approximation of `.window-frame::after`

### Phase 7 — Perf

Done. Gravel / timber / soil / speckles / rivets blit from an offscreen 320×200 × integer-scale cache (rebuild on `setScale` / `resize` and when hour-shadow `dx,dy` steps). Hour gel stays a cheap per-frame rect. Plants insert by `y` per bed. Pitch is downsampled YIN; `corr` mapped so drums stay motion-only.

### Phase 8 — Teach / a11y

Done. Corner map card (legend + 2×4 compass), Hz + A440 note, hover inspect, idle chime hint (Music Share-audio copy stays), L / C / K, `:focus-visible` ink/brass rings, reduced-motion mute + frozen sway, quieter Clear with optional undo. Mapping math unchanged.

Leftovers / honest limits:

- Inspect overlay is pointer/tap, not a keyboard-focusable dialog
- Undo window is ~7 s and cancels on the next flower (grass alone does not)

### Phase 9 — Hygiene

Done. Shipped 2026-08-25:

- **Vite plugins:** `spotifyApiPlugin()` / `qobuzApiPlugin()` are no longer registered. `npm run dev` returns 404 for `/api/spotify-preview`, `/api/qobuz-resolve`, `/api/qobuz-stream`; the plugin files stay on disk with a Later comment in `vite.config.ts`.
- **Typecheck:** new `tsconfig.node.json` covers `api/**`, `vite.config.ts`, `vitest.config.ts`, and both dev plugins (Node types, no DOM). `npm run typecheck` runs both configs and `npm run build` calls it, so a broken handler fails the build.
- **Tests:** Vitest (`npm test`, `npm run test:watch`), 61 tests in `src/**/*.test.ts` — `pitchNorm` (both windows, clamps, constant per-octave step), Music YIN melody-band mix (bass+vocal, synth+bass, bass-only), `Garden.ingest` (plant, cooldown, bed split, grass after a pause, drums plant nothing, clear / listen clock / undo), and both URL parsers. No network, canvas, or Vite-plugin tests.
- **Dead HUD CSS (UI audit #17):** deleted `.hud`, `.meters`, `.file-btn`, `.song-*`, `.playback*`, `.hint`, `@keyframes rise`, the rounded gold radii that came with them, and the `:root` tokens only those rules used. Live chrome untouched.
- **Fonts:** both `@font-face` faces are live and local; no CDN, `@import`, or stale Google Fonts comment anywhere in the tree.
- **README + `index.html`:** rewritten for the Speaker/Music meadow, the honest Music limits, real scripts, and the two deploy base paths.

Leftovers / honest limits:

- Tests are not wired into CI; `npm run build` is typecheck + Vite only
- A few declared-but-unused CSS colors were removed with the dead rules; `palette.ts` remains the source of truth for canvas color
- Browser smoke used a synthetic oscillator stream in place of the mic (no automated browser test)

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
| 6 | Keep what grew (PNG / share) | Done (Forage bouquet PNG; share URL and clip optional leftover) |
| 7 | Canvas + pitch performance | Done |
| 8 | Teach the mapping + a11y | Done |
| 9 | Engineering hygiene | Done |
| — | Spotify / Qobuz | Deferred (code retained, middleware unregistered) |

---

## Layout (as of last review)

```
src/main.ts                 UI + rAF loop (Speaker/Music top bar + meadow + mapping card + bloom pointer + Forage)
src/audio/pitch.ts          Detector (YIN) + mic / display capture + mix layout (pan, duration, tempo, drums)
src/audio/chime.ts          Short bloom tone at stored hz (shared AudioContext)
src/audio/songPlayer.ts     Unused by UI
src/audio/spotifyUrl.ts     Unused by UI
src/audio/qobuzUrl.ts       Unused by UI
src/garden/world.ts         Clusters, mix-layout x/y, tempo cooldown, gap grass, lifecycle, bloom hit-test, per-bed y-insert, forage harvest
src/garden/renderer.ts      Full-scene draw; cached courtyard/beds; mailbox + fox overlay; hour gel; per-plant wind
src/garden/forage.ts        Fullest-bed planner + fox walk / pick / mail / sniff
src/garden/critters.ts      Pixel fox + mailbox
src/garden/bouquet.ts       Small cream-wrap bouquet PNG
src/garden/postcard.ts      `downloadBlob` (+ unused vine postcard compositor)
src/garden/sprites.ts       Pixel flowers / grass (life + wilt)
src/garden/palette.ts       GROUND + ACCENTS + punchier bloom walk + hour gel
src/**/*.test.ts            Vitest: pitch mapping, garden ingest, forage planner, URL parsers
api/                        Vercel functions (hidden features)
vite-plugin-*-api.ts        Dev stubs for those APIs (not registered)
tsconfig.json               Browser typecheck (src)
tsconfig.node.json          Node typecheck (api, vite/vitest config, dev plugins)
vitest.config.ts            Node environment, src/**/*.test.ts only
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
