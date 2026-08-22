import { GARDEN_BEDS, bedsBackToFront, type GardenBed } from './beds'
import { ACCENTS, GROUND } from './palette'
import { drawFlower, drawGrass } from './sprites'
import { plantLife, type Garden, type Plant } from './world'

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

  constructor(
    canvas: HTMLCanvasElement,
    logicalW: number,
    logicalH: number,
    opts: RendererOptions = { scale: 2 },
  ) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D unavailable')
    this.ctx = ctx
    this.scale = opts.scale
    this.logicalW = logicalW
    this.logicalH = logicalH
    this.resize()
  }

  getScale(): number {
    return this.scale
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
    const { ctx, scale, logicalW, logicalH } = this
    const sway = now / 700
    this.drawPath(logicalW, logicalH)

    const onsetPulse =
      garden.lastOnset > 0 ? Math.max(0, 1 - (now - garden.lastOnset) / 200) : 0

    for (const bed of bedsBackToFront()) {
      this.drawBed(bed)
      const inBed = garden.plants.filter((p) => p.bedId === bed.id)
      inBed.sort((a, b) => a.y - b.y)
      for (const plant of inBed) {
        this.drawPlant(plant, now, sway, onsetPulse)
      }
    }

    if (livePitchT !== null) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 120)
      const size = 2 + Math.round(pulse * 2)
      const bed = GARDEN_BEDS.find(
        (b) => livePitchT >= b.pitch0 && livePitchT < b.pitch1,
      )
      const cx = bed ? bed.x + bed.w - 10 : logicalW - 14
      const cy = bed ? bed.y + 10 : 14
      ctx.fillStyle = `hsl(${(350 + livePitchT * 42) % 360} ${28 + livePitchT * 44}% ${68 - livePitchT * 14}%)`
      ctx.fillRect((cx - size) * scale, (cy - size) * scale, size * 2 * scale, size * 2 * scale)
    }
  }

  private drawPlant(
    plant: Plant,
    now: number,
    sway: number,
    onsetPulse: number,
  ): void {
    const { ctx, scale } = this
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
        onsetPulse,
      )
      return
    }
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

  private fillPx(x: number, y: number, color: string): void {
    const { ctx, scale } = this
    ctx.fillStyle = color
    ctx.fillRect(x * scale, y * scale, scale, scale)
  }

  private fillRect(x: number, y: number, w: number, h: number, color: string): void {
    const { ctx, scale } = this
    ctx.fillStyle = color
    ctx.fillRect(x * scale, y * scale, w * scale, h * scale)
  }

  private drawPath(logicalW: number, logicalH: number): void {
    this.fillRect(0, 0, logicalW, logicalH, GROUND.gravel)
    for (let y = 0; y < logicalH; y++) {
      for (let x = 0; x < logicalW; x++) {
        const n = (x * 11 + y * 19) % 23
        if (n === 0) this.fillPx(x, y, GROUND.gravelDark)
        else if (n === 7) this.fillPx(x, y, GROUND.gravelLight)
        else if (n === 14) this.fillPx(x, y, GROUND.patina)
      }
    }
  }

  private drawBed(bed: GardenBed): void {
    const t = bed.timber
    const d = bed.depth
    const ox = bed.x
    const oy = bed.y
    const ow = bed.w
    const oh = bed.h

    this.fillRect(ox + 2, oy + 2, ow, oh, GROUND.timberShadow)

    this.fillRect(ox, oy, ow, oh, GROUND.timberDark)
    this.fillRect(ox + 1, oy + 1, ow - 2, oh - d - 1, GROUND.timber)
    this.fillRect(ox, oy, ow, 1, GROUND.timberLite)
    this.fillRect(ox, oy, 1, oh, GROUND.timberLite)
    this.fillRect(ox, oy + oh - d, ow, d, ACCENTS.planterLedge)

    this.fillRect(ox, oy, ow, 1, ACCENTS.planterStroke)
    this.fillRect(ox, oy, 1, oh, ACCENTS.planterStroke)
    this.fillRect(ox + ow - 1, oy, 1, oh, ACCENTS.planterStroke)
    this.fillRect(ox, oy + oh - 1, ow, 1, ACCENTS.planterStroke)
    this.fillRect(ox, oy + oh - d, ow, 1, ACCENTS.planterStroke)

    this.fillPx(ox + 2, oy + 2, GROUND.brass)
    this.fillPx(ox + ow - 3, oy + 2, GROUND.brass)
    this.fillPx(ox + 2, oy + oh - d - 2, GROUND.brass)
    this.fillPx(ox + ow - 3, oy + oh - d - 2, GROUND.brass)
    this.fillPx(ox + 3, oy + 2, ACCENTS.rivetStroke)
    this.fillPx(ox + ow - 2, oy + 2, ACCENTS.rivetStroke)
    this.fillPx(ox + 3, oy + oh - d - 2, ACCENTS.rivetStroke)
    this.fillPx(ox + ow - 2, oy + oh - d - 2, ACCENTS.rivetStroke)

    const sx = ox + t
    const sy = oy + t
    const sw = ow - t * 2
    const sh = oh - t - d
    this.fillRect(sx, sy, sw, sh, GROUND.bedSoil)
    for (let y = sy; y < sy + sh; y++) {
      for (let x = sx; x < sx + sw; x++) {
        const n = (x * 13 + y * 7) % 17
        if (n === 0) this.fillPx(x, y, GROUND.bedSoilDark)
        else if (n === 8) this.fillPx(x, y, GROUND.bedSoilLight)
      }
    }
    this.fillRect(sx, sy, sw, 1, ACCENTS.soilOutline)
    this.fillRect(sx, sy + sh - 1, sw, 1, ACCENTS.soilOutline)
    this.fillRect(sx, sy, 1, sh, ACCENTS.soilOutline)
    this.fillRect(sx + sw - 1, sy, 1, sh, ACCENTS.soilOutline)
  }
}
