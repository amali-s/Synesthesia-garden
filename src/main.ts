import './style.css'
import {
  DisplayAudioError,
  PitchDetector,
  displayAudioCaptureSupported,
  pitchNorm,
  type ListenMode,
} from './audio/pitch'
import { BloomChime } from './audio/chime'
import { Garden, type FlowerPlant } from './garden/world'
import { GardenRenderer } from './garden/renderer'

const LOGICAL_W = 320
const LOGICAL_H = 200

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="shell">
    <header class="top-bar">
      <h1 class="logo">Synesthesia Garden</h1>
      <div class="controls">
        <button type="button" class="btn primary" id="listen-btn">Listen</button>
        <button type="button" class="btn" id="stop-btn" disabled>Stop</button>
        <button type="button" class="btn" id="clear-btn">Clear garden</button>
        <div class="mode-toggle" role="group" aria-label="Listen source">
          <button type="button" class="mode-btn" id="mode-speaker" aria-pressed="true">Speaker</button>
          <button type="button" class="mode-btn" id="mode-music" aria-pressed="false">Music</button>
        </div>
      </div>
      <div class="meter pitch-meter" title="Pitch">
        <span class="meter-label">Pitch</span>
        <div class="meter-track"><div class="meter-fill" id="pitch-fill"></div></div>
        <span class="meter-value" id="pitch-hz">— Hz</span>
      </div>
      <div class="status" id="status">Tap Listen to plant with your voice</div>
    </header>

    <main class="meadow">
      <div class="window-frame">
        <div class="window-frame__glass">
          <canvas id="garden" aria-label="Pixel art garden grown from your voice or music"></canvas>
        </div>
      </div>
    </main>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#garden')!
const listenBtn = document.querySelector<HTMLButtonElement>('#listen-btn')!
const stopBtn = document.querySelector<HTMLButtonElement>('#stop-btn')!
const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!
const modeSpeakerBtn = document.querySelector<HTMLButtonElement>('#mode-speaker')!
const modeMusicBtn = document.querySelector<HTMLButtonElement>('#mode-music')!
const pitchFill = document.querySelector<HTMLDivElement>('#pitch-fill')!
const pitchHz = document.querySelector<HTMLSpanElement>('#pitch-hz')!
const statusEl = document.querySelector<HTMLDivElement>('#status')!
const glass = document.querySelector<HTMLDivElement>('.window-frame__glass')!

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

function computeScale(): number {
  const maxW = Math.max(1, glass?.clientWidth ?? window.innerWidth)
  const maxH = Math.max(1, glass?.clientHeight ?? window.innerHeight)
  return Math.max(1, Math.floor(Math.min(maxW / LOGICAL_W, maxH / LOGICAL_H)))
}

const renderer = new GardenRenderer(canvas, LOGICAL_W, LOGICAL_H, {
  scale: computeScale(),
})

function fitCanvas(): void {
  renderer.setScale(computeScale())
  canvas.style.left = '0'
  canvas.style.top = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
}

fitCanvas()

function setStatus(text: string): void {
  statusEl.textContent = text
}

function idleStatus(): string {
  if (listenMode === 'music') {
    if (!displayAudioCaptureSupported()) {
      return 'This browser can’t capture tab or system audio. Use Speaker, or try Chrome or Edge.'
    }
    return 'Play a song, then Listen and share that tab or window with audio'
  }
  return 'Tap Listen to plant with your voice'
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

function setListeningUi(on: boolean): void {
  listenBtn.classList.toggle('active', on)
  listenBtn.disabled = on
  stopBtn.disabled = !on
}

function updateHud(hz: number | null, planted: boolean): void {
  if (hz !== null && planted) {
    const t = pitchNorm(hz, listenMode)
    pitchFill.style.width = `${Math.round(t * 100)}%`
    pitchFill.style.background = `hsl(${(350 + t * 42) % 360} ${28 + t * 44}% ${62}%)`
    pitchHz.textContent = `${Math.round(hz)} Hz`
  } else {
    pitchFill.style.width = '0%'
    pitchHz.textContent = '— Hz'
  }
}

function resetLivePitch(): void {
  livePitchT = null
  smoothedHz = null
  updateHud(null, false)
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

async function startListen(): Promise<void> {
  if (listening) return
  try {
    listenBtn.disabled = true
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

detector.onCaptureEnded = () => {
  listening = false
  resetLivePitch()
  setListeningUi(false)
  setStatus('Share ended — tap Listen to follow the mix again')
}

listenBtn.addEventListener('click', () => {
  void startListen()
})

stopBtn.addEventListener('click', () => {
  stopListen()
})

clearBtn.addEventListener('click', () => {
  garden.clear()
  hoverFlower = null
  canvas.classList.remove('is-over-bloom')
  setStatus('Garden cleared — a fresh bed awaits')
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
  if (flower === hoverFlower) return
  hoverFlower = flower
  if (flower) chimeFlower(flower)
})

canvas.addEventListener('pointerleave', () => {
  hoverFlower = null
  setBloomCursor(false)
})

canvas.addEventListener('pointercancel', () => {
  hoverFlower = null
  setBloomCursor(false)
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

  renderer.draw(garden, now, livePitchT)
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
