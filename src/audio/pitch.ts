/** Vocal pitch range (Hz) — speaking through singing */
export const VOCAL_MIN_HZ = 80
export const VOCAL_MAX_HZ = 1000

/** Below this RMS, treat as pause / silence */
export const SILENCE_THRESHOLD = 0.012

export type PitchSample = {
  hz: number | null
  rms: number
  isVoice: boolean
}

/**
 * Autocorrelation pitch detector tuned for vocal fundamentals.
 */
export class PitchDetector {
  private ctx: AudioContext
  private analyser: AnalyserNode
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private buf: Float32Array
  private running = false

  constructor() {
    this.ctx = new AudioContext()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.3
    this.buf = new Float32Array(this.analyser.fftSize)
  }

  async start(): Promise<void> {
    if (this.running) return
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })
    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.source.connect(this.analyser)
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this.running = true
  }

  stop(): void {
    this.source?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.source = null
    this.stream = null
    this.running = false
  }

  get isRunning(): boolean {
    return this.running
  }

  sample(): PitchSample {
    this.analyser.getFloatTimeDomainData(this.buf as Float32Array<ArrayBuffer>)
    const rms = rootMeanSquare(this.buf)
    if (rms < SILENCE_THRESHOLD) {
      return { hz: null, rms, isVoice: false }
    }
    const hz = detectPitchHz(this.buf, this.ctx.sampleRate)
    const inRange =
      hz !== null && hz >= VOCAL_MIN_HZ && hz <= VOCAL_MAX_HZ
    return {
      hz: inRange ? hz : null,
      rms,
      isVoice: inRange,
    }
  }
}

function rootMeanSquare(buf: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!
  return Math.sqrt(sum / buf.length)
}

/**
 * Autocorrelation with parabolic interpolation.
 * Returns fundamental frequency in Hz, or null if unclear.
 */
function detectPitchHz(buf: Float32Array, sampleRate: number): number | null {
  const size = buf.length
  const minLag = Math.floor(sampleRate / VOCAL_MAX_HZ)
  const maxLag = Math.floor(sampleRate / VOCAL_MIN_HZ)

  // Remove DC offset
  let mean = 0
  for (let i = 0; i < size; i++) mean += buf[i]!
  mean /= size

  const signal = new Float32Array(size)
  for (let i = 0; i < size; i++) signal[i] = buf[i]! - mean

  let bestLag = -1
  let bestCorr = 0
  let prevCorr = 1

  // Normalize by zero-lag energy
  let energy = 0
  for (let i = 0; i < size; i++) energy += signal[i]! * signal[i]!
  if (energy < 1e-8) return null

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0
    for (let i = 0; i < size - lag; i++) {
      corr += signal[i]! * signal[i + lag]!
    }
    corr /= energy

    // Look for first strong peak after a rising edge
    if (corr > 0.3 && corr > prevCorr && corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
    prevCorr = corr
  }

  if (bestLag < 0 || bestCorr < 0.35) return null

  // Parabolic refinement around best lag
  const y0 = correlateAt(signal, energy, bestLag - 1)
  const y1 = bestCorr
  const y2 = correlateAt(signal, energy, bestLag + 1)
  const denom = 2 * (2 * y1 - y0 - y2)
  const shift = denom !== 0 ? (y0 - y2) / denom : 0
  const refinedLag = bestLag + shift

  return sampleRate / refinedLag
}

function correlateAt(signal: Float32Array, energy: number, lag: number): number {
  if (lag < 1 || lag >= signal.length) return 0
  let corr = 0
  for (let i = 0; i < signal.length - lag; i++) {
    corr += signal[i]! * signal[i + lag]!
  }
  return corr / energy
}

/** Map Hz into 0–1 within vocal range */
export function pitchNorm(hz: number): number {
  const t = (hz - VOCAL_MIN_HZ) / (VOCAL_MAX_HZ - VOCAL_MIN_HZ)
  return Math.min(1, Math.max(0, t))
}
