import './style.css'
import { PitchDetector, pitchNorm, SILENCE_THRESHOLD } from './audio/pitch'
import { Garden } from './garden/world'
import { GardenRenderer } from './garden/renderer'

const LOGICAL_W = 320
const LOGICAL_H = 200
const SOIL_Y = 88

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="shell">
    <header class="top-bar">
      <h1 class="logo">Synesthesia Garden</h1>
      <div class="controls">
        <button type="button" class="btn primary" id="listen-btn">Listen</button>
        <button type="button" class="btn" id="stop-btn" disabled>Stop</button>
        <button type="button" class="btn" id="clear-btn">Clear garden</button>
      </div>
      <div class="meter pitch-meter" title="Pitch">
        <span class="meter-label">Pitch</span>
        <div class="meter-track"><div class="meter-fill" id="pitch-fill"></div></div>
        <span class="meter-value" id="pitch-hz">— Hz</span>
      </div>
      <div class="status" id="status">Tap listen to plant with your voice</div>
    </header>

    <main class="meadow">
      <div class="window-frame" aria-hidden="false">
        <div class="window-frame__ornament window-frame__ornament--tl" aria-hidden="true"></div>
        <div class="window-frame__ornament window-frame__ornament--tr" aria-hidden="true"></div>
        <div class="window-frame__ornament window-frame__ornament--bl" aria-hidden="true"></div>
        <div class="window-frame__ornament window-frame__ornament--br" aria-hidden="true"></div>
        <div class="window-frame__rail window-frame__rail--top" aria-hidden="true"></div>
        <div class="window-frame__rail window-frame__rail--bottom" aria-hidden="true"></div>
        <div class="window-frame__mullion" aria-hidden="true"></div>
        <div class="window-frame__glass">
          <canvas id="garden" aria-label="Pixel art garden grown from your voice"></canvas>
        </div>
      </div>
    </main>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#garden')!
const listenBtn = document.querySelector<HTMLButtonElement>('#listen-btn')!
const stopBtn = document.querySelector<HTMLButtonElement>('#stop-btn')!
const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!
const pitchFill = document.querySelector<HTMLDivElement>('#pitch-fill')!
const pitchHz = document.querySelector<HTMLSpanElement>('#pitch-hz')!
const statusEl = document.querySelector<HTMLDivElement>('#status')!
const glass = document.querySelector<HTMLDivElement>('.window-frame__glass')!

const garden = new Garden({ width: LOGICAL_W, height: LOGICAL_H, soilY: SOIL_Y })
const detector = new PitchDetector()

function computeScale(): number {
  const pad = 4
  const maxW = Math.max(1, (glass?.clientWidth ?? window.innerWidth) - pad)
  const maxH = Math.max(1, (glass?.clientHeight ?? window.innerHeight) - pad)
  return Math.max(1, Math.floor(Math.min(maxW / LOGICAL_W, maxH / LOGICAL_H)))
}

const renderer = new GardenRenderer(canvas, LOGICAL_W, LOGICAL_H, SOIL_Y, {
  scale: computeScale(),
})

let listening = false
let livePitchT: number | null = null
let smoothedHz: number | null = null

function setStatus(text: string): void {
  statusEl.textContent = text
}

function setListeningUi(on: boolean): void {
  listenBtn.classList.toggle('active', on)
  listenBtn.disabled = on
  stopBtn.disabled = !on
}

function updateHud(hz: number | null, isVoice: boolean): void {
  if (hz !== null && isVoice) {
    const t = pitchNorm(hz)
    pitchFill.style.width = `${Math.round(t * 100)}%`
    pitchFill.style.background = `hsl(${(350 + t * 42) % 360} ${28 + t * 44}% ${62}%)`
    pitchHz.textContent = `${Math.round(hz)} Hz`
  } else {
    pitchFill.style.width = '0%'
    pitchHz.textContent = '— Hz'
  }
}

async function startListen(): Promise<void> {
  if (listening) return
  try {
    listenBtn.disabled = true
    setStatus('Allowing microphone…')
    await detector.start()
    listening = true
    setListeningUi(true)
    setStatus('Listening — speak or hum to grow flowers')
  } catch {
    listening = false
    setListeningUi(false)
    setStatus('Microphone blocked — allow access to grow the garden')
  }
}

function stopListen(): void {
  if (!listening) return
  detector.stop()
  listening = false
  livePitchT = null
  setListeningUi(false)
  setStatus('Stopped — garden is resting')
  updateHud(null, false)
}

listenBtn.addEventListener('click', () => {
  void startListen()
})

stopBtn.addEventListener('click', () => {
  stopListen()
})

clearBtn.addEventListener('click', () => {
  garden.clear()
  setStatus('Garden cleared — a fresh bed awaits')
})

function fitCanvas(): void {
  renderer.setScale(computeScale())
}

window.addEventListener('resize', fitCanvas)
if (typeof ResizeObserver !== 'undefined' && glass) {
  new ResizeObserver(fitCanvas).observe(glass)
}

function frame(now: number): void {
  garden.tick(now, listening)

  if (listening) {
    const sample = detector.sample()
    garden.ingest(sample, now)

    if (sample.isVoice && sample.hz !== null) {
      smoothedHz =
        smoothedHz === null ? sample.hz : smoothedHz * 0.7 + sample.hz * 0.3
      livePitchT = pitchNorm(smoothedHz)
      updateHud(smoothedHz, true)
      setStatus(`Blooming · ${Math.round(smoothedHz)} Hz`)
    } else {
      livePitchT = null
      updateHud(null, false)
      if (sample.rms < SILENCE_THRESHOLD) {
        setStatus('Pause · grass is filling the gaps')
      }
    }
  }

  renderer.draw(garden, now, livePitchT)
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
