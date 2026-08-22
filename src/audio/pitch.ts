/** Vocal pitch range (Hz) — speaking through singing */
export const VOCAL_MIN_HZ = 80
export const VOCAL_MAX_HZ = 1000

/** Wider window for a music mix (bass through piccolo / piano top). */
export const MUSIC_MIN_HZ = 50
export const MUSIC_MAX_HZ = 4000

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
  /** 0–1 log map in the current mode’s Hz window (vocal vs music). 0 if no pitch. */
  pitchT: number
  rms: number
  /** Plantable pitch in the current mode’s window (voice for Speaker, mix pitch for Music) */
  isVoice: boolean
  loudnessT: number
  timbreT: number
  centroidHz: number | null
  onset: boolean
  /** How long the current pitched event has been continuous (ms). 0 if none. */
  durationMs: number
  /** 0 = left, 0.5 = center, 1 = right. Speaker / mono is center. */
  panT: number
  /** Smoothed tempo from inter-onset intervals, or null until enough hits. */
  bpm: number | null
  /** Multiplier on the 220 ms spawn cooldown (faster tempo → smaller). */
  spawnScale: number
  /** Drum-like: broadband, short, weak pitch — motion only, do not plant. */
  percussive: boolean
  /** Loudness smoothed over ~1–2 s (verse vs chorus). */
  sectionEnergyT: number
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
  private splitter: ChannelSplitterNode | null = null
  private analyserL: AnalyserNode | null = null
  private analyserR: AnalyserNode | null = null
  private bufL: Float32Array | null = null
  private bufR: Float32Array | null = null
  private stereo = false
  private rightAlive = false
  private pitchedSince = -1
  private lastPitchedHz: number | null = null
  private lastSampleAt = -1
  private sectionEnergyT = 0
  private onsetTimes: number[] = []
  private bpmSmoothed: number | null = null
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

  get audioContext(): AudioContext {
    return this.ctx
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
    this.attachStereoTap(this.streamSource)
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
    this.teardownStereo()
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
    this.teardownStereo()
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
    const { flux, centroidHz, flatness, hfRatio } = this.spectrumFeatures()
    const silence = this.silenceThreshold
    const loudnessT = loudnessNorm(rms, silence)
    const timbreT = centroidHz === null ? 0.5 : timbreNorm(centroidHz)
    const now = this.ctx.currentTime
    this.updateSectionEnergy(loudnessT, now)
    const panT = this.samplePan()
    const onset = this.detectOnset(rms, flux, silence)
    if (onset) this.noteOnset(now)

    const mix = this.mixFields()

    if (rms < silence) {
      this.pitchedSince = -1
      this.lastPitchedHz = null
      return {
        hz: null,
        pitchT: 0,
        rms,
        isVoice: false,
        loudnessT: 0,
        timbreT,
        centroidHz,
        onset: false,
        durationMs: 0,
        panT,
        percussive: false,
        ...mix,
      }
    }

    const music = this.kind === 'display' || this.kind === 'media'
    const minHz = music ? MUSIC_MIN_HZ : VOCAL_MIN_HZ
    const maxHz = music ? MUSIC_MAX_HZ : VOCAL_MAX_HZ
    const pitched = detectPitchHz(this.buf, this.ctx.sampleRate, minHz, maxHz)
    const hz = pitched && pitched.hz >= minHz && pitched.hz <= maxHz ? pitched.hz : null
    const corr = pitched?.corr ?? 0
    const percussive = this.isPercussive({
      music,
      onset,
      corr,
      hasPitch: hz !== null,
      flatness,
      hfRatio,
    })

    if (hz !== null && !percussive) {
      if (
        this.pitchedSince < 0 ||
        this.lastPitchedHz === null ||
        isLargePitchJump(this.lastPitchedHz, hz)
      ) {
        this.pitchedSince = now
      }
      this.lastPitchedHz = hz
    } else if (hz === null && !percussive) {
      this.pitchedSince = -1
      this.lastPitchedHz = null
    }

    const durationMs =
      this.pitchedSince >= 0 ? (now - this.pitchedSince) * 1000 : 0

    const isVoice = hz !== null && !percussive
    const pitchT =
      hz === null ? 0 : pitchNorm(hz, music ? 'music' : 'speaker')
    return {
      hz,
      pitchT,
      rms,
      isVoice,
      loudnessT,
      timbreT,
      centroidHz,
      onset,
      durationMs: isVoice ? durationMs : 0,
      panT,
      percussive,
      ...mix,
    }
  }

  /** Linear-mag centroid + flux + noisiness; updates prevLin. */
  private spectrumFeatures(): {
    flux: number
    centroidHz: number | null
    flatness: number
    hfRatio: number
  } {
    const binHz = this.ctx.sampleRate / this.analyser.fftSize
    let num = 0
    let den = 0
    let flux = 0
    let hf = 0
    let logSum = 0
    let magCount = 0
    for (let i = 1; i < this.freqBuf.length; i++) {
      const db = this.freqBuf[i]!
      const mag = Number.isFinite(db) && db > -90 ? 10 ** (db / 20) : 0
      const hz = i * binHz
      num += hz * mag
      den += mag
      if (hz >= 2000) hf += mag
      if (mag > 1e-10) {
        logSum += Math.log(mag)
        magCount++
      }
      const diff = mag - this.prevLin[i]!
      if (diff > 0) flux += diff
      this.prevLin[i] = mag
    }
    const flatness =
      magCount > 4 && den > 1e-8 ? Math.exp(logSum / magCount) / (den / magCount) : 0
    return {
      flux,
      centroidHz: den < 1e-8 ? null : num / den,
      flatness,
      hfRatio: den < 1e-8 ? 0 : hf / den,
    }
  }

  private mixFields(): Pick<PitchSample, 'bpm' | 'spawnScale' | 'sectionEnergyT'> {
    return {
      bpm: this.bpmSmoothed,
      spawnScale: spawnScaleFromBpm(this.bpmSmoothed),
      sectionEnergyT: this.sectionEnergyT,
    }
  }

  private updateSectionEnergy(loudnessT: number, now: number): void {
    const dt = this.lastSampleAt >= 0 ? Math.min(0.08, Math.max(0.001, now - this.lastSampleAt)) : 0.016
    this.lastSampleAt = now
    const alpha = 1 - Math.exp(-dt / 1.45)
    this.sectionEnergyT += alpha * (loudnessT - this.sectionEnergyT)
  }

  private samplePan(): number {
    if (!this.stereo || !this.analyserL || !this.analyserR || !this.bufL || !this.bufR) {
      return 0.5
    }
    this.analyserL.getFloatTimeDomainData(this.bufL as Float32Array<ArrayBuffer>)
    this.analyserR.getFloatTimeDomainData(this.bufR as Float32Array<ArrayBuffer>)
    const l = rootMeanSquare(this.bufL)
    const r = rootMeanSquare(this.bufR)
    if (r > this.silenceThreshold * 0.12) this.rightAlive = true
    if (!this.rightAlive) return 0.5
    const sum = l + r
    if (sum < 1e-7) return 0.5
    return clamp01(0.5 + (0.5 * (r - l)) / sum)
  }

  private isPercussive(args: {
    music: boolean
    onset: boolean
    corr: number
    hasPitch: boolean
    flatness: number
    hfRatio: number
  }): boolean {
    const { music, onset, corr, hasPitch, flatness, hfRatio } = args
    // Strong harmonicity is a sung or instrumental pitch — never swallow it.
    if (corr >= 0.52) return false
    const broadband = flatness > 0.32 || hfRatio > 0.38
    const weakPitch = !hasPitch || corr < 0.46
    if (music) {
      if (weakPitch && broadband) return true
      if (onset && weakPitch && corr < 0.42) return true
      return false
    }
    // Speaker: only obvious bursts (clap / plosive-like), not hummed pitch.
    return onset && weakPitch && (flatness > 0.42 || hfRatio > 0.45) && corr < 0.4
  }

  private noteOnset(t: number): void {
    this.onsetTimes.push(t)
    if (this.onsetTimes.length > 12) this.onsetTimes.shift()
    if (this.onsetTimes.length < 4) return
    const iois: number[] = []
    for (let i = 1; i < this.onsetTimes.length; i++) {
      const d = this.onsetTimes[i]! - this.onsetTimes[i - 1]!
      if (d >= 0.18 && d <= 1.25) iois.push(d)
    }
    if (iois.length < 3) return
    iois.sort((a, b) => a - b)
    const median = iois[Math.floor(iois.length / 2)]!
    const bpm = foldBpm(60 / median)
    this.bpmSmoothed =
      this.bpmSmoothed === null ? bpm : this.bpmSmoothed * 0.8 + bpm * 0.2
  }

  private attachStereoTap(source: MediaStreamAudioSourceNode): void {
    this.teardownStereo()
    const splitter = this.ctx.createChannelSplitter(2)
    const analyserL = this.ctx.createAnalyser()
    const analyserR = this.ctx.createAnalyser()
    analyserL.fftSize = 1024
    analyserR.fftSize = 1024
    analyserL.smoothingTimeConstant = 0.2
    analyserR.smoothingTimeConstant = 0.2
    source.connect(splitter)
    splitter.connect(analyserL, 0)
    splitter.connect(analyserR, 1)
    this.splitter = splitter
    this.analyserL = analyserL
    this.analyserR = analyserR
    this.bufL = new Float32Array(analyserL.fftSize)
    this.bufR = new Float32Array(analyserR.fftSize)
    this.stereo = true
    this.rightAlive = false
  }

  private teardownStereo(): void {
    try {
      this.splitter?.disconnect()
    } catch {
      /* not connected */
    }
    this.splitter = null
    this.analyserL = null
    this.analyserR = null
    this.bufL = null
    this.bufR = null
    this.stereo = false
    this.rightAlive = false
  }

  private resetMixTracking(): void {
    this.pitchedSince = -1
    this.lastPitchedHz = null
    this.lastSampleAt = -1
    this.sectionEnergyT = 0
    this.onsetTimes = []
    this.bpmSmoothed = null
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
    this.teardownStereo()
    this.stopStreamTracks()
    this.externalSource?.disconnect()
    this.externalSource = null
    this.mediaSource?.disconnect()
    // Keep mediaSource + mediaElement for reuse; just disconnect from analyser
    this.setHearing(false)
    this.resetMixTracking()
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
): { hz: number; corr: number } | null {
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

  return { hz: sampleRate / refinedLag, corr: bestCorr }
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

/** Map Hz into 0–1 on a log2 (equal-temperament) scale for the listen mode’s window. */
export function pitchNorm(hz: number, mode: ListenMode = 'speaker'): number {
  if (mode === 'music') return logNorm(hz, MUSIC_MIN_HZ, MUSIC_MAX_HZ)
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

/** 120 BPM → 1 (220 ms cooldown). Faster → smaller; clamped so a noisy mix cannot flood. */
export function spawnScaleFromBpm(bpm: number | null): number {
  if (bpm === null || bpm <= 0) return 1
  const used = clampRange(bpm, 58, 188)
  return clampRange(120 / used, 105 / 220, 480 / 220)
}

function isLargePitchJump(prevHz: number, hz: number): boolean {
  return Math.abs(Math.log2(hz / prevHz)) > 3 / 12
}

function foldBpm(bpm: number): number {
  let n = bpm
  while (n > 188) n /= 2
  while (n < 58 && n > 0) n *= 2
  return n
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function clampRange(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
