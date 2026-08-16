import './style.css'
import { PitchDetector, pitchNorm, SILENCE_THRESHOLD } from './audio/pitch'
import { Garden } from './garden/world'
import { GardenRenderer } from './garden/renderer'

const LOGICAL_W = 240
const LOGICAL_H = 160
const SOIL_Y = 70

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="shell">
    <header class="brand">
      <h1 class="logo">Synesthesia Garden</h1>
      <p class="tagline">Speak, and a pixel meadow grows from your voice.</p>
    </header>

    <main class="stage">
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
      <div class="hud" aria-live="polite">
        <div class="meters">
          <div class="meter">
            <span class="meter-label">Pitch</span>
            <div class="meter-track"><div class="meter-fill" id="pitch-fill"></div></div>
            <span class="meter-value" id="pitch-hz">— Hz</span>
          </div>
          <div class="meter">
            <span class="meter-label">Loudness</span>
            <div class="meter-track"><div class="meter-fill" id="loudness-fill"></div></div>
            <span class="meter-value"></span>
          </div>
          <div class="meter">
            <span class="meter-label">Timbre</span>
            <div class="meter-track"><div class="meter-fill" id="timbre-fill"></div></div>
            <span class="meter-value"></span>
          </div>
        </div>
        <div class="status" id="status">Tap listen to plant with your voice</div>
      </div>
    </main>

    <div class="controls">
      <button type="button" class="btn primary" id="listen-btn">Listen</button>
      <button type="button" class="btn" id="clear-btn">Clear garden</button>
    </div>

    <p class="hint">
      Pitch walks the flower kind and hue. Loudness stretches stem and bloom.
      Bright vowels nudge the kind and petal contrast. Onsets sway the bed.
      Quiet pauses grow grass.
    </p>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#garden')!
const listenBtn = document.querySelector<HTMLButtonElement>('#listen-btn')!
const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!
const pitchFill = document.querySelector<HTMLDivElement>('#pitch-fill')!
const pitchHz = document.querySelector<HTMLSpanElement>('#pitch-hz')!
const loudnessFill = document.querySelector<HTMLDivElement>('#loudness-fill')!
const timbreFill = document.querySelector<HTMLDivElement>('#timbre-fill')!
const statusEl = document.querySelector<HTMLDivElement>('#status')!

const garden = new Garden({ width: LOGICAL_W, height: LOGICAL_H, soilY: SOIL_Y })
const detector = new PitchDetector()

function computeScale(): number {
  const maxW = Math.min(window.innerWidth - 48, 900)
  const maxH = Math.min(window.innerHeight * 0.58, 560)
  return Math.max(2, Math.min(3, Math.floor(Math.min(maxW / LOGICAL_W, maxH / LOGICAL_H))))
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

function updateHud(
  hz: number | null,
  isVoice: boolean,
  loudnessT = 0,
  timbreT = 0,
): void {
  if (hz !== null && isVoice) {
    const t = pitchNorm(hz)
    pitchFill.style.width = `${Math.round(t * 100)}%`
    pitchFill.style.background = `hsl(${(350 + t * 42) % 360} ${28 + t * 44}% ${62}%)`
    pitchHz.textContent = `${Math.round(hz)} Hz`
  } else {
    pitchFill.style.width = '0%'
    pitchHz.textContent = '— Hz'
  }

  loudnessFill.style.width = `${Math.round(loudnessT * 100)}%`
  loudnessFill.style.background = `hsl(42 ${28 + loudnessT * 40}% ${58}%)`
  timbreFill.style.width = `${Math.round(timbreT * 100)}%`
  timbreFill.style.background = `hsl(${175 + timbreT * 90} ${30 + timbreT * 28}% ${58}%)`
}

listenBtn.addEventListener('click', async () => {
  if (listening) {
    detector.stop()
    listening = false
    livePitchT = null
    listenBtn.textContent = 'Listen'
    listenBtn.classList.remove('active')
    setStatus('Paused — garden is resting')
    updateHud(null, false)
    return
  }

  try {
    listenBtn.disabled = true
    setStatus('Allowing microphone…')
    await detector.start()
    listening = true
    listenBtn.textContent = 'Pause'
    listenBtn.classList.add('active')
    setStatus('Listening — speak or hum to grow flowers')
  } catch {
    setStatus('Microphone blocked — allow access to grow the garden')
  } finally {
    listenBtn.disabled = false
  }
})

clearBtn.addEventListener('click', () => {
  garden.clear()
  setStatus('Garden cleared — a fresh bed awaits')
})

window.addEventListener('resize', () => {
  renderer.setScale(computeScale())
})

function frame(now: number): void {
  if (listening) {
    const sample = detector.sample()
    garden.ingest(sample, now)

    if (sample.isVoice && sample.hz !== null) {
      smoothedHz =
        smoothedHz === null ? sample.hz : smoothedHz * 0.7 + sample.hz * 0.3
      livePitchT = pitchNorm(smoothedHz)
      updateHud(smoothedHz, true, sample.loudnessT, sample.timbreT)
      setStatus(`Blooming · ${Math.round(smoothedHz)} Hz`)
    } else {
      livePitchT = null
      const showMeters = sample.rms >= SILENCE_THRESHOLD
      updateHud(
        null,
        false,
        showMeters ? sample.loudnessT : 0,
        showMeters ? sample.timbreT : 0,
      )
      if (sample.rms < SILENCE_THRESHOLD) {
        setStatus('Pause · grass is sprouting')
      }
    }
  }

  renderer.draw(garden, now, livePitchT)
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
