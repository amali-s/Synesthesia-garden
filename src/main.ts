import './style.css'
import {
  DisplayAudioError,
  PitchDetector,
  displayAudioCaptureSupported,
  noteNameFromHz,
  pitchNorm,
  type ListenMode,
} from './audio/pitch'
import { BloomChime } from './audio/chime'
import { bedFromPitch, compassBedIds, GRID_COLS, GRID_ROWS, type BedId } from './garden/beds'
import { loadBloomArt, tintedBloomCanvas } from './garden/bloomArt'
import { loadCritterArt } from './garden/critters'
import { glowAmount, smoothLoudness, type ListenLight } from './garden/glow'
import { duskWeight, stepDuskT } from './garden/palette'
import { Garden, plantLife, type FlowerPlant, type Plant } from './garden/world'
import { GardenRenderer } from './garden/renderer'
import { GardenScene } from './garden/scene3d/GardenScene'
import { bouquetFilename, renderBouquetPng } from './garden/bouquet'
import { ForageRun, planBouquet, type ForageView } from './garden/forage'
import { downloadBlob } from './garden/postcard'

type GardenView = 'courtyard' | 'among'

const COURTYARD_CAPTION = 'A courtyard at rest'
const AMONG_CAPTION = 'A garden around you'
const COURTYARD_LEGEND =
  'Low front-left → high back-right. Timbre + chroma pick kind, not register.'
const AMONG_LEGEND = 'You in the center. Low at left → high at right → around behind.'
const WEBGL_HINT = 'This browser can’t show Among them — staying in the courtyard.'
const RING_BEDS: BedId[] = ['f0', 'f1', 'f2', 'f3', 'b0', 'b1', 'b2', 'b3']

const LOGICAL_W = 320
const LOGICAL_H = 200
const UNDO_MS = 7000
const TOUCH_INSPECT_MS = 2800
const AMONG_LOOK_HINT =
  'Drag to look around — the garden wraps behind you. Hover a bloom to hear it.'
const AMONG_HOVER_HINT = 'Hover or tap a bloom to hear it.'
const COURTYARD_HOVER_HINT = 'Hover to hear the flower.'
const AMONG_HINT_KEY = 'sg-among-look-hint'
const COMPASS_BEDS: BedId[] = compassBedIds()

function compassHtml(): string {
  return `<div class="bed-compass" role="img" aria-label="Pitch beds, none highlighted">${COMPASS_BEDS.map((id) => `<span class="bed-cell" data-bed="${id}"></span>`).join('')}</div>`
}

function ringCompassHtml(): string {
  const cells = RING_BEDS.map((id, i) => {
    const deg = -180 + i * 45
    return `<span class="ring-cell" data-bed="${id}" style="--ring-a:${deg}"></span>`
  }).join('')
  return `<div class="ring-compass" role="img" aria-label="Pitch ring, you in the center">${cells}<span class="ring-compass__you">you</span></div>`
}

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="shell">
    <header class="top-bar">
      <div class="top-bar__primary">
        <h1 class="logo">Synesthesia Garden</h1>
        <div class="controls">
          <button type="button" class="btn primary" id="listen-btn" aria-pressed="false" aria-keyshortcuts="P">Play</button>
          <button type="button" class="btn ghost" id="clear-btn" aria-keyshortcuts="C" disabled>Clear garden</button>
          <button type="button" class="btn" id="forage-btn" aria-label="Forage a bouquet" aria-keyshortcuts="K">Forage</button>
          <p class="listen-hint" id="listen-hint">Click play then speak into the microphone</p>
        </div>
      </div>
      <div class="top-bar__toggles">
        <div class="mode-toggle" role="group" aria-label="Play source">
          <button type="button" class="mode-btn" id="mode-speaker" aria-pressed="true">Speaker</button>
          <button type="button" class="mode-btn" id="mode-music" aria-pressed="false">Music</button>
        </div>
        <div class="mode-toggle view-toggle" role="group" aria-label="Garden view">
          <button type="button" class="mode-btn" id="view-courtyard" aria-pressed="true">Courtyard</button>
          <button type="button" class="mode-btn" id="view-among" aria-pressed="false" aria-keyshortcuts="V">Among them</button>
        </div>
      </div>
      <div class="top-bar__meter">
        <div class="meter pitch-meter" title="Pitch">
          <span class="meter-label">Pitch</span>
          <div class="meter-track"><div class="meter-fill" id="pitch-fill"></div></div>
          <span class="meter-note" id="pitch-note" aria-label="Note">—</span>
        </div>
        <div class="status-row">
          <div class="status" id="status" aria-live="polite" aria-atomic="true">resting</div>
          <button type="button" class="btn ghost undo-btn" id="undo-btn" hidden>Undo</button>
        </div>
      </div>
    </header>

    <main class="meadow">
      <div class="window-frame">
        <div class="window-frame__glass">
          <div class="garden-stage">
            <canvas id="garden" aria-label="Pixel art garden grown from your voice or music"></canvas>
            <canvas id="garden-3d" aria-label="Garden around you" hidden></canvas>
            <p class="courtyard-caption" id="courtyard-caption">A courtyard at rest</p>
          </div>
        </div>
        <aside class="map-modal" id="map-modal" aria-label="Garden map">
          <div class="bloom-inspect" id="bloom-inspect" hidden>
            <canvas id="inspect-art" width="60" height="86" aria-hidden="true"></canvas>
            <div class="bloom-inspect__meta">
              <strong id="inspect-kind"></strong>
              <span id="inspect-pitch"></span>
            </div>
          </div>
          <div class="map-modal__key">
            ${compassHtml()}
            ${ringCompassHtml()}
            <div class="map-modal__copy">
              <p class="map-modal__mode" id="map-mode-hint">Click play then speak into the microphone</p>
              <p class="map-modal__hint">Hover to hear the flower.</p>
              <p class="map-modal__legend" id="map-legend">Low front-left → high back-right. Timbre + chroma pick kind, not register.</p>
            </div>
          </div>
        </aside>
      </div>
    </main>
    <div class="sr-only" id="inspect-live" aria-live="polite" aria-atomic="true"></div>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#garden')!
const canvas3d = document.querySelector<HTMLCanvasElement>('#garden-3d')!
const listenBtn = document.querySelector<HTMLButtonElement>('#listen-btn')!
const forageBtn = document.querySelector<HTMLButtonElement>('#forage-btn')!
const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!
const undoBtn = document.querySelector<HTMLButtonElement>('#undo-btn')!
const modeSpeakerBtn = document.querySelector<HTMLButtonElement>('#mode-speaker')!
const modeMusicBtn = document.querySelector<HTMLButtonElement>('#mode-music')!
const viewCourtyardBtn = document.querySelector<HTMLButtonElement>('#view-courtyard')!
const viewAmongBtn = document.querySelector<HTMLButtonElement>('#view-among')!
const pitchFill = document.querySelector<HTMLDivElement>('#pitch-fill')!
const pitchNote = document.querySelector<HTMLSpanElement>('#pitch-note')!
const compassCells = [...document.querySelectorAll<HTMLSpanElement>('.bed-cell, .ring-cell')]
const bedCompass = document.querySelector<HTMLElement>('.map-modal .bed-compass')!
const ringCompass = document.querySelector<HTMLElement>('.ring-compass')!
const statusEl = document.querySelector<HTMLDivElement>('#status')!
const listenHint = document.querySelector<HTMLParagraphElement>('#listen-hint')!
const mapModeHint = document.querySelector<HTMLParagraphElement>('#map-mode-hint')!
const mapHoverHint = document.querySelector<HTMLParagraphElement>('.map-modal__hint')!
const mapLegend = document.querySelector<HTMLParagraphElement>('#map-legend')!
const glass = document.querySelector<HTMLDivElement>('.window-frame__glass')!
const gardenStage = document.querySelector<HTMLDivElement>('.garden-stage')!
const courtyardCaption = document.querySelector<HTMLParagraphElement>('#courtyard-caption')!
const bloomInspect = document.querySelector<HTMLDivElement>('#bloom-inspect')!
const inspectArt = document.querySelector<HTMLCanvasElement>('#inspect-art')!
const inspectKind = document.querySelector<HTMLElement>('#inspect-kind')!
const inspectPitch = document.querySelector<HTMLSpanElement>('#inspect-pitch')!
const inspectLive = document.querySelector<HTMLDivElement>('#inspect-live')!
const mapModal = document.querySelector<HTMLElement>('#map-modal')!

const garden = new Garden({ width: LOGICAL_W, height: LOGICAL_H })
const detector = new PitchDetector()
const chime = new BloomChime(detector.audioContext)

let listenMode: ListenMode = 'speaker'
let listening = false
/** Linear 0–1. Play eases toward night, Pause toward daylight. */
let duskLinear = 0
let livePitchT: number | null = null
let smoothedHz: number | null = null
let smoothedLoudness = 0
let listenLight: ListenLight | null = null
/** Last voiced hz / pan / register, held while loudness releases to 0. */
let heldVoice: ListenLight | null = null
/** Dev hook voice. When set, it drives the listen light instead of the mic. */
let devVoice: ListenLight | null = null
let lastFrameNow = 0
/** Flower the pointer is currently over; one hover-chime until leave. */
let hoverFlower: FlowerPlant | null = null
/** Ignore synthesized mouse hover after a tap. */
let suppressMouseHoverUntil = 0
let inspectFlower: FlowerPlant | null = null
let inspectTimer = 0
let undoSnapshot: Plant[] | null = null
let undoTimer = 0
let forageRun: ForageRun | null = null
let gardenView: GardenView = 'courtyard'

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

function glassBox(): { maxW: number; maxH: number } {
  return {
    maxW: Math.max(1, glass?.clientWidth ?? window.innerWidth),
    maxH: Math.max(1, glass?.clientHeight ?? window.innerHeight),
  }
}

type GardenMood = 'resting' | 'Blooming' | 'quiet'

const renderer = new GardenRenderer(canvas, LOGICAL_W, LOGICAL_H, { scale: 1 })
const scene3d = GardenScene.tryCreate(canvas3d)
void loadBloomArt()
void loadCritterArt()

function applyReducedMotion(): void {
  const reduce = motionQuery.matches
  chime.muted = reduce
  renderer.reducedMotion = reduce
  if (scene3d) scene3d.reducedMotion = reduce
  document.documentElement.classList.toggle('reduce-motion', reduce)
}

applyReducedMotion()
motionQuery.addEventListener('change', applyReducedMotion)

function fitCanvas(): void {
  const w = glassBox().maxW
  const h = glassBox().maxH
  const saved = garden.snapshotCells()
  const moved = renderer.setView(w, h)
  if (moved) {
    const size = renderer.getLogicalSize()
    garden.applyRelayout(size.width, size.height, saved)
    syncCompassLayout()
  }
  const view = renderer.getViewSize()
  canvas.style.width = '100%'
  canvas.style.height = `${view.height}px`
  gardenStage.style.minHeight = `${view.height}px`
  fitScene3d()
}

function fitScene3d(): void {
  if (!scene3d) return
  const w = gardenStage.clientWidth || glassBox().maxW
  const h = gardenStage.clientHeight || renderer.getViewSize().height
  scene3d.resize(w, h)
}

function syncCompassLayout(): void {
  const ids = compassBedIds()
  for (const compass of document.querySelectorAll<HTMLElement>('.bed-compass')) {
    const inMap = compass.closest('.map-modal') !== null
    const cell = inMap ? 10 : 8
    compass.classList.toggle('is-portrait', GRID_ROWS > GRID_COLS)
    compass.style.gridTemplateColumns = `repeat(${GRID_COLS}, ${cell}px)`
    compass.style.gridTemplateRows = `repeat(${GRID_ROWS}, ${cell}px)`
    const cells = [...compass.querySelectorAll<HTMLSpanElement>('.bed-cell')]
    for (const id of ids) {
      const cellEl = cells.find((c) => c.dataset.bed === id)
      if (cellEl) compass.appendChild(cellEl)
    }
  }
}

function syncCourtyardCaption(): void {
  const empty = garden.plants.length === 0
  courtyardCaption.hidden = !empty
  courtyardCaption.textContent = gardenView === 'among' ? AMONG_CAPTION : COURTYARD_CAPTION
  clearBtn.disabled = empty
}

function webglAvailable(): boolean {
  return scene3d !== null
}

function syncViewButtons(): void {
  const among = gardenView === 'among'
  const gl = webglAvailable()
  viewCourtyardBtn.setAttribute('aria-pressed', among ? 'false' : 'true')
  viewAmongBtn.setAttribute('aria-pressed', among ? 'true' : 'false')
  viewAmongBtn.disabled = !gl
  viewAmongBtn.title = gl ? '' : WEBGL_HINT
}

function syncViewChrome(): void {
  const among = gardenView === 'among'
  gardenStage.classList.toggle('is-among', among)
  mapModal.classList.toggle('is-among', among)
  canvas3d.hidden = !among
  canvas3d.setAttribute('aria-hidden', among ? 'false' : 'true')
  bedCompass.hidden = among
  ringCompass.hidden = !among
  mapLegend.textContent = among ? AMONG_LEGEND : COURTYARD_LEGEND
  mapHoverHint.textContent = among ? AMONG_HOVER_HINT : COURTYARD_HOVER_HINT
}

function applyView(next: GardenView): void {
  if (next === 'among' && !webglAvailable()) {
    gardenView = 'courtyard'
    syncViewButtons()
    syncViewChrome()
    setHint(WEBGL_HINT)
    return
  }
  if (gardenView === next) return
  gardenView = next
  hoverFlower = null
  canvas.classList.remove('is-over-bloom')
  canvas3d.classList.remove('is-over-bloom')
  hideInspect()
  syncViewButtons()
  syncViewChrome()
  syncCourtyardCaption()
  if (next === 'among') showAmongFirstHint()
  fitScene3d()
  if (next === 'among' && scene3d) {
    const now = lastFrameNow || performance.now()
    scene3d.render(
      garden,
      now,
      forageRun && !forageRun.done ? forageRun.view(now) : null,
      listenLight,
      duskWeight(duskLinear),
    )
  }
}

function toggleView(): void {
  applyView(gardenView === 'among' ? 'courtyard' : 'among')
}

fitCanvas()
syncCourtyardCaption()
syncViewButtons()
syncViewChrome()
if (!webglAvailable()) {
  setHint(WEBGL_HINT)
}

function setMood(mood: GardenMood): void {
  if (statusEl.textContent === mood) return
  statusEl.textContent = mood
}

function setHint(text: string): void {
  if (listenHint.textContent !== text) listenHint.textContent = text
  if (mapModeHint.textContent !== text) mapModeHint.textContent = text
}

function hintIsProtected(): boolean {
  const t = listenHint.textContent ?? ''
  if (!t) return false
  if (t === plantHint() || t === AMONG_LOOK_HINT) return false
  return true
}

function amongHintSeen(): boolean {
  try {
    return sessionStorage.getItem(AMONG_HINT_KEY) === '1'
  } catch {
    return false
  }
}

function markAmongHintSeen(): void {
  try {
    sessionStorage.setItem(AMONG_HINT_KEY, '1')
  } catch {
    /* private mode */
  }
}

function showAmongFirstHint(): void {
  if (amongHintSeen() || hintIsProtected()) return
  setHint(AMONG_LOOK_HINT)
  markAmongHintSeen()
}

function dismissAmongHint(): void {
  markAmongHintSeen()
  if (listenHint.textContent === AMONG_LOOK_HINT) setHint(plantHint())
}

function plantHint(): string {
  if (listenMode === 'music') {
    if (!displayAudioCaptureSupported()) {
      return 'This browser can’t capture tab or system audio. Use Speaker, or try Chrome or Edge.'
    }
    return 'Click play then share a tab playing music'
  }
  return 'Click play then speak into the microphone'
}

function syncModeButtons(): void {
  const speaker = listenMode === 'speaker'
  modeSpeakerBtn.setAttribute('aria-pressed', speaker ? 'true' : 'false')
  modeMusicBtn.setAttribute('aria-pressed', speaker ? 'false' : 'true')
}

function setListeningUi(on: boolean, pending = false): void {
  listenBtn.disabled = pending
  listenBtn.textContent = on ? 'Pause' : 'Play'
  listenBtn.setAttribute('aria-pressed', on ? 'true' : 'false')
  listenBtn.classList.toggle('active', on)
  syncForageEnabled()
}

function syncForageEnabled(): void {
  forageBtn.disabled = listening || listenBtn.disabled || forageRun !== null
}

function highlightCompass(id: BedId | null): void {
  for (const cell of compassCells) {
    cell.classList.toggle('is-on', id !== null && cell.dataset.bed === id)
  }
  const bedLabel = id ? `Pitch bed ${id}` : 'Pitch beds, none highlighted'
  const ringLabel = id ? `Pitch ring, ${id}` : 'Pitch ring, you in the center'
  for (const compass of document.querySelectorAll('.bed-compass')) {
    compass.setAttribute('aria-label', bedLabel)
  }
  ringCompass.setAttribute('aria-label', ringLabel)
}

function updateHud(hz: number | null, planted: boolean): void {
  if (hz !== null && planted) {
    const t = pitchNorm(hz, listenMode)
    pitchFill.style.setProperty('--pitch', `${Math.round(t * 100)}%`)
    pitchFill.style.background = `hsl(${(350 + t * 42) % 360} ${28 + t * 44}% ${62}%)`
    pitchNote.textContent = noteNameFromHz(hz)
    highlightCompass(bedFromPitch(t).id)
  } else {
    pitchFill.style.setProperty('--pitch', '0%')
    pitchNote.textContent = '—'
    highlightCompass(null)
  }
}

function resetLivePitch(): void {
  livePitchT = null
  smoothedHz = null
  smoothedLoudness = 0
  listenLight = null
  heldVoice = null
  updateHud(null, false)
}

function stepListenLight(voiced: ListenLight | null, dt: number, hud: boolean): void {
  if (voiced) {
    smoothedLoudness = smoothLoudness(smoothedLoudness, voiced.loudnessT, dt)
    heldVoice = voiced
    listenLight = {
      hz: voiced.hz,
      loudnessT: smoothedLoudness,
      panT: voiced.panT,
      pitchT: voiced.pitchT,
    }
    if (hud) {
      smoothedHz = smoothedHz === null ? voiced.hz : smoothedHz * 0.7 + voiced.hz * 0.3
      livePitchT = pitchNorm(smoothedHz, listenMode)
      updateHud(smoothedHz, true)
      setMood('Blooming')
    } else {
      livePitchT = voiced.pitchT
    }
    return
  }

  smoothedLoudness = smoothLoudness(smoothedLoudness, 0, dt)
  if (smoothedLoudness <= 0.008 || !heldVoice) {
    smoothedLoudness = 0
    listenLight = null
    heldVoice = null
  } else {
    listenLight = {
      hz: heldVoice.hz,
      loudnessT: smoothedLoudness,
      panT: heldVoice.panT,
      pitchT: heldVoice.pitchT,
    }
  }
  livePitchT = null
  if (hud) {
    updateHud(null, false)
    setMood('quiet')
  }
}

function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

function hideInspect(): void {
  if (inspectTimer) {
    window.clearTimeout(inspectTimer)
    inspectTimer = 0
  }
  inspectFlower = null
  bloomInspect.hidden = true
  mapModal.classList.remove('is-inspecting')
}

function showInspect(plant: FlowerPlant, now: number): void {
  const life = plantLife(plant, now)
  const sheet = tintedBloomCanvas(
    plant.kind,
    plant.hz,
    plant.pitchT,
    plant.timbreT,
    life.wiltT,
  )
  const ctx = inspectArt.getContext('2d')
  if (ctx && sheet) {
    const zoom = 1
    inspectArt.width = sheet.width * zoom
    inspectArt.height = sheet.height * zoom
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, inspectArt.width, inspectArt.height)
    ctx.drawImage(sheet, 0, 0, inspectArt.width, inspectArt.height)
  }
  const kind = kindLabel(plant.kind)
  const note = noteNameFromHz(plant.hz)
  const hzText = `${Math.round(plant.hz)} Hz`
  inspectKind.textContent = kind
  inspectPitch.textContent = `${hzText} · ${note}`
  bloomInspect.hidden = false
  mapModal.classList.add('is-inspecting')
  const live = `${kind}, ${hzText}, ${note}`
  if (inspectLive.textContent !== live) inspectLive.textContent = live
  inspectFlower = plant
}

function inspectFromPointer(plant: FlowerPlant | null, pointerType: string): void {
  const now = lastFrameNow || performance.now()
  if (!plant) {
    if (pointerType !== 'touch') hideInspect()
    return
  }
  showInspect(plant, now)
  if (pointerType === 'touch') {
    if (inspectTimer) window.clearTimeout(inspectTimer)
    inspectTimer = window.setTimeout(hideInspect, TOUCH_INSPECT_MS)
  }
}

function dropUndo(): void {
  undoSnapshot = null
  if (undoTimer) {
    window.clearTimeout(undoTimer)
    undoTimer = 0
  }
  undoBtn.hidden = true
}

function scheduleUndoExpiry(): void {
  if (undoTimer) window.clearTimeout(undoTimer)
  undoTimer = window.setTimeout(() => {
    dropUndo()
  }, UNDO_MS)
}

function hasLivingFlower(): boolean {
  return garden.plants.some((p) => p.type === 'flower')
}

function clearGarden(): void {
  cancelForage()
  const captured = garden.plants.length > 0
  if (captured) undoSnapshot = garden.snapshotPlants()
  garden.clear()
  hoverFlower = null
  hideInspect()
  canvas.classList.remove('is-over-bloom')
  canvas3d.classList.remove('is-over-bloom')
  syncCourtyardCaption()
  if (captured && undoSnapshot && undoSnapshot.length > 0) {
    undoBtn.hidden = false
    scheduleUndoExpiry()
    if (!listening) setHint('Garden cleared — Undo for a few seconds')
    return
  }
  if (!undoSnapshot && !listening) {
    setHint(
      gardenView === 'among'
        ? 'Garden cleared — a garden around you'
        : 'Garden cleared — a courtyard at rest',
    )
  }
}

function undoClear(): void {
  if (!undoSnapshot) return
  garden.restorePlants(undoSnapshot)
  dropUndo()
  syncCourtyardCaption()
  if (!listening) setHint(plantHint())
}

function stopListen(hint?: string): void {
  if (!listening && detector.isRunning) detector.stop()
  if (!listening) {
    if (hint) setHint(hint)
    setMood('resting')
    return
  }
  detector.stop()
  listening = false
  resetLivePitch()
  setListeningUi(false)
  setMood('resting')
  setHint(hint ?? plantHint())
}

function toggleListen(): void {
  if (listenBtn.disabled) return
  if (listening) {
    stopListen()
    return
  }
  void startListen()
}

async function startListen(): Promise<void> {
  if (listening) return
  try {
    setListeningUi(false, true)
    setHint(
      listenMode === 'music'
        ? 'Share a tab or window — tick “Share audio”'
        : 'Allowing microphone…',
    )
    await detector.start({ mode: listenMode })
    listening = true
    setListeningUi(true)
    setMood('quiet')
    setHint(plantHint())
  } catch (err) {
    listening = false
    detector.stop()
    setListeningUi(false)
    setMood('resting')
    if (err instanceof DisplayAudioError) {
      setHint(err.message)
      return
    }
    setHint('Microphone blocked — allow access to grow the garden')
  }
}

function applyMode(next: ListenMode): void {
  if (listenMode === next) return
  const wasListening = listening
  if (wasListening) stopListen()
  listenMode = next
  syncModeButtons()
  if (wasListening) {
    void startListen()
    return
  }
  setMood('resting')
  setHint(plantHint())
}

async function mailBouquet(flowers: readonly FlowerPlant[]): Promise<void> {
  try {
    const blob = await renderBouquetPng(flowers)
    downloadBlob(blob, bouquetFilename())
    setHint('A bouquet is in the mail')
  } catch {
    setHint('Could not save the bouquet — try again')
  }
}

function cancelForage(): void {
  if (!forageRun) return
  forageRun = null
  syncForageEnabled()
}

function startForage(): void {
  if (listening || forageRun) return
  const now = lastFrameNow || performance.now()
  const picks = planBouquet(garden, now)
  forageRun = new ForageRun(garden, picks, now)
  syncForageEnabled()
  setHint(
    picks.length > 0
      ? 'The fox is foraging the fullest beds…'
      : 'The fox is sniffing the courtyard…',
  )
}

function tickForage(now: number): ForageView | null {
  if (!forageRun) return null
  const ev = forageRun.tick(now)
  if (ev?.type === 'mail') {
    void mailBouquet(forageRun.bouquet)
  }
  if (ev?.type === 'done') {
    if (!ev.mailed && !listening) {
      setHint('Nothing to forage — the fox left empty-handed')
    }
    forageRun = null
    syncForageEnabled()
    return null
  }
  return forageRun.view(now)
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  )
}

detector.onCaptureEnded = () => {
  listening = false
  resetLivePitch()
  setListeningUi(false)
  setMood('resting')
  setHint('Share ended — tap Play to follow the mix again')
}

listenBtn.addEventListener('click', () => {
  toggleListen()
})

forageBtn.addEventListener('click', () => {
  startForage()
})

clearBtn.addEventListener('click', () => {
  clearGarden()
})

undoBtn.addEventListener('click', () => {
  undoClear()
})

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (isTypingTarget(e.target)) return
  if (e.repeat) return
  const key = e.key.toLowerCase()
  if (key === 'p') {
    toggleListen()
    return
  }
  if (key === 'c') {
    if (!clearBtn.disabled) clearGarden()
    return
  }
  if (key === 'k') {
    startForage()
    return
  }
  if (key === 'v') {
    toggleView()
  }
})

function pointerToLogical(e: PointerEvent): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const scale = renderer.getScale()
  const origin = renderer.getOrigin()
  const backingX = ((e.clientX - rect.left) * canvas.width) / rect.width
  const backingY = ((e.clientY - rect.top) * canvas.height) / rect.height
  return { x: (backingX - origin.x) / scale, y: (backingY - origin.y) / scale }
}

function flowerUnder(e: PointerEvent): FlowerPlant | null {
  const pt = pointerToLogical(e)
  if (!pt) return null
  return garden.hitFlowerAt(pt.x, pt.y, lastFrameNow || performance.now())
}

function amongFlowerUnder(e: PointerEvent): FlowerPlant | null {
  if (!scene3d) return null
  return scene3d.hitFlower(e.clientX, e.clientY)
}

function hoverPointer(e: PointerEvent): boolean {
  if (e.pointerType === 'touch') return false
  if (e.pointerType === 'mouse' && performance.now() < suppressMouseHoverUntil) {
    return false
  }
  return e.pointerType === 'mouse' || e.pointerType === 'pen'
}

function setBloomCursor(on: boolean): void {
  canvas.classList.toggle('is-over-bloom', gardenView === 'courtyard' && on)
  canvas3d.classList.toggle('is-over-bloom', gardenView === 'among' && on)
}

function chimeFlower(plant: FlowerPlant): void {
  chime.play(plant.hz, plant.timbreT, plant.loudnessT)
}

function clearAmongHover(hideCard: boolean): void {
  hoverFlower = null
  setBloomCursor(false)
  if (hideCard && !inspectTimer) hideInspect()
}

canvas.addEventListener('pointerdown', (e) => {
  if (gardenView !== 'courtyard') return
  void chime.unlock()
  if (e.pointerType === 'touch') suppressMouseHoverUntil = performance.now() + 800
  const flower = flowerUnder(e)
  setBloomCursor(flower !== null)
  inspectFromPointer(flower, e.pointerType)
  if (!flower) {
    hoverFlower = null
    return
  }
  hoverFlower = flower
  chimeFlower(flower)
})

canvas.addEventListener('pointermove', (e) => {
  if (gardenView !== 'courtyard') return
  void chime.unlock()
  const flower = flowerUnder(e)
  setBloomCursor(flower !== null)
  if (!hoverPointer(e)) {
    if (!flower) hoverFlower = null
    return
  }
  inspectFromPointer(flower, e.pointerType)
  if (flower === hoverFlower) return
  hoverFlower = flower
  if (flower) chimeFlower(flower)
})

canvas.addEventListener('pointerleave', (e) => {
  if (gardenView !== 'courtyard') return
  hoverFlower = null
  setBloomCursor(false)
  if (e.pointerType !== 'touch') hideInspect()
})

canvas.addEventListener('pointercancel', () => {
  if (gardenView !== 'courtyard') return
  hoverFlower = null
  setBloomCursor(false)
  hideInspect()
})

canvas3d.addEventListener('pointerdown', (e) => {
  if (gardenView !== 'among') return
  void chime.unlock()
  if (e.pointerType === 'touch') suppressMouseHoverUntil = performance.now() + 800
})

canvas3d.addEventListener('pointermove', (e) => {
  if (gardenView !== 'among') return
  void chime.unlock()
  if (scene3d?.isDragging) {
    setBloomCursor(false)
    return
  }
  const flower = amongFlowerUnder(e)
  setBloomCursor(flower !== null)
  if (!hoverPointer(e)) {
    if (!flower) hoverFlower = null
    return
  }
  inspectFromPointer(flower, e.pointerType)
  if (flower === hoverFlower) return
  hoverFlower = flower
  if (flower) {
    chimeFlower(flower)
    dismissAmongHint()
  }
})

canvas3d.addEventListener('pointerup', (e) => {
  if (gardenView !== 'among') return
  if (scene3d?.didLookDrag) {
    dismissAmongHint()
    return
  }
  const flower = amongFlowerUnder(e)
  setBloomCursor(flower !== null)
  inspectFromPointer(flower, e.pointerType)
  if (!flower) {
    hoverFlower = null
    return
  }
  hoverFlower = flower
  chimeFlower(flower)
  dismissAmongHint()
})

canvas3d.addEventListener('pointerleave', (e) => {
  if (gardenView !== 'among') return
  clearAmongHover(e.pointerType !== 'touch')
})

canvas3d.addEventListener('pointercancel', () => {
  if (gardenView !== 'among') return
  clearAmongHover(true)
})

modeSpeakerBtn.addEventListener('click', () => {
  applyMode('speaker')
})

modeMusicBtn.addEventListener('click', () => {
  applyMode('music')
})

viewCourtyardBtn.addEventListener('click', () => {
  applyView('courtyard')
})

viewAmongBtn.addEventListener('click', () => {
  applyView('among')
})

window.addEventListener('resize', fitCanvas)
if (typeof ResizeObserver !== 'undefined' && glass) {
  new ResizeObserver(fitCanvas).observe(glass)
}

function frame(now: number): void {
  const dt = lastFrameNow > 0 ? Math.min(80, Math.max(0, now - lastFrameNow)) : 16
  lastFrameNow = now
  garden.tick(now, listening)
  duskLinear = stepDuskT(duskLinear, listening, dt)
  const duskT = duskWeight(duskLinear)

  let micVoice: ListenLight | null = null
  if (listening) {
    const sample = detector.sample()
    garden.ingest(sample, now)
    if (sample.isVoice && sample.hz !== null) {
      micVoice = {
        hz: sample.hz,
        loudnessT: sample.loudnessT,
        panT: sample.panT,
        pitchT: sample.pitchT,
      }
    }
  }

  const voiced = devVoice ?? (listening ? micVoice : null)
  if (listening || devVoice || smoothedLoudness > 0) {
    stepListenLight(voiced, dt, listening && !devVoice)
  }

  if (undoSnapshot && hasLivingFlower()) dropUndo()

  if (inspectFlower && !bloomInspect.hidden && !garden.plants.includes(inspectFlower)) {
    hideInspect()
  }

  syncCourtyardCaption()
  const forageView = tickForage(now)
  if (gardenView === 'among' && scene3d) {
    scene3d.render(garden, now, forageView, listenLight, duskT)
  } else {
    renderer.draw(garden, now, livePitchT, forageView, listenLight, duskT)
  }
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

if (import.meta.env.DEV) {
  Object.assign(window, {
    __sg: {
      garden,
      chime,
      renderer,
      scene3d,
      get listenLight() {
        return listenLight
      },
      hear(voice: { hz: number; loudnessT: number; panT?: number; pitchT?: number } | null) {
        devVoice = voice
          ? {
              hz: voice.hz,
              loudnessT: Math.min(1, Math.max(0, voice.loudnessT)),
              panT: voice.panT ?? 0.5,
              pitchT: voice.pitchT ?? pitchNorm(voice.hz, listenMode),
            }
          : null
      },
      glowOf(plant: FlowerPlant) {
        return glowAmount(plant.hz, listenLight, plant.wiltStarted !== null)
      },
    },
  })
}
