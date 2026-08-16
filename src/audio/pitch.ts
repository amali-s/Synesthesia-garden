/** Vocal pitch range (Hz) — speaking through singing */
export const VOCAL_MIN_HZ = 80
export const VOCAL_MAX_HZ = 1000

/** Below this RMS, treat as pause / silence */
export const SILENCE_THRESHOLD = 0.012

/** RMS that maps to loudnessT = 1 (belt / close-mic) */
export const LOUDNESS_MAX_RMS = 0.25

/** Spectral centroid range for timbreT */
export const TIMBRE_MIN_HZ = 200
export const TIMBRE_MAX_HZ = 4000

export type PitchSample = {
  hz: number | null
  rms: number
  isVoice: boolean
  loudnessT: number
  timbreT: number
  centroidHz: number | null
  onset: boolean
}

type SourceKind = 'none' | 'mic' | 'media'

/**
 * Autocorrelation pitch detector tuned for vocal fundamentals.
 * Accepts microphone or any AudioNode / media element source.
 */
export class PitchDetector {
  private ctx: AudioContext
  private analyser: AnalyserNode
  private stream: MediaStream | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private mediaSource: MediaElementAudioSourceNode | null = null
  private mediaElement: HTMLMediaElement | null = null
  private externalSource: AudioNode | null = null
  private kind: SourceKind = 'none'
  private hearing = false
  private buf: Float32Array
  private freqBuf: Float32Array
  private prevLin: Float32Array
  private prevRms = 0
  private fluxMean = 0
  private lastOnsetTime = -1

  constructor() {
    this.ctx = new AudioContext()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.3
    this.buf = new Float32Array(this.analyser.fftSize)
    this.freqBuf = new Float32Array(this.analyser.frequencyBinCount)
    this.prevLin = new Float32Array(this.analyser.frequencyBinCount)
  }

  get isRunning(): boolean {
    return this.kind !== 'none'
  }

  get isMic(): boolean {
    return this.kind === 'mic'
  }

  get isMedia(): boolean {
    return this.kind === 'media'
  }

  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  /** Start listening to the microphone (no speaker feedback). */
  async start(): Promise<void> {
    if (this.kind === 'mic') {
      await this.resume()
      return
    }
    this.detachInput()
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
      video: false,
    })
    this.micSource = this.ctx.createMediaStreamSource(this.stream)
    this.micSource.connect(this.analyser)
    this.setHearing(false)
    this.kind = 'mic'
    await this.resume()
  }

  /**
   * Tap an HTML media element for pitch + optional playback through speakers.
   * The same element can be re-attached safely (createMediaElementSource once).
   */
  async attachMediaElement(
    el: HTMLMediaElement,
    options: { toDestination?: boolean } = {},
  ): Promise<void> {
    const toDestination = options.toDestination ?? true
    this.stopMicTracks()
    this.externalSource?.disconnect()
    this.externalSource = null

    if (this.mediaElement !== el) {
      this.mediaSource?.disconnect()
      this.mediaSource = this.ctx.createMediaElementSource(el)
      this.mediaElement = el
    } else {
      this.mediaSource?.disconnect()
    }

    this.mediaSource!.connect(this.analyser)
    this.setHearing(toDestination)
    this.kind = 'media'
    await this.resume()
  }

  /** Connect an arbitrary AudioNode (e.g. buffer source). */
  async connectSource(
    node: AudioNode,
    options: { toDestination?: boolean } = {},
  ): Promise<void> {
    const toDestination = options.toDestination ?? true
    this.detachInput()
    this.externalSource = node
    node.connect(this.analyser)
    this.setHearing(toDestination)
    this.kind = 'media'
    await this.resume()
  }

  /** Stop mic / detach graph inputs. Keeps media element source node for reuse. */
  stop(): void {
    this.detachInput()
  }

  sample(): PitchSample {
    this.analyser.getFloatTimeDomainData(this.buf as Float32Array<ArrayBuffer>)
    this.analyser.getFloatFrequencyData(this.freqBuf as Float32Array<ArrayBuffer>)
    const rms = rootMeanSquare(this.buf)
    const { flux, centroidHz } = this.spectrumFeatures()
    const loudnessT = loudnessNorm(rms)
    const timbreT = centroidHz === null ? 0.5 : timbreNorm(centroidHz)
    const onset = this.detectOnset(rms, flux)

    if (rms < SILENCE_THRESHOLD) {
      return {
        hz: null,
        rms,
        isVoice: false,
        loudnessT: 0,
        timbreT,
        centroidHz,
        onset: false,
      }
    }
    const hz = detectPitchHz(this.buf, this.ctx.sampleRate)
    const inRange =
      hz !== null && hz >= VOCAL_MIN_HZ && hz <= VOCAL_MAX_HZ
    return {
      hz: inRange ? hz : null,
      rms,
      isVoice: inRange,
      loudnessT,
      timbreT,
      centroidHz,
      onset,
    }
  }

  /** Linear-mag centroid + half-wave spectral flux; updates prevLin. */
  private spectrumFeatures(): { flux: number; centroidHz: number | null } {
    const binHz = this.ctx.sampleRate / this.analyser.fftSize
    let num = 0
    let den = 0
    let flux = 0
    for (let i = 1; i < this.freqBuf.length; i++) {
      const db = this.freqBuf[i]!
      const mag = Number.isFinite(db) && db > -90 ? 10 ** (db / 20) : 0
      num += i * binHz * mag
      den += mag
      const diff = mag - this.prevLin[i]!
      if (diff > 0) flux += diff
      this.prevLin[i] = mag
    }
    return { flux, centroidHz: den < 1e-8 ? null : num / den }
  }

  private detectOnset(rms: number, flux: number): boolean {
    const prev = this.prevRms
    const dRms = rms - prev
    this.prevRms = rms
    const fluxThresh = Math.max(0.04, this.fluxMean * 1.65)
    this.fluxMean = this.fluxMean * 0.88 + flux * 0.12

    if (rms < SILENCE_THRESHOLD) return false
    const t = this.ctx.currentTime
    if (this.lastOnsetTime >= 0 && t - this.lastOnsetTime < 0.12) return false

    const rmsOnset = dRms > Math.max(0.008, prev * 0.35)
    const fluxOnset = flux > fluxThresh
    if (!rmsOnset && !fluxOnset) return false
    this.lastOnsetTime = t
    return true
  }

  private setHearing(hear: boolean): void {
    if (this.hearing === hear) return
    try {
      this.analyser.disconnect()
    } catch {
      /* not connected */
    }
    if (hear) {
      this.analyser.connect(this.ctx.destination)
    }
    this.hearing = hear
  }

  private stopMicTracks(): void {
    this.micSource?.disconnect()
    this.micSource = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }

  private detachInput(): void {
    this.stopMicTracks()
    this.externalSource?.disconnect()
    this.externalSource = null
    this.mediaSource?.disconnect()
    // Keep mediaSource + mediaElement for reuse; just disconnect from analyser
    this.setHearing(false)
    this.kind = 'none'
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

  let mean = 0
  for (let i = 0; i < size; i++) mean += buf[i]!
  mean /= size

  const signal = new Float32Array(size)
  for (let i = 0; i < size; i++) signal[i] = buf[i]! - mean

  let bestLag = -1
  let bestCorr = 0
  let prevCorr = 1

  let energy = 0
  for (let i = 0; i < size; i++) energy += signal[i]! * signal[i]!
  if (energy < 1e-8) return null

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0
    for (let i = 0; i < size - lag; i++) {
      corr += signal[i]! * signal[i + lag]!
    }
    corr /= energy

    if (corr > 0.3 && corr > prevCorr && corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
    prevCorr = corr
  }

  if (bestLag < 0 || bestCorr < 0.35) return null

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

function logNorm(value: number, min: number, max: number): number {
  if (value <= min) return 0
  if (value >= max) return 1
  return Math.log(value / min) / Math.log(max / min)
}

/** Map Hz into 0–1 on a log2 (equal-temperament) scale */
export function pitchNorm(hz: number): number {
  return logNorm(hz, VOCAL_MIN_HZ, VOCAL_MAX_HZ)
}

/** Map RMS into 0–1 from silence up to a belt */
export function loudnessNorm(rms: number): number {
  return logNorm(rms, SILENCE_THRESHOLD, LOUDNESS_MAX_RMS)
}

/** Map spectral centroid Hz into 0–1 (dark → bright) */
export function timbreNorm(centroidHz: number): number {
  return logNorm(centroidHz, TIMBRE_MIN_HZ, TIMBRE_MAX_HZ)
}
