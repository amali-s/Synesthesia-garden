import type { PitchDetector } from './pitch'

export type SongMeta = {
  title: string
  artist?: string
}

/**
 * MediaElement-based song playback wired into PitchDetector.
 */
export class SongPlayer {
  readonly audio: HTMLAudioElement
  private detector: PitchDetector
  private objectUrl: string | null = null
  private meta: SongMeta | null = null
  private attached = false

  constructor(detector: PitchDetector) {
    this.detector = detector
    this.audio = new Audio()
    this.audio.preload = 'auto'
  }

  get isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended && this.audio.currentTime > 0
  }

  get isActive(): boolean {
    return Boolean(this.audio.src) && this.attached
  }

  get currentMeta(): SongMeta | null {
    return this.meta
  }

  get currentTime(): number {
    return this.audio.currentTime
  }

  get duration(): number {
    const d = this.audio.duration
    return Number.isFinite(d) ? d : 0
  }

  get progress(): number {
    const d = this.duration
    return d > 0 ? this.audio.currentTime / d : 0
  }

  async loadFile(file: File): Promise<SongMeta> {
    this.revokeObjectUrl()
    this.objectUrl = URL.createObjectURL(file)
    this.audio.removeAttribute('crossorigin')
    const title = file.name.replace(/\.[^.]+$/, '')
    this.meta = { title }
    await this.loadSrc(this.objectUrl)
    return this.meta
  }

  async loadUrl(url: string, meta: SongMeta): Promise<SongMeta> {
    this.revokeObjectUrl()
    this.audio.crossOrigin = 'anonymous'
    this.meta = meta
    await this.loadSrc(url)
    return this.meta
  }

  async play(): Promise<void> {
    if (!this.attached) throw new Error('No song loaded')
    await this.detector.resume()
    await this.audio.play()
  }

  pause(): void {
    this.audio.pause()
  }

  stop(): void {
    this.audio.pause()
    this.audio.currentTime = 0
    this.detector.stop()
    this.attached = false
    this.revokeObjectUrl()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.meta = null
  }

  onEnded(handler: () => void): void {
    this.audio.onended = handler
  }

  private async loadSrc(src: string): Promise<void> {
    this.audio.pause()
    this.audio.src = src
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('Failed to load audio'))
      }
      const cleanup = () => {
        this.audio.removeEventListener('canplay', onReady)
        this.audio.removeEventListener('error', onError)
      }
      this.audio.addEventListener('canplay', onReady)
      this.audio.addEventListener('error', onError)
      this.audio.load()
    })
    await this.detector.attachMediaElement(this.audio, { toDestination: true })
    this.attached = true
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }
}
