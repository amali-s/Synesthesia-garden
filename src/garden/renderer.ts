import { PASTEL, skyForListenMs } from './palette'
import { drawFlower, drawGrass } from './sprites'
import { plantLife, type Garden } from './world'

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
    const sky = skyForListenMs(garden.listenMs)

    const skyGrad = ctx.createLinearGradient(0, 0, 0, soilY * scale)
    skyGrad.addColorStop(0, sky.top)
    skyGrad.addColorStop(1, sky.bottom)
    ctx.fillStyle = skyGrad
    ctx.fillRect(0, 0, logicalW * scale, soilY * scale)

    this.drawClouds(sway, sky.mist)

    ctx.fillStyle = PASTEL.soil
    ctx.fillRect(0, soilY * scale, logicalW * scale, (logicalH - soilY) * scale)

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

    for (let x = 0; x < logicalW; x++) {
      const h = 1 + ((x * 5) % 4)
      for (let i = 0; i < h; i++) {
        ctx.fillStyle = i === 0 ? PASTEL.grassDark : i === h - 1 ? PASTEL.grassLight : PASTEL.grass
        ctx.fillRect(x * scale, (soilY - 1 - i) * scale, scale, scale)
      }
    }

    const sorted = [...garden.plants].sort((a, b) => a.y - b.y)
    const onsetPulse =
      garden.lastOnset > 0 ? Math.max(0, 1 - (now - garden.lastOnset) / 200) : 0
    for (const plant of sorted) {
      const life = plantLife(plant, now)
      const age = (now - plant.born) / 1000
      if (plant.type === 'grass') {
        drawGrass(
          ctx,
          plant.x,
          plant.y,
          scale,
          plant.variant,
          sway + plant.variant,
          life.grow,
          life.wiltT,
        )
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
          life.restT,
          life.wiltT,
        )
      }
    }

    if (livePitchT !== null) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 120)
      const size = 2 + Math.round(pulse * 2)
      const cx = logicalW - 14
      const cy = 14
      ctx.fillStyle = `hsl(${(350 + livePitchT * 42) % 360} ${28 + livePitchT * 44}% ${68 - livePitchT * 14}%)`
      ctx.fillRect((cx - size) * scale, (cy - size) * scale, size * 2 * scale, size * 2 * scale)
    }
  }

  private drawClouds(sway: number, mist: string): void {
    const { ctx, scale, logicalW } = this
    const clouds = [
      { x: 22, y: 12, w: 32 },
      { x: 108, y: 18, w: 40 },
      { x: 198, y: 9, w: 28 },
      { x: 268, y: 16, w: 34 },
    ]
    ctx.fillStyle = mist
    for (const c of clouds) {
      const drift = Math.round(Math.sin(sway * 0.3 + c.x) * 4)
      const x0 = ((c.x + drift) % logicalW + logicalW) % logicalW
      for (let i = 0; i < c.w; i++) {
        const bump = i > 3 && i < c.w - 3 ? 1 + (i % 5 === 0 ? 1 : 0) : 0
        const x = (x0 + i) % logicalW
        ctx.fillRect(x * scale, (c.y - bump) * scale, scale, scale)
        ctx.fillRect(x * scale, c.y * scale, scale, scale)
        if (bump > 0) {
          ctx.fillRect(x * scale, (c.y + 1) * scale, scale, scale)
        }
      }
    }
  }
}
