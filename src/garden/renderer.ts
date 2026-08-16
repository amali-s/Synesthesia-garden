import { PASTEL } from './palette'
import { drawFlower, drawGrass } from './sprites'
import type { Garden } from './world'

export type RendererOptions = {
  /** Screen pixels per logical pixel */
  scale: number
}

export class GardenRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private scale: number
  private logicalW: number
  private logicalH: number
  private soilY: number

  constructor(
    canvas: HTMLCanvasElement,
    logicalW: number,
    logicalH: number,
    soilY: number,
    opts: RendererOptions = { scale: 2 },
  ) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D unavailable')
    this.ctx = ctx
    this.scale = opts.scale
    this.logicalW = logicalW
    this.logicalH = logicalH
    this.soilY = soilY
    this.resize()
  }

  setScale(scale: number): void {
    this.scale = scale
    this.resize()
  }

  resize(): void {
    this.canvas.width = this.logicalW * this.scale
    this.canvas.height = this.logicalH * this.scale
    this.ctx.imageSmoothingEnabled = false
  }

  draw(garden: Garden, now: number, livePitchT: number | null): void {
    const { ctx, scale, logicalW, logicalH, soilY } = this
    const sway = now / 700

    // Sky gradient (soft pastel)
    const sky = ctx.createLinearGradient(0, 0, 0, soilY * scale)
    sky.addColorStop(0, PASTEL.skyTop)
    sky.addColorStop(1, PASTEL.skyBottom)
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, logicalW * scale, soilY * scale)

    // Soft mist clouds (blocky)
    this.drawClouds(sway)

    // Soil
    ctx.fillStyle = PASTEL.soil
    ctx.fillRect(0, soilY * scale, logicalW * scale, (logicalH - soilY) * scale)

    // Soil texture — finer speckles on denser grid
    for (let y = soilY; y < logicalH; y++) {
      for (let x = 0; x < logicalW; x++) {
        const n = (x * 13 + y * 7) % 17
        if (n === 0) {
          ctx.fillStyle = PASTEL.soilDark
          ctx.fillRect(x * scale, y * scale, scale, scale)
        } else if (n === 8) {
          ctx.fillStyle = PASTEL.soilLight
          ctx.fillRect(x * scale, y * scale, scale, scale)
        }
      }
    }

    // Horizon grass fringe
    for (let x = 0; x < logicalW; x++) {
      const h = 1 + ((x * 5) % 4)
      for (let i = 0; i < h; i++) {
        ctx.fillStyle = i === 0 ? PASTEL.grassDark : i === h - 1 ? PASTEL.grassLight : PASTEL.grass
        ctx.fillRect(x * scale, (soilY - 1 - i) * scale, scale, scale)
      }
    }

    // Plants back-to-front by y
    const sorted = [...garden.plants].sort((a, b) => a.y - b.y)
    const onsetPulse =
      garden.lastOnset > 0
        ? Math.max(0, 1 - (now - garden.lastOnset) / 200)
        : 0
    for (const plant of sorted) {
      const age = (now - plant.born) / 1000
      if (plant.type === 'grass') {
        drawGrass(ctx, plant.x, plant.y, scale, plant.variant, sway + plant.variant)
      } else {
        drawFlower(
          ctx,
          plant.x,
          plant.y,
          scale,
          plant.kind,
          plant.pitchT,
          age,
          sway + plant.x * 0.1,
          plant.loudnessT,
          plant.timbreT,
          onsetPulse,
        )
      }
    }

    // Live pitch bloom preview
    if (livePitchT !== null) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 120)
      const size = 2 + Math.round(pulse * 2)
      const cx = logicalW - 14
      const cy = 14
      ctx.fillStyle = `hsl(${(350 + livePitchT * 42) % 360} ${28 + livePitchT * 44}% ${68 - livePitchT * 14}%)`
      ctx.fillRect((cx - size) * scale, (cy - size) * scale, size * 2 * scale, size * 2 * scale)
    }
  }

  private drawClouds(sway: number): void {
    const { ctx, scale } = this
    const clouds = [
      { x: 18, y: 10, w: 28 },
      { x: 90, y: 16, w: 36 },
      { x: 170, y: 8, w: 24 },
    ]
    ctx.fillStyle = PASTEL.mist
    for (const c of clouds) {
      const drift = Math.round(Math.sin(sway * 0.3 + c.x) * 3)
      for (let i = 0; i < c.w; i++) {
        const bump = i > 3 && i < c.w - 3 ? 1 + (i % 5 === 0 ? 1 : 0) : 0
        ctx.fillRect((c.x + i + drift) * scale, (c.y - bump) * scale, scale, scale)
        ctx.fillRect((c.x + i + drift) * scale, c.y * scale, scale, scale)
        if (bump > 0) {
          ctx.fillRect((c.x + i + drift) * scale, (c.y + 1) * scale, scale, scale)
        }
      }
    }
  }
}
