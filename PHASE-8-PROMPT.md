# Phase 8 — Teach the mapping + accessibility

Implement **Phase 8** of Synesthesia Garden. Phases 1–7 are done. Do **not** start Phase 9 (hygiene, dead CSS, README, Vite plugins).

Read first: [`ROADMAP.md`](./ROADMAP.md) (Phase 8), [`project-state.md`](./project-state.md). Update `project-state.md` when the phase ships.

**Done when:** a new visitor can predict the next bloom from the HUD, and the app is usable from the keyboard with `prefers-reduced-motion` respected.

**Touches (roadmap):** `src/main.ts`, `src/style.css`, `index.html`. You will also need `src/garden/renderer.ts`, `src/garden/world.ts`, `src/garden/bloomArt.ts` / `sprites.ts`, and `src/audio/chime.ts` for inspect, reduced-motion, and undo. Keep mapping math as-is.

---

## Product as it stands (do not regress)

Full-page 320×200 meadow. Top bar: **Listen** (Stop while capturing, `aria-pressed`, only filled green), **Keep** (PNG), **Clear garden**, **Speaker | Music** segmented toggle, pitch meter (`— Hz` / live Hz), status line.

- Speaker: mic, 80–1000 Hz. Music: `getDisplayMedia` + Share audio, 50–4000 Hz; capture is not played through the garden.
- Pitch log-maps into 8 timber beds (`src/garden/beds.ts`): left→right then front→back. Front-left `f0` = lowest; back-right `b3` = highest.
- Kind = `(round(timbreT * 6) + round(pitchClassT * 6)) % 7` → `daisy | tulip | bell | rose | star | poppy | orchid`. Register does **not** pick species.
- Hover (mouse/pen) or tap (touch) a flower chimes at stored `hz` via `BloomChime`. Grass / empty soil silent. `BloomChime.muted` exists and is **unwired**.
- `Garden.clear()` is instant and keeps listen-time sky. No snapshot/undo yet.
- No keyboard shortcuts, no `:focus-visible`, no legend / note name / bed compass / hover inspect / reduced-motion.

---

## Work (UI audit #4, #5, #7, #8, #12, #15, #18)

### 1. Legend

Tiny HUD key, not a README. Copy must match the real mapping:

- Pitch walks **left → right, then front → back** (low front-left, high back-right).
- **Timbre + chroma → kind** (not register). Bright vs dark changes species; a scale mixes kinds inside one patch.

Keep it short. Hide or collapse on very narrow HUD if the top bar already wraps; never clip the eight patches.

### 2. Note name + bed compass

- Next to Hz, show equal-temperament note from A440, e.g. `A4` / `C5` (and `—` when there is no planted pitch).
- Tiny **2×4 compass** of the timber grid. Highlight the bed for the current `pitchNorm` (same `bedFromPitch` as planting). Idle / unpitched: no highlight (or a dim empty grid). The meter should read as a **map**, not only a bar.

Speaker vs Music windows differ (80–1000 vs 50–4000); the compass follows `pitchNorm(hz, listenMode)`.

### 3. Idle chime hint (audit #4)

`idleStatus()` today:

- Speaker: `Tap Listen to plant with your voice`
- Music: Share-audio copy (keep that honest; Safari / no-capture copy stays)

Teach hover/tap-to-chime **without** burying Music’s Share-audio instruction. E.g. Speaker idle can mention bloom chime; Music idle can keep Share audio as the primary line and add a short chime hint if it still fits. Listening / blooming / grass / beat status can stay as they are.

### 4. Hover inspect (audit #8)

Garden blooms are too small to read as species. On hover (desktop) / tap (touch) of a flower:

- Brief close-up: **larger tinted sprite** (reuse existing tint path in `bloomArt.ts` / `drawBloomArt`), **kind name**, **Hz + note**.
- Grass and empty soil: no inspect.
- Wilted-but-visible flowers may inspect (they already chime).
- Do not steal the chime: inspect + chime together is correct.
- Prefer a small HTML overlay near the HUD or pointer so it is readable; do not cover the whole meadow. Clear inspect when the pointer leaves / after a short tap timeout on touch.
- Optional: `aria-live` polite update of kind + note (keep it quiet — not every rAF).

### 5. Keyboard (L / C)

- **`L`** — same as Listen / Stop (toggle). Ignore when focus is in a text field (none today; still guard).
- **`C`** — Clear garden (same path as the button, including undo if you add it).
- Keep exists: add **`K`** for Keep/export (roadmap: “C clear (and export if Keep exists)”).
- Do not hijack when a modifier is held (Cmd/Ctrl/Alt) so browser shortcuts still work.
- Buttons remain clickable; shortcuts are extra. `aria-keyshortcuts` on the buttons is welcome.

### 6. `:focus-visible` + Listen a11y (audit #5)

Listen already has `aria-pressed`. Mode toggle does too.

- Ink/brass **`:focus-visible` rings** on `.btn`, `.mode-btn`, and any new legend/inspect controls. Do not `outline: none` without a visible replacement.
- Keyboard users must see which control is active. Match existing cream/brass/ink chrome; Listen stays the only filled green.

### 7. `prefers-reduced-motion` + `BloomChime.muted` (audit #15)

- Subscribe to `window.matchMedia('(prefers-reduced-motion: reduce)')` (and `change`).
- **`BloomChime.muted = true`** while reduced-motion is on so hover/tap chimes skip (`play()` already returns early). Optional extra mute control is nice-to-have, not required.
- **Freeze sway / grow:** `plantSway` / onset ripple in `src/garden/renderer.ts` should be ~0; grow envelope should not animate (show the bloom at its current life size without wind/gust/petal-open pulse). Lifecycle can still advance so the garden does not freeze in time — only decorative motion.
- CSS: no extra HUD motion if you add any.

### 8. Quieter Clear + optional undo (audit #18)

- Clear must **not** match Listen’s weight. Listen = only filled green. Keep can stay cream/brass. Clear = **ghost / text / quieter** chrome (lighter border, no brass fill matching Keep).
- Clearing stays **instant** (`garden.clear()` immediately).
- **Optional few-second undo:** snapshot plants (+ per-bed lists if needed) before clear; show a short “Undo” in the status or a transient control (~5–8 s). Restoring should put flowers back; listen-time sky stays (already does). If the visitor plants again before undo expires, drop the snapshot. Do not confirm-dialog.

---

## Constraints

- Do not change pitch / kind / bed / spawn mapping.
- Do not wire `SongPlayer`, Spotify, or Qobuz.
- Do not start Phase 9 (dead `.song-form` CSS, README, Vite plugin unload).
- Mobile HUD already wraps; new HUD bits must wrap or hide, never clip a timber patch.
- Integer canvas backing scale stays; CSS still fills the vine glass.
- After shipping: update `project-state.md` (last reviewed, active phase, Phase 8 row → Done, known gaps, what works).

## Verify

Run the app and check in the browser:

1. Idle: legend + compass visible; Speaker/Music idle copy; chime hint present; Music Share-audio copy still honest.
2. Listen and hum a scale: Hz + note name update; compass walks f0→f3 then b0→b3; kinds still mix in a patch.
3. Hover/tap a bloom: chime + inspect (sprite, kind, Hz, note). Grass silent / no inspect.
4. Tab to controls: `:focus-visible` rings. `L` listen/stop, `C` clear, `K` keep.
5. OS reduced-motion: no sway; chimes muted via `BloomChime.muted`.
6. Clear is visually quieter than Listen/Keep; undo restores for a few seconds; a new plant cancels undo.
7. Music path + empty courtyard caption still work. Keep PNG still downloads.

If browser tools are available, exercise the flow; do not finish on a screenshot alone.
