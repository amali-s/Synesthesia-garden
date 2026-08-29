# Phase 9 — Engineering hygiene

Implement **Phase 9** of Synesthesia Garden. Phases 1–8 are done. Do **not** start Later items (share URL, GIF/WebM, SongPlayer, Spotify/Qobuz UI, one frame language, growth-stage sheets).

Read first: [`ROADMAP.md`](./ROADMAP.md) (Phase 9), [`project-state.md`](./project-state.md). Update `project-state.md` when the phase ships.

**Done when:** `npm run build` typechecks what we ship, dead paths are either gone or clearly marked deferred, and the README matches the running app.

**Touches (roadmap):** `vite.config.ts`, `tsconfig.json`, `src/style.css`, `README.md`, tests under `src/`, maybe `api/` tsconfig, `index.html`, `.env.example`. Keep mapping math, Listen/Music capture, garden layout, chime, Keep PNG, and Phase 8 HUD as-is.

---

## Product as it stands (do not regress)

Full-page 320×200 meadow. Top bar: **Listen** (Stop while capturing, `aria-pressed`, only filled green), **Keep** (PNG), **Clear garden** (ghost + Undo), **Speaker | Music** segmented toggle, pitch meter (`— Hz` / live Hz + A440 note), status line.

- Speaker: mic, 80–1000 Hz. Music: `getDisplayMedia` + Share audio, 50–4000 Hz; capture is not played through the garden.
- Pitch log-maps into 8 timber beds (`src/garden/beds.ts`): left→right then front→back. Kind = timbre + chroma, not register.
- Hover/tap a flower chimes + inspect. `BloomChime.muted` follows `prefers-reduced-motion`.
- Mapping card (compass + legend) bottom-right. Keyboard **L** / **C** / **K**.
- Keep downloads a framed vine-glass PNG. Fonts are already local (Wittgenstein + VCR OSD Mono).

**Not in the product (code retained, UI hidden):**

| Piece | Path |
| --- | --- |
| Song player | `src/audio/songPlayer.ts` |
| Spotify URL + preview API | `src/audio/spotifyUrl.ts`, `api/spotify-preview.ts`, `api/_lib/spotify.ts` |
| Qobuz URL + stream API | `src/audio/qobuzUrl.ts`, `api/qobuz-resolve.ts`, `api/qobuz-stream.ts`, `api/_lib/qobuz.ts` |
| Dev middleware | `vite-plugin-spotify-api.ts`, `vite-plugin-qobuz-api.ts` — **still loaded** in `vite.config.ts` |
| Dead HUD CSS | `.hud`, `.meters`, `.song-form`, `.playback`, `.file-btn`, `.hint` in `src/style.css` |

`.env.example` already says streaming is hidden and Listen needs no secrets. `vite.config.ts` still comments “Spotify is active now” and registers both plugins.

---

## Work (UI audit #17 + hygiene)

### 1. Align Vite plugins with the UI

Do not load Spotify/Qobuz middleware while those UIs are hidden.

- Stop registering `spotifyApiPlugin()` and `qobuzApiPlugin()` in `vite.config.ts`.
- Fix the comment (“Spotify is active now”) so it matches README / `.env.example`.
- Keep the plugin files and `api/` on disk (deferred, not deleted). A short comment pointing at Later is enough.
- `npm run dev` must not hit `/api/spotify-preview` or `/api/qobuz-*`. Listen still needs no secrets.

### 2. Typecheck `api/`

`tsconfig.json` `include` is `["src"]` only. `api/` and the Vite plugins are not in `npm run build` (`tsc && vite build`).

- Typecheck the Vercel functions (`api/**/*.ts`) and, if practical, the Vite plugins.
- Prefer a second config (`tsconfig.api.json` or similar) over stuffing Node/Vercel types into the browser `src` config. `@vercel/node` is already a dependency.
- Do not change handler behavior. `npm run build` (or a script it calls) must fail if `api/` does not typecheck.

### 3. Tests

There is no test runner today. Add a small one that fits Vite + TypeScript (Vitest is the natural match). Keep the suite fast and mapping-focused.

**`pitchNorm`** (`src/audio/pitch.ts`):

- Speaker: log2 80–1000 Hz. Music: log2 50–4000 Hz.
- Floor/ceiling clamp (below min → 0, above max → 1).
- A sung octave should move `pitchNorm` by a similar amount in the middle of the window (not linear Hz).

**`Garden.ingest`** (`src/garden/world.ts`):

- Pitched `isVoice` sample plants a flower (respect spawn cooldown).
- Quiet / non-voice after a pause sprouts grass (use `tick` then `ingest` with real `now` deltas — pause uses frame dt).
- `percussive: true` must not spawn a flower.
- `clear()` empties plants; `listenMs` is not reset by clear (sky clock).

**URL parsers if streaming stays in the tree** (it does — deferred, not deleted):

- `parseSpotifyTrackUrl`: `open.spotify.com/track/…`, `spotify:track:…`, empty, Qobuz URL, playlist/no-id.
- `parseQobuzTrackUrl`: store/play URLs with a track id, empty, Spotify URL.

Do not test network calls, Vite plugins, or canvas. `npm test` should run the suite; `npm run build` can stay typecheck + Vite unless you want tests in CI later.

### 4. Fonts

Display/body are already local (`@font-face` for Wittgenstein + VCR OSD Mono in `src/style.css`). No Google Fonts CDN in `index.html`.

- Sweep for leftover Google Fonts comments or unused `@font-face`.
- Do not add a CDN. Do not change the two live faces.

### 5. Dead HUD CSS (audit #17)

`src/main.ts` never mounts `.hud`, `.song-form`, `.playback`, `.file-btn`, or `.hint`. Those rules describe the old centered upload UI.

**Delete** (or quarantine in a clearly named unused block only if you must keep them for Later file-playback):

- `.hud` (the old bottom panel; live chrome is `.top-bar`)
- `.meters` (plural wrapper — unused; keep `.meter`, `.pitch-meter`, `.meter-*` — those are live)
- `.file-btn`, `.song-form`, `.song-label`, `.song-row`, `.song-input` (+ placeholder/focus)
- `.playback`, `.playback-track`, `.playback-fill`, `.playback-time`
- `.hint`
- `@keyframes rise` if nothing live uses it after the deletes

**Keep** live chrome: `.top-bar`, `.btn`, `.mode-btn`, `.meter` / `.pitch-meter`, `.status`, `.map-modal`, `.window-frame`, `:focus-visible` rings, reduced-motion media query.

Rounded gold radii (`border-radius: 4px 18px …`) on the dead panel/input/playback blocks go with them. Do not restyle the live top bar or meadow to “fix” frame language (that is Later).

### 6. README

Rewrite to match the shipped app. The current README still says “grows from vocal pitch” and a centered layout.

Must include:

- What it is: pixel meadow from **voice (Speaker)** or **music already playing (Music)**.
- Shipped loop: Speaker or Music → Listen → flowers; hover/tap to chime + inspect; Keep PNG; Clear (Undo).
- Honest Music limits: Chrome/Edge tab share + “Share audio”; Safari refused; no file upload.
- Link [`ROADMAP.md`](./ROADMAP.md) and [`project-state.md`](./project-state.md).
- Develop / deploy / scripts as they actually are (`npm run dev`, `npm run build`, `npm test` once it exists). GitHub Pages `base: /Synesthesia-garden/` vs Vercel `/`.
- Streaming hidden; Listen needs no secrets.

Also fix `index.html` meta description if it still says voice-only.

---

## Constraints

- Do not change pitch / kind / bed / spawn mapping, chime, Keep compositor, or Phase 8 HUD behavior.
- Do not wire `SongPlayer`, Spotify, or Qobuz back into `main.ts`.
- Do not delete `api/`, `vite-plugin-*-api.ts`, `songPlayer.ts`, or URL parsers — mark them deferred.
- Do not start Later craft (one frame language, growth-stage sheets, share URL, PWA).
- After shipping: update `project-state.md` (last reviewed, active phase → none, Phase 9 row → Done, known gaps, “Built but not in the product”, next recommended work → Later).

## Verify

1. `npm run build` succeeds and typechecks `src` **and** `api/`.
2. `npm test` covers `pitchNorm`, `Garden.ingest` (plant / grass / drums / clear), and URL parsers.
3. `npm run dev` starts with no Spotify/Qobuz plugin; Listen still works with no `.env` secrets.
4. Dead CSS gone: grep `src/style.css` for `.song-form`, `.playback`, `.file-btn`, `.hud` — no live rules (or only a named unused quarantine).
5. README + `index.html` description match Speaker/Music, Keep, chime, mapping card.
6. Browser smoke (do not finish on a screenshot): Speaker Listen still plants; Music copy still honest; Keep PNG; Clear + Undo; hover inspect; keyboard L/C/K. Mapping must look unchanged.

If browser tools are available, exercise the loop; do not finish on a screenshot alone.
