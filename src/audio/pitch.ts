/** Vocal pitch range (Hz) — speaking through singing */
export const VOCAL_MIN_HZ = 80
export const VOCAL_MAX_HZ = 1000

/** Wider window for a music mix (instruments + voice). pitchNorm still uses vocal range. */
export const MUSIC_MIN_HZ = 50
export const MUSIC_MAX_HZ = 2000

/** Below this RMS, treat as pause / silence */
export const SILENCE_THRESHOLD = 0.012

/** Tab/system capture is often quieter than a close mic */
export const MUSIC_SILENCE_THRESHOLD = 0.008

/** RMS that maps to loudnessT = 1 (belt / close-mic) */
export const LOUDNESS_MAX_RMS = 0.25

/** Spectral centroid range for timbreT */
export const TIMBRE_MIN_HZ = 200
export const TIMBRE_MAX_HZ = 4000

export type ListenMode = 'speaker' | 'music'

export type PitchSample = {
  hz: number | null
  rms: number
  /** Plantable pitch in the current mode’s window (voice for Speaker, mix pitch for Music) */
  isVoice: boolean
  loudnessT: number
  timbreT: number
  centroidHz: number | null
  onset: boolean
}

export type DisplayAudioErrorReason = 'unsupported' | 'denied' | 'no-audio'

export class DisplayAudioError extends Error {
  readonly reason: DisplayAudioErrorReason

  constructor(reason: DisplayAudioErrorReason, message: string) {
    super(message)
    this.name = 'DisplayAudioError'
    this.reason = reason
  }
}

type SourceKind = 'none' | 'mic' | 'display' | 'media'

/**
 * Autocorrelation pitch detector tuned for vocal fundamentals.
 * Accepts microphone, display/tab audio, or any AudioNode / media element source.
 */
export class PitchDetector {
  private ctx: AudioContext
  private analyser: AnalyserNode
  private stream: MediaStream | null = null
  private streamSource: MediaStreamAudioSourceNode | null = null
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
  /** Fired when the user stops a display-audio share from the browser UI. */
  onCaptureEnded: (() => void) | null = null

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

  get isDisplay(): boolean {
    return this.kind === 'display'
  }

  get isMedia(): boolean {
    return this.kind === 'media'
  }

  get silenceThreshold(): number {
    return this.kind === 'display' ? MUSIC_SILENCE_THRESHOLD : SILENCE_THRESHOLD
  }

  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  /** Start listening. Speaker = microphone; Music = tab/window/system audio. */
  async start(options: { mode?: ListenMode } = {}): Promise<void> {
    if (options.mode === 'music') {
      await this.startDisplayAudio()
      return
    }
    await this.startMic()
  }

  /** Start listening to the microphone (no speaker feedback). */
  async startMic(): Promise<void> {
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
    this.streamSource = this.ctx.createMediaStreamSource(this.stream)
    this.streamSource.connect(this.analyser)
    this.setHearing(false)
    this.kind = 'mic'
    await this.resume()
  }

  /**
   * Capture tab / window / system audio (not the room via the mic).
   * Video is requested so Chrome/Edge can offer “Share audio”; the video
   * track is muted and ignored. Capture is never routed to speakers.
   */
  async startDisplayAudio(): Promise<void> {
    if (this.kind === 'display') {
      await this.resume()
      return
    }

    if (!displayAudioCaptureSupported()) {
      throw new DisplayAudioError(
        'unsupported',
        'This browser can’t capture tab or system audio. Use Speaker, or try Chrome or Edge.',
      )
    }

    this.detachInput()

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        // Chrome: include OS audio when sharing a screen
        systemAudio: 'include',
      } as DisplayMediaStreamOptions)
    } catch (err) {
      if (isUserDismissedCapture(err)) {
        throw new DisplayAudioError(
          'denied',
          'Share cancelled — play a song, then Listen and share that tab or window with audio',
        )
      }
      throw new DisplayAudioError(
        'unsupported',
        'This browser can’t capture tab or system audio. Use Speaker, or try Chrome or Edge.',
      )
    }

    for (const track of stream.getVideoTracks()) {
      track.enabled = false
    }

    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop())
      throw new DisplayAudioError(
        'no-audio',
        'That share had no audio — choose a tab or window and tick “Share audio”',
      )
    }

    this.stream = stream
    this.streamSource = this.ctx.createMediaStreamSource(stream)
    this.streamSource.connect(this.analyser)
    this.setHearing(false)
    this.kind = 'display'

    const onEnded = (): void => {
      if (this.kind !== 'display') return
      this.detachInput()
      this.onCaptureEnded?.()
    }
    for (const track of audioTracks) {
      track.addEventListener('ended', onEnded)
    }

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
    this.stopStreamTracks()
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

  /** Stop mic / display / detach graph inputs. Keeps media element source node for reuse. */
  stop(): void {
    this.detachInput()
  }

  sample(): PitchSample {
    this.analyser.getFloatTimeDomainData(this.buf as Float32Array<ArrayBuffer>)
    this.analyser.getFloatFrequencyData(this.freqBuf as Float32Array<ArrayBuffer>)
    const rms = rootMeanSquare(this.buf)
    const { flux, centroidHz } = this.spectrumFeatures()
    const silence = this.silenceThreshold
    const loudnessT = loudnessNorm(rms, silence)
    const timbreT = centroidHz === null ? 0.5 : timbreNorm(centroidHz)
    const onset = this.detectOnset(rms, flux, silence)

    if (rms < silence) {
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

    const music = this.kind === 'display'
    const minHz = music ? MUSIC_MIN_HZ : VOCAL_MIN_HZ
    const maxHz = music ? MUSIC_MAX_HZ : VOCAL_MAX_HZ
    const hz = detectPitchHz(this.buf, this.ctx.sampleRate, minHz, maxHz)
    const inRange = hz !== null && hz >= minHz && hz <= maxHz
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

  private detectOnset(rms: number, flux: number, silence: number): boolean {
    const prev = this.prevRms
    const dRms = rms - prev
    this.prevRms = rms
    const fluxThresh = Math.max(0.04, this.fluxMean * 1.65)
    this.fluxMean = this.fluxMean * 0.88 + flux * 0.12

    if (rms < silence) return false
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

  private stopStreamTracks(): void {
    this.streamSource?.disconnect()
    this.streamSource = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }

  private detachInput(): void {
    // Clear kind first so track `ended` from our own stop() is ignored.
    this.kind = 'none'
    this.stopStreamTracks()
    this.externalSource?.disconnect()
    this.externalSource = null
    this.mediaSource?.disconnect()
    // Keep mediaSource + mediaElement for reuse; just disconnect from analyser
    this.setHearing(false)
  }
}

export function displayAudioCaptureSupported(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
    return false
  }
  const ua = navigator.userAgent
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg|Android/i.test(ua)
  return !isSafari
}

function isUserDismissedCapture(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false
  return err.name === 'NotAllowedError' || err.name === 'AbortError'
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
function detectPitchHz(
  buf: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
): number | null {
  const size = buf.length
  const minLag = Math.floor(sampleRate / maxHz)
  const maxLag = Math.floor(sampleRate / minHz)

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

/** Map Hz into 0–1 on a log2 (equal-temperament) scale — vocal range, clamped outside it */
export function pitchNorm(hz: number): number {
  return logNorm(hz, VOCAL_MIN_HZ, VOCAL_MAX_HZ)
}

/** Map RMS into 0–1 from silence up to a belt */
export function loudnessNorm(rms: number, silence = SILENCE_THRESHOLD): number {
  return logNorm(rms, silence, LOUDNESS_MAX_RMS)
}

/** Map spectral centroid Hz into 0–1 (dark → bright) */
export function timbreNorm(centroidHz: number): number {
  return logNorm(centroidHz, TIMBRE_MIN_HZ, TIMBRE_MAX_HZ)
}
