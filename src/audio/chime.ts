/**
 * Short bell-like tone at a bloom’s stored pitch.
 * Mixes through the shared AudioContext destination — never through
 * the pitch analyser, so Listen / Stop cannot mute it.
 */
export class BloomChime {
  /** Phase 8 can flip this for prefers-reduced-motion / a mute control. */
  muted = false
  private readonly ctx: AudioContext

  constructor(ctx: AudioContext) {
    this.ctx = ctx
  }

  /** Resume the shared context (pointer / Listen gesture). */
  async unlock(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  play(hz: number, timbreT: number, loudnessT: number): void {
    if (this.muted) return
    const freq = clamp(hz, 40, 4200)
    const t = this.ctx.currentTime
    const bright = clamp(timbreT, 0, 1)
    const vol = 0.16 * (0.62 + 0.38 * clamp(loudnessT, 0, 1))
    // Low fundamentals are hard to hear on laptop speakers; a quieter octave
    // keeps the same note while making the pitch lock in.
    const octaveHelp = freq < 280 ? ((280 - freq) / 280) * 0.38 : 0.08

    const master = this.ctx.createGain()
    master.gain.setValueAtTime(vol, t)
    master.connect(this.ctx.destination)

    // Light high-pass so the strike isn’t a muddy thud.
    const air = this.ctx.createBiquadFilter()
    air.type = 'highpass'
    air.frequency.value = Math.min(freq * 0.55, 180)
    air.Q.value = 0.55
    air.connect(master)

    const partials: Array<{ ratio: number; gain: number; decay: number }> = [
      { ratio: 1, gain: 1, decay: 0.72 },
      { ratio: 2, gain: octaveHelp + bright * 0.18, decay: 0.38 },
      { ratio: 3, gain: 0.04 + bright * 0.16, decay: 0.18 },
      { ratio: 4, gain: bright * 0.08, decay: 0.12 },
    ]

    let longest = 0.2
    for (const p of partials) {
      const f = freq * p.ratio
      if (p.gain < 0.025 || f > 7800) continue
      longest = Math.max(longest, p.decay)
      const osc = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(p.gain, t + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, t + p.decay)
      osc.connect(g)
      g.connect(air)
      osc.start(t)
      osc.stop(t + p.decay + 0.04)
    }

    window.setTimeout(() => {
      try {
        air.disconnect()
        master.disconnect()
      } catch {
        /* already gone */
      }
    }, Math.ceil((longest + 0.08) * 1000))

    void this.unlock()
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
