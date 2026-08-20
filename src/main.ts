import './style.css'
import {
  DisplayAudioError,
  PitchDetector,
  displayAudioCaptureSupported,
  pitchNorm,
  type ListenMode,
} from './audio/pitch'
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
      <div class="window-frame" aria-hidden="false">
        <div class="window-frame__ornament window-frame__ornament--tl" aria-hidden="true"></div>
        <div class="window-frame__ornament window-frame__ornament--tr" aria-hidden="true"></div>
        <div class="window-frame__ornament window-frame__ornament--bl" aria-hidden="true"></div>
        <div class="window-frame__ornament window-frame__ornament--br" aria-hidden="true"></div>
        <div class="window-frame__rail window-frame__rail--top" aria-hidden="true"></div>
        <div class="window-frame__rail window-frame__rail--bottom" aria-hidden="true"></div>
        <div class="window-frame__mullion" aria-hidden="true"></div>
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

const garden = new Garden({ width: LOGICAL_W, height: LOGICAL_H, soilY: SOIL_Y })
const detector = new PitchDetector()

let listenMode: ListenMode = 'speaker'
let listening = false
let livePitchT: number | null = null
let smoothedHz: number | null = null

function computeScale(): number {
  const pad = 4
  const maxW = Math.max(1, (glass?.clientWidth ?? window.innerWidth) - pad)
  const maxH = Math.max(1, (glass?.clientHeight ?? window.innerHeight) - pad)
  return Math.max(1, Math.floor(Math.min(maxW / LOGICAL_W, maxH / LOGICAL_H)))
}

const renderer = new GardenRenderer(canvas, LOGICAL_W, LOGICAL_H, SOIL_Y, {
  scale: computeScale(),
})

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
    const t = pitchNorm(hz)
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
  setStatus('Garden cleared — a fresh bed awaits')
})

modeSpeakerBtn.addEventListener('click', () => {
  applyMode('speaker')
})

modeMusicBtn.addEventListener('click', () => {
  applyMode('music')
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
