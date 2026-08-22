# Roadmap

Sequenced plan for Synesthesia Garden. Status lives in [`project-state.md`](./project-state.md) — update that file when a phase starts or finishes.

Order is deliberate: richer mapping first (the core idea), then two listen modes (voice vs music already playing on the device), then garden feel, then music-mix layout (how a song occupies the bed), then replay a bloom as a chime, then keep/share, then performance and polish.

---

## North star

A pixel meadow that *feels* like synesthesia: several qualities of sound (pitch, loudness, timbre, rhythm) become several qualities of plants (kind, color, size, motion). People can grow from their voice (**Speaker**) or from music already playing on the device / in another tab (**Music**), and they can keep what grew.

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

## Phase 2 — Music mode vs Speaker mode

**Why next:** The garden already grows from one live audio stream. The missing product is a toggle: listen to the *person* or listen to *music the device is already playing* — without uploading a file or streaming a track through the site.

**Modes**

| Mode | Source | Focus |
| --- | --- | --- |
| **Speaker** (default) | Microphone (`getUserMedia`) | User pitch — echo cancel + noise suppress on, vocal range |
| **Music** | Device / tab / window audio | The mix already playing (Spotify, YouTube, another window) — not the visitor’s voice |

**Visitor loop:** play a song on the laptop → open Synesthesia Garden → switch to **Music** → **Listen**. The garden follows that playback. Toggle back to **Speaker** and Listen again; the garden follows the user’s voice.

| Work | Intent |
| --- | --- |
| Mode toggle in the top bar | **Speaker** / **Music**, persisted for the session; Listen uses whichever is selected |
| Capture tab or system audio | `getDisplayMedia` with audio (share a tab/window and tick “Share audio”), or an equivalent loopback input — not the mic picking speakers through the room |
| One source at a time | Switching modes stops the other stream; Music must not also treat the visitor as a singer |
| Processing per mode | Speaker: keep AGC off, echo cancel + noise suppress. Music: those off (they flatten a mix); wider pitch window than 80–1000 Hz so instruments are not all “silence” |
| Honest browser limits | Chrome/Edge tab-audio share is the reliable path. If the browser cannot capture audio (Safari, some Firefox/OS combos), say so and leave Speaker working |
| Pitch on a mix | Same detector, but Music follows the *dominant* pitch in the capture — not a promise to separate vocals from the band |

**Done when:** With a song playing in another tab or app, Music + Listen grows a garden in time with that audio (no file picker). Switching to Speaker + Listen grows from voice instead. Mic and music capture are never mixed.

**Out of scope:** Uploading an MP3, in-page play/pause of a local file, Spotify previews, and Qobuz streams (see Later). `SongPlayer` stays unhooked.

**Touches:** `src/audio/pitch.ts` (new capture path + mode-specific constraints), `src/main.ts`, `src/style.css`

---

## Phase 3 — Organic garden + lifecycle

**Why:** Plants fill a left-to-right grid, then wrap. After a minute it reads as a spreadsheet, not a bed.

| Work | Intent |
| --- | --- |
| Full-page meadow | Larger logical bed (~320×200); canvas fills leftover viewport; Listen, Stop, Clear garden + pitch meter on a top bar |
| Organic placement | Cluster same-pitch blooms; more jitter; grass fills gaps instead of taking the next slot |
| Lifecycle | Seed → bloom → rest; wilt or fade oldest plants instead of hard-delete at 480 |
| Time-of-day sky | Sky / mist shift with how long the session has been listening |

**Done when:** The garden is the largest thing on the page. A few minutes of voice or a song looks like a meadow, not rows. Clearing is still instant.

**Touches:** `src/garden/world.ts`, `src/garden/renderer.ts`, maybe `src/garden/palette.ts`, `src/main.ts`, `src/style.css`

---

## Phase 4 — Music mix → garden layout

**Why:** Music mode already plants from dominant pitch, loudness, timbre, and a garden-wide onset pulse. A mix still reads like voice with extra Hz: everything becomes a flower, spawn rate is fixed, and placement ignores stereo, note length, and how loud a section is. These five mappings are the smallest set that makes a *song* occupy the bed differently from humming.

**Primary in Music.** Speaker can reuse duration, tempo, and section energy where the mic signal is clean. Pan needs stereo (tab/system capture); skip or center it on a mono mic. No instrument classifier — register, envelope, and stereo stand in.

| Work | Intent |
| --- | --- |
| Duration → side | Held notes / long phrases plant on one side of the bed; short notes / staccato on the other. Track how long the current pitched event has been continuous (reset on silence or a large pitch jump). Map duration to `x` bias, still with existing same-pitch clustering and jitter. |
| Pan → side | Estimate left/right from the stereo capture (e.g. mid/side or L vs R RMS). Left-panned sound grows left; right-panned grows right; center (typical vocals/kick) down the middle. Combine with duration as two biases, not two competing grids. |
| Tempo → spawn rate | Infer BPM from inter-onset intervals (the flux/RMS onset already exists). Faster tempo shortens `SPAWN_COOLDOWN_MS`; ballads grow slower and can keep taller/sparser stems. Clamp so a noisy mix cannot flood the cap in seconds. |
| Percussion → motion only | Treat drum-like hits (broadband, short, little stable pitch) as onsets for sway / petal-open / grass rustle — **do not** spawn a flower. Pitched, harmonic frames still plant. Quiet remains grass. |
| Section energy → front/back density | Smooth RMS (or a short loudness window) as “how open the mix is.” Quiet/verse prefers the front of the soil (nearer the viewer); loud/chorus prefers the back / denser mid-bed. The garden opens when the song does. |

**Done when:** In Music + Listen, a stereo track with a clear beat looks unlike Speaker humming: long notes and panned parts pull left/right, the bed fills faster on a fast song than a ballad, drums animate without a daisy per snare, and a chorus sits deeper/denser than a verse. Speaker still grows from voice; drums-as-motion must not swallow sung pitch.

**Out of scope:** Instrument → specific flower (violin vs piano), key/mode palette, verse/chorus labels, source separation. The teach/legend phase should mention these axes if this phase ships first.

**Touches:** `src/audio/pitch.ts` (duration, pan, tempo, percussive vs pitched), `src/garden/world.ts` (x/y bias, spawn cooldown, skip plant on drums), `src/garden/renderer.ts` / `src/garden/sprites.ts` if percussion needs a stronger motion channel than the existing ~200 ms onset pulse, HUD in `src/main.ts` only if a tiny “music layout” hint is needed

---

## Phase 5 — Replay bloom as chime

**Why:** Sound becomes a plant, then the plant goes silent. Hovering or pressing a flower should close that loop: the same pitch (and a hint of the same timbre) that grew it plays back as a short chime. That is how a visitor confirms “this orchid is that high note.” Flowers already store `hz`, `pitchT`, and `timbreT`.

**Primary on flowers.** Grass is quiet. Wilted blooms can still chime while they are on screen, then stop when gone.

| Work | Intent |
| --- | --- |
| Hit-test the meadow | Map pointer / tap to the flower under the cursor (logical 320×200 space, integer canvas scale, front-most plant if they overlap). Ignore empty soil and grass. |
| Hover and press | Desktop: chime on hover (and again on click if they press). Touch: chime on tap — there is no hover. Do not retrigger every pointer-move pixel; one chime per flower until the pointer leaves it. |
| Chime at stored pitch | Short bell / sine-like tone at the flower’s `hz` (the pitch that planted it), not a random UI beep and not a replay of the original mic/mix recording. Optional: `timbreT` brightens the partials (duller vs glassier), `loudnessT` a little volume — pitch is the identity. |
| Mix with Listen | Chimes play through Web Audio even while Listen is on. Keep them short and quieter than a belted voice so they do not drown the garden or fight Music capture. Stopping Listen does not mute chimes. |
| Honest limits | Approximate the *note*, not a sample of the visitor’s voice or the Spotify/YouTube mix. No chord per cluster unless a later pass wants it. |

**Done when:** Pointing at or tapping a daisy that grew from a low hum plays a low chime; an orchid from a high note plays high. Grass does nothing. It works on a phone tap and a laptop hover, with or without Listen running.

**Touches:** `src/garden/world.ts` (hit-test), `src/garden/renderer.ts` or `src/main.ts` (pointer → logical pixel), new small chime helper under `src/audio/`, `src/style.css` if a pointer cursor on blooms is needed

---

## Phase 6 — Keep what grew

**Why:** There is no save, share, or export. The framed canvas is already a postcard.

| Work | Intent |
| --- | --- |
| Download PNG | Export the garden (optionally including the window frame) |
| Optional share URL / seed | Reopen a garden later |
| Optional short clip | GIF or WebM of sway — only if PNG feels incomplete |

**Done when:** One click yields an image someone can send. Clear garden still exists beside it.

**Touches:** `src/garden/renderer.ts`, `src/main.ts`, `src/style.css`

---

## Phase 7 — Canvas + pitch performance

**Why:** Every frame redraws soil pixel-by-pixel, sorts every plant, and runs naive autocorrelation on 2048 samples. It will hitch as the bed fills — more so after Phases 1–4 add work per plant and extra mix analysis.

| Work | Intent |
| --- | --- |
| Cache background | Sky, soil, horizon on an offscreen canvas; redraw plants + clouds only |
| Cheaper plant order | Y-bucket or insertion order instead of copy-sort each frame |
| Better pitch detector | YIN or McLeod (MPM); downsample before autocorrelation if staying in-house |

**Done when:** A full bed (hundreds of plants) stays smooth on a laptop and a mid-range phone, while listening.

**Touches:** `src/garden/renderer.ts`, `src/audio/pitch.ts`

---

## Phase 8 — Teach the mapping + accessibility

**Why:** The HUD shows Hz but not *why* a tulip appeared. The mapping should be readable without a README.

| Work | Intent |
| --- | --- |
| Legend | Tiny key: low → daisy / gold, high → orchid / mauve (update copy if Phase 1 or 4 changes the map); mention hover/press to hear a bloom’s pitch if the chime phase shipped |
| Note name | Show `A4` / `C5` next to Hz |
| Keyboard | `L` listen/pause, `C` clear (and export if Keep exists) |
| A11y | `aria-pressed` on Listen, `prefers-reduced-motion` for sway/grow; chimes should not fire in a tight loop and should be skippable (mute or reduced-motion) |

**Done when:** A new visitor can predict the next bloom from the HUD, and the app is usable from the keyboard with reduced motion respected.

**Touches:** `src/main.ts`, `src/style.css`, `index.html`

---

## Phase 9 — Engineering hygiene

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

Do not start these until Phases 1–2 are real. Streaming and file upload are optional flavor, not the product — Music mode already grows from whatever the visitor is playing.

| Idea | Notes |
| --- | --- |
| Local file playback | Re-wire `SongPlayer` + file picker if tab/system capture is too awkward on a given browser. |
| Spotify 30s previews | Backend already exists (`api/spotify-preview.ts`). Weak garden (half a minute) and extra secrets. |
| Qobuz full-track stream | Backend exists; ToS / rights risk for a public web app. |
| Instrument → specific flower | After Phase 4 layout; needs more than dominant pitch (envelope + spectrum, or a classifier). |
| MIDI keyboard input | Natural cousin of log-pitch mapping. |
| Day/night, weather, fauna | After lifecycle (Phase 3) so they have a world to live in. |
| PWA / offline | After fonts are local and streaming is decided. |

---

## Suggested build order in one line

**Mapping → Speaker/Music listen modes → organic bed → music-mix layout → bloom chime → PNG export → perf → legend/a11y → hygiene.**
