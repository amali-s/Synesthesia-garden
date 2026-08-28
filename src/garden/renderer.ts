import {
  GARDEN_BEDS,
  bedsBackToFront,
  type GardenBed,
} from './beds'
import {
  drawCarriedBloom,
  drawFox,
  drawMailbox,
} from './critters'
import type { ForageView } from './forage'
import { ACCENTS, GROUND, hourShadowOffsetForListenMs, hourTintForListenMs } from './palette'
import { drawFlower, drawGrass } from './sprites'
import { plantLife, type Garden, type Plant } from './world'

export type RendererOptions = {
  /** Screen pixels per logical pixel */
  scale: number
}

const ONSET_RIPPLE_MS = 140
const ONSET_PULSE_MS = 200

export class GardenRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private bgCanvas: HTMLCanvasElement
  private bgCtx: CanvasRenderingContext2D
  private scale: number
  private logicalW: number
  private logicalH: number
  private bgDirty = true
  private bgShadowDx = NaN
  private bgShadowDy = NaN
  /** Freeze decorative sway / grow / onset pulse; lifecycle still advances. */
  reducedMotion = false

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
    this.bgCanvas = document.createElement('canvas')
    const bgCtx = this.bgCanvas.getContext('2d')
    if (!bgCtx) throw new Error('Canvas 2D unavailable')
    this.bgCtx = bgCtx
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
    this.bgDirty = true
  }

  draw(
    garden: Garden,
    now: number,
    livePitchT: number | null,
    forage: ForageView | null = null,
  ): void {
    const { ctx, scale, logicalW } = this
    this.ensureBackground(garden.listenMs)
    ctx.drawImage(this.bgCanvas, 0, 0)

    for (const bed of bedsBackToFront()) {
      for (const plant of garden.plantsInBed(bed.id)) {
        this.drawPlant(plant, now, garden.lastOnset)
      }
    }

    if (livePitchT !== null) {
      const pulse = this.reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(now / 120)
      const size = 2 + Math.round(pulse * 2)
      const bed = GARDEN_BEDS.find(
        (b) => livePitchT >= b.pitch0 && livePitchT < b.pitch1,
      )
      const cx = bed ? bed.x + bed.w - 10 : logicalW - 14
      const cy = bed ? bed.y + 10 : 14
      ctx.fillStyle = `hsl(${(350 + livePitchT * 42) % 360} ${28 + livePitchT * 44}% ${68 - livePitchT * 14}%)`
      ctx.fillRect((cx - size) * scale, (cy - size) * scale, size * 2 * scale, size * 2 * scale)
    }

    drawMailbox(ctx, scale, forage?.mailboxFlag ?? false)
    if (forage) this.drawForage(forage)
    this.drawHourGel(garden.listenMs)
  }

  private drawForage(forage: ForageView): void {
    const { ctx, scale } = this
    if (forage.lifting) {
      drawCarriedBloom(
        ctx,
        forage.lifting,
        forage.liftX,
        forage.liftY,
        scale,
        12,
      )
    }
    const carry = forage.bundle.slice(-3)
    for (let i = 0; i < carry.length; i++) {
      const plant = carry[i]!
      const ox = forage.foxX - forage.facing * (2 + i * 2)
      const oy = forage.foxY - 11 - i
      drawCarriedBloom(ctx, plant, ox, oy, scale, 8)
    }
    drawFox(
      ctx,
      forage.foxX,
      forage.foxY,
      scale,
      forage.facing,
      forage.pose,
      forage.frame,
    )
  }

  private ensureBackground(listenMs: number): void {
    const { dx, dy } = hourShadowOffsetForListenMs(listenMs)
    const w = this.logicalW * this.scale
    const h = this.logicalH * this.scale
    if (
      !this.bgDirty &&
      this.bgCanvas.width === w &&
      this.bgCanvas.height === h &&
      dx === this.bgShadowDx &&
      dy === this.bgShadowDy
    ) {
      return
    }
    this.rebuildBackground(dx, dy)
  }

  private rebuildBackground(dx: number, dy: number): void {
    const w = this.logicalW * this.scale
    const h = this.logicalH * this.scale
    if (this.bgCanvas.width !== w || this.bgCanvas.height !== h) {
      this.bgCanvas.width = w
      this.bgCanvas.height = h
    }
    this.bgCtx.imageSmoothingEnabled = false
    this.drawCourtyard(this.bgCtx)
    for (const bed of bedsBackToFront()) {
      this.drawBed(this.bgCtx, bed, dx, dy)
    }
    this.bgShadowDx = dx
    this.bgShadowDy = dy
    this.bgDirty = false
  }

  private drawPlant(plant: Plant, now: number, lastOnset: number): void {
    const { ctx, scale, logicalW } = this
    const life = plantLife(plant, now)
    const age = (now - plant.born) / 1000
    const variant = plant.type === 'grass' ? plant.variant : 0
    const reduce = this.reducedMotion
    const sway = reduce ? 0 : plantSway(now, plant.x, plant.y, variant)
    const onsetPulse = reduce ? 0 : onsetRipple(now, lastOnset, plant.x, logicalW)
    const grow = reduce ? 1 : life.grow
    if (plant.type === 'grass') {
      drawGrass(
        ctx,
        plant.x,
        plant.y,
        scale,
        plant.variant,
        sway,
        grow,
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
      sway,
      plant.loudnessT,
      plant.timbreT,
      onsetPulse,
      life.restT,
      life.wiltT,
      plant.baseHue,
      plant.hz,
      reduce,
    )
  }

  private fillPx(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
  ): void {
    const { scale } = this
    ctx.fillStyle = color
    ctx.fillRect(x * scale, y * scale, scale, scale)
  }

  private fillRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
  ): void {
    const { scale } = this
    ctx.fillStyle = color
    ctx.fillRect(x * scale, y * scale, w * scale, h * scale)
  }

  private drawCourtyard(ctx: CanvasRenderingContext2D): void {
    const { logicalW, logicalH } = this
    this.fillRect(ctx, 0, 0, logicalW, logicalH, GROUND.gravel)
    for (let y = 0; y < logicalH; y++) {
      for (let x = 0; x < logicalW; x++) {
        if (inTimber(x, y)) continue
        const n = (x * 11 + y * 19) % 23
        if (n === 0) this.fillPx(ctx, x, y, GROUND.gravelDark)
        else if (n === 7) this.fillPx(ctx, x, y, GROUND.gravelLight)
        else if (n === 14) this.fillPx(ctx, x, y, GROUND.patina)
      }
    }
  }

  private drawHourGel(listenMs: number): void {
    const { ctx, scale, logicalW, logicalH } = this
    const hour = hourTintForListenMs(listenMs)
    ctx.save()
    ctx.globalAlpha = hour.alpha
    ctx.fillStyle = hour.tint
    ctx.fillRect(0, 0, logicalW * scale, logicalH * scale)
    ctx.restore()
    ctx.imageSmoothingEnabled = false
  }

  private drawBed(
    ctx: CanvasRenderingContext2D,
    bed: GardenBed,
    dx: number,
    dy: number,
  ): void {
    const t = bed.timber
    const d = bed.depth
    const ox = bed.x
    const oy = bed.y
    const ow = bed.w
    const oh = bed.h

    this.fillRect(ctx, ox + dx, oy + dy, ow, oh, GROUND.timberShadow)

    this.fillRect(ctx, ox, oy, ow, oh, GROUND.timberDark)
    this.fillRect(ctx, ox + 1, oy + 1, ow - 2, oh - d - 1, GROUND.timber)
    this.fillRect(ctx, ox, oy, ow, 1, GROUND.timberLite)
    this.fillRect(ctx, ox, oy, 1, oh, GROUND.timberLite)
    this.fillRect(ctx, ox, oy + oh - d, ow, d, ACCENTS.planterLedge)

    this.fillRect(ctx, ox, oy, ow, 1, ACCENTS.planterStroke)
    this.fillRect(ctx, ox, oy, 1, oh, ACCENTS.planterStroke)
    this.fillRect(ctx, ox + ow - 1, oy, 1, oh, ACCENTS.planterStroke)
    this.fillRect(ctx, ox, oy + oh - 1, ow, 1, ACCENTS.planterStroke)
    this.fillRect(ctx, ox, oy + oh - d, ow, 1, ACCENTS.planterStroke)

    this.fillPx(ctx, ox + 2, oy + 2, GROUND.brass)
    this.fillPx(ctx, ox + ow - 3, oy + 2, GROUND.brass)
    this.fillPx(ctx, ox + 2, oy + oh - d - 2, GROUND.brass)
    this.fillPx(ctx, ox + ow - 3, oy + oh - d - 2, GROUND.brass)
    this.fillPx(ctx, ox + 3, oy + 2, ACCENTS.rivetStroke)
    this.fillPx(ctx, ox + ow - 2, oy + 2, ACCENTS.rivetStroke)
    this.fillPx(ctx, ox + 3, oy + oh - d - 2, ACCENTS.rivetStroke)
    this.fillPx(ctx, ox + ow - 2, oy + oh - d - 2, ACCENTS.rivetStroke)

    const sx = ox + t
    const sy = oy + t
    const sw = ow - t * 2
    const sh = oh - t - d
    this.fillRect(ctx, sx, sy, sw, sh, GROUND.bedSoil)
    for (let y = sy; y < sy + sh; y++) {
      for (let x = sx; x < sx + sw; x++) {
        const n = (x * 13 + y * 7) % 17
        if (n === 0) this.fillPx(ctx, x, y, GROUND.bedSoilDark)
        else if (n === 8) this.fillPx(ctx, x, y, GROUND.bedSoilLight)
      }
    }
    this.fillRect(ctx, sx, sy, sw, 1, ACCENTS.soilOutline)
    this.fillRect(ctx, sx, sy + sh - 1, sw, 1, ACCENTS.soilOutline)
    this.fillRect(ctx, sx, sy, 1, sh, ACCENTS.soilOutline)
    this.fillRect(ctx, sx + sw - 1, sy, 1, sh, ACCENTS.soilOutline)
  }
}

function inTimber(x: number, y: number): boolean {
  for (const bed of GARDEN_BEDS) {
    if (x >= bed.x && x < bed.x + bed.w && y >= bed.y && y < bed.y + bed.h) return true
  }
  return false
}

function windPhase(x: number, y: number, variant: number): number {
  const n =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(variant | 0, 1274126177)
  return ((n >>> 0) % 6283) / 1000
}

function plantSway(now: number, x: number, y: number, variant: number): number {
  const phase = windPhase(x, y, variant)
  const breeze = now / 980 + phase
  const gust = Math.sin(now / 340 + phase * 1.7) * 0.35
  return breeze + gust
}

function onsetRipple(now: number, lastOnset: number, x: number, logicalW: number): number {
  if (lastOnset <= 0) return 0
  const delay = (x / Math.max(1, logicalW)) * ONSET_RIPPLE_MS
  const local = now - lastOnset - delay
  if (local < 0) return 0
  return Math.max(0, 1 - local / ONSET_PULSE_MS)
}
