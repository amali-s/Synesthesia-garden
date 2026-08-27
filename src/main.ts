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
import { bedFromPitch, type BedId } from './garden/beds'
import { loadBloomArt, tintedBloomCanvas } from './garden/bloomArt'
import { loadCritterArt } from './garden/critters'
import { Garden, plantLife, type FlowerPlant, type Plant } from './garden/world'
import { GardenRenderer } from './garden/renderer'
import { bouquetFilename, renderBouquetPng } from './garden/bouquet'
import { ForageRun, planBouquet, type ForageView } from './garden/forage'
import { downloadBlob } from './garden/postcard'

const LOGICAL_W = 320
const LOGICAL_H = 200
const UNDO_MS = 7000
const TOUCH_INSPECT_MS = 2800
const COMPASS_BEDS: BedId[] = ['b0', 'b1', 'b2', 'b3', 'f0', 'f1', 'f2', 'f3']

function compassHtml(): string {
  return `<div class="bed-compass" role="img" aria-label="Pitch beds, none highlighted">${COMPASS_BEDS.map((id) => `<span class="bed-cell" data-bed="${id}"></span>`).join('')}</div>`
}

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="shell">
    <header class="top-bar">
      <div class="top-bar__primary">
        <h1 class="logo">Synesthesia Garden</h1>
        <div class="controls">
          <button type="button" class="btn primary" id="listen-btn" aria-pressed="false" aria-keyshortcuts="L">Listen</button>
          <button type="button" class="btn ghost" id="clear-btn" aria-keyshortcuts="C">Clear garden</button>
          <div class="mode-toggle" role="group" aria-label="Listen source">
            <button type="button" class="mode-btn" id="mode-speaker" aria-pressed="true">Speaker</button>
            <button type="button" class="mode-btn" id="mode-music" aria-pressed="false">Music</button>
          </div>
          <button type="button" class="btn" id="forage-btn" aria-label="Forage a bouquet" aria-keyshortcuts="K">Forage</button>
        </div>
      </div>
      <div class="top-bar__meter">
        <div class="meter pitch-meter" title="Pitch">
          <span class="meter-label">Pitch</span>
          <div class="meter-track"><div class="meter-fill" id="pitch-fill"></div></div>
          <span class="meter-value" id="pitch-hz">— Hz</span>
          <span class="meter-note" id="pitch-note" aria-label="Note">—</span>
        </div>
        <div class="status-row">
          <div class="status" id="status">Tap Listen to plant with your voice · hover a bloom to hear it</div>
          <button type="button" class="btn ghost undo-btn" id="undo-btn" hidden>Undo</button>
        </div>
      </div>
    </header>

    <main class="meadow">
      <div class="window-frame">
        <div class="window-frame__glass">
          <canvas id="garden" aria-label="Pixel art garden grown from your voice or music"></canvas>
          <p class="courtyard-caption" id="courtyard-caption">A courtyard at rest</p>
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
              <p class="map-modal__legend">Low front-left → high back-right. Timbre + chroma pick kind, not register.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
    <div class="sr-only" id="inspect-live" aria-live="polite" aria-atomic="true"></div>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#garden')!
const listenBtn = document.querySelector<HTMLButtonElement>('#listen-btn')!
const forageBtn = document.querySelector<HTMLButtonElement>('#forage-btn')!
const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!
const undoBtn = document.querySelector<HTMLButtonElement>('#undo-btn')!
const modeSpeakerBtn = document.querySelector<HTMLButtonElement>('#mode-speaker')!
const modeMusicBtn = document.querySelector<HTMLButtonElement>('#mode-music')!
const pitchFill = document.querySelector<HTMLDivElement>('#pitch-fill')!
const pitchHz = document.querySelector<HTMLSpanElement>('#pitch-hz')!
const pitchNote = document.querySelector<HTMLSpanElement>('#pitch-note')!
const compassCells = [...document.querySelectorAll<HTMLSpanElement>('.bed-cell')]
const statusEl = document.querySelector<HTMLDivElement>('#status')!
const glass = document.querySelector<HTMLDivElement>('.window-frame__glass')!
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
let livePitchT: number | null = null
let smoothedHz: number | null = null
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

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

function glassBox(): { maxW: number; maxH: number } {
  return {
    maxW: Math.max(1, glass?.clientWidth ?? window.innerWidth),
    maxH: Math.max(1, glass?.clientHeight ?? window.innerHeight),
  }
}

/** Integer backing scale from the glass; CSS still fills the vine (no side gutters). */
function computeBackingScale(): number {
  const { maxW, maxH } = glassBox()
  return Math.max(1, Math.round(Math.min(maxW / LOGICAL_W, maxH / LOGICAL_H)))
}

const renderer = new GardenRenderer(canvas, LOGICAL_W, LOGICAL_H, {
  scale: computeBackingScale(),
})
void loadBloomArt()
void loadCritterArt()

function applyReducedMotion(): void {
  const reduce = motionQuery.matches
  chime.muted = reduce
  renderer.reducedMotion = reduce
  document.documentElement.classList.toggle('reduce-motion', reduce)
}

applyReducedMotion()
motionQuery.addEventListener('change', applyReducedMotion)

function fitCanvas(): void {
  renderer.setScale(computeBackingScale())
  canvas.style.left = '0'
  canvas.style.top = '0'
  canvas.style.right = '0'
  canvas.style.bottom = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
}

function syncCourtyardCaption(): void {
  courtyardCaption.hidden = garden.plants.length > 0
}

fitCanvas()
syncCourtyardCaption()

function setStatus(text: string): void {
  statusEl.textContent = text
}

function idleStatus(): string {
  if (listenMode === 'music') {
    if (!displayAudioCaptureSupported()) {
      return 'This browser can’t capture tab or system audio. Use Speaker, or try Chrome or Edge.'
    }
    return 'Play a song, then Listen and share that tab or window with audio · hover a bloom to hear it'
  }
  return 'Tap Listen to plant with your voice · hover a bloom to hear it'
}

function listeningStatus(): string {
  return listenMode === 'music'
    ? 'Following the mix · drums sway, notes plant'
    : 'Listening — speak or hum'
}

function syncModeButtons(): void {
  const speaker = listenMode === 'speaker'
  modeSpeakerBtn.setAttribute('aria-pressed', speaker ? 'true' : 'false')
  modeMusicBtn.setAttribute('aria-pressed', speaker ? 'false' : 'true')
}

function setListeningUi(on: boolean, pending = false): void {
  listenBtn.disabled = pending
  listenBtn.textContent = on ? 'Stop' : 'Listen'
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
  const label = id ? `Pitch bed ${id}` : 'Pitch beds, none highlighted'
  for (const compass of document.querySelectorAll('.bed-compass')) {
    compass.setAttribute('aria-label', label)
  }
}

function updateHud(hz: number | null, planted: boolean): void {
  if (hz !== null && planted) {
    const t = pitchNorm(hz, listenMode)
    pitchFill.style.width = `${Math.round(t * 100)}%`
    pitchFill.style.background = `hsl(${(350 + t * 42) % 360} ${28 + t * 44}% ${62}%)`
    pitchHz.textContent = `${Math.round(hz)} Hz`
    pitchNote.textContent = noteNameFromHz(hz)
    highlightCompass(bedFromPitch(t).id)
  } else {
    pitchFill.style.width = '0%'
    pitchHz.textContent = '— Hz'
    pitchNote.textContent = '—'
    highlightCompass(null)
  }
}

function resetLivePitch(): void {
  livePitchT = null
  smoothedHz = null
  updateHud(null, false)
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
  syncCourtyardCaption()
  if (captured && undoSnapshot && undoSnapshot.length > 0) {
    undoBtn.hidden = false
    scheduleUndoExpiry()
    if (!listening) setStatus('Garden cleared — Undo for a few seconds')
    return
  }
  if (!undoSnapshot && !listening) {
    setStatus('Garden cleared — a courtyard at rest')
  }
}

function undoClear(): void {
  if (!undoSnapshot) return
  garden.restorePlants(undoSnapshot)
  dropUndo()
  syncCourtyardCaption()
  if (!listening) setStatus('Garden restored')
}

function stopListen(status?: string): void {
  if (!listening && detector.isRunning) detector.stop()
  if (!listening) {
    if (status) setStatus(status)
    return
  }
  detector.stop()
  listening = false
  resetLivePitch()
  setListeningUi(false)
  setStatus(status ?? 'Stopped — garden is resting')
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
    setStatus(
      listenMode === 'music'
        ? 'Share a tab or window — tick “Share audio”'
        : 'Allowing microphone…',
    )
    await detector.start({ mode: listenMode })
    listening = true
    setListeningUi(true)
    setStatus(listeningStatus())
  } catch (err) {
    listening = false
    detector.stop()
    setListeningUi(false)
    if (err instanceof DisplayAudioError) {
      setStatus(err.message)
      return
    }
    setStatus('Microphone blocked — allow access to grow the garden')
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
  setStatus(idleStatus())
}

async function mailBouquet(flowers: readonly FlowerPlant[]): Promise<void> {
  try {
    const blob = await renderBouquetPng(flowers)
    downloadBlob(blob, bouquetFilename())
    setStatus('A bouquet is in the mail')
  } catch {
    setStatus('Could not save the bouquet — try again')
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
  setStatus(
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
      setStatus('Nothing to forage — the fox left empty-handed')
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
  setStatus('Share ended — tap Listen to follow the mix again')
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
  if (key === 'l') {
    toggleListen()
    return
  }
  if (key === 'c') {
    clearGarden()
    return
  }
  if (key === 'k') {
    startForage()
  }
})

function pointerToLogical(e: PointerEvent): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const scale = renderer.getScale()
  const backingX = ((e.clientX - rect.left) * canvas.width) / rect.width
  const backingY = ((e.clientY - rect.top) * canvas.height) / rect.height
  return { x: backingX / scale, y: backingY / scale }
}

function flowerUnder(e: PointerEvent): FlowerPlant | null {
  const pt = pointerToLogical(e)
  if (!pt) return null
  return garden.hitFlowerAt(pt.x, pt.y, lastFrameNow || performance.now())
}

function hoverPointer(e: PointerEvent): boolean {
  if (e.pointerType === 'touch') return false
  if (e.pointerType === 'mouse' && performance.now() < suppressMouseHoverUntil) {
    return false
  }
  return e.pointerType === 'mouse' || e.pointerType === 'pen'
}

function setBloomCursor(on: boolean): void {
  canvas.classList.toggle('is-over-bloom', on)
}

function chimeFlower(plant: FlowerPlant): void {
  chime.play(plant.hz, plant.timbreT, plant.loudnessT)
}

canvas.addEventListener('pointerdown', (e) => {
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
  hoverFlower = null
  setBloomCursor(false)
  if (e.pointerType !== 'touch') hideInspect()
})

canvas.addEventListener('pointercancel', () => {
  hoverFlower = null
  setBloomCursor(false)
  hideInspect()
})

modeSpeakerBtn.addEventListener('click', () => {
  applyMode('speaker')
})

modeMusicBtn.addEventListener('click', () => {
  applyMode('music')
})

window.addEventListener('resize', fitCanvas)
if (typeof ResizeObserver !== 'undefined' && glass) {
  new ResizeObserver(fitCanvas).observe(glass)
}

function frame(now: number): void {
  lastFrameNow = now
  garden.tick(now, listening)

  if (listening) {
    const sample = detector.sample()
    garden.ingest(sample, now)

    if (sample.isVoice && sample.hz !== null) {
      smoothedHz =
        smoothedHz === null ? sample.hz : smoothedHz * 0.7 + sample.hz * 0.3
      livePitchT = pitchNorm(smoothedHz, listenMode)
      updateHud(smoothedHz, true)
      setStatus(`Blooming · ${Math.round(smoothedHz)} Hz`)
    } else {
      livePitchT = null
      updateHud(null, false)
      if (sample.percussive) {
        setStatus(
          listenMode === 'music' ? 'Beat · the bed is swaying' : listeningStatus(),
        )
      } else if (sample.rms < detector.silenceThreshold) {
        setStatus(
          listenMode === 'music'
            ? 'Quiet in the mix · grass is filling the gaps'
            : 'Pause · grass is filling the gaps',
        )
      } else {
        setStatus(listeningStatus())
      }
    }
  }

  if (undoSnapshot && hasLivingFlower()) dropUndo()

  if (inspectFlower && !bloomInspect.hidden && !garden.plants.includes(inspectFlower)) {
    hideInspect()
  }

  syncCourtyardCaption()
  const forageView = tickForage(now)
  renderer.draw(garden, now, livePitchT, forageView)
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

if (import.meta.env.DEV) {
  Object.assign(window, { __sg: { garden, chime, renderer } })
}
