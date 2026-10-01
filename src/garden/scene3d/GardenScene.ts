import {
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  Euler,
  Fog,
  FrontSide,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Sprite,
  SpriteMaterial,
  Texture,
  Vector2,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three'
import { pitchClassT } from '../../audio/pitch'
import { tintedBloomHeadCanvas } from '../bloomArt'
import { foxImage, mailboxImage } from '../critters'
import type { ForageView } from '../forage'
import { fireflyPaint } from '../firefly'
import { glowAmount, type ListenLight } from '../glow'
import {
  createOnsetGate,
  haloBrightness,
  onsetBrightness,
  onsetRipple,
  stepOnsetGate,
  swayAmplitude,
  swayPair,
} from '../motion'
import { bloomPaintRgb, DUSK, GROUND, hourGelForDusk, PASTEL } from '../palette'
import { FLOWER_KINDS, type FlowerKind } from '../sprites'
import { flowerGlow, plantLife, type FlowerPlant, type Garden } from '../world'
import {
  GRASS_COUNT,
  STEM_GEO_HEIGHT,
  createGrassBladeGeometry,
  createKindGeometry,
  createLeafGeometry,
  createStemGeometry,
  grassBladePose,
  kindHasFoliage,
} from './flowers'
import {
  CARRY_HEIGHT_M,
  FOX_HEIGHT_M,
  LIFT_HEIGHT_M,
  MAILBOX_HEIGHT_M,
  MAILBOX_WORLD,
  foxWorldPose,
} from './forage3d'
import { fireflyWorldPosition, plantToWorld, sunPoseForListenMs } from './layout'
import {
  LookControl,
  flowerFromInstance,
  pointerToNdc,
} from './look'

const POOL_START = 32

type InstancePool = {
  mesh: InstancedMesh
  extra: InstancedBufferAttribute | null
  cap: number
}

/**
 * Seated Among-them viewport: sky, gravel disc, stone seat, hour sun, pitch ring.
 * Construction may fail when WebGL is missing; callers should keep Courtyard.
 */
export class GardenScene {
  reducedMotion = false

  private readonly renderer: WebGLRenderer
  private readonly scene: Scene
  private readonly camera: PerspectiveCamera
  private readonly look: LookControl
  private readonly raycaster = new Raycaster()
  private readonly ndc = new Vector2()
  private prevNow = 0
  private stemAt: Array<FlowerPlant | undefined> = []
  private bloomAt: Record<FlowerKind, Array<FlowerPlant | undefined>> = emptyBloomAt()
  private leafAt: Record<FlowerKind, Array<FlowerPlant | undefined>> = emptyBloomAt()
  private readonly ground: Mesh
  private readonly groundMat: MeshStandardMaterial
  private readonly seat: Mesh
  private readonly seatMat: MeshStandardMaterial
  private readonly stemGeo: BufferGeometry
  private readonly stemMat: MeshStandardMaterial
  private readonly bloomGeos: BufferGeometry[]
  private readonly bloomMat: MeshStandardMaterial
  private readonly leafGeos: BufferGeometry[]
  private readonly grassGeo: BufferGeometry
  private readonly grassMat: MeshStandardMaterial
  private readonly hemi: HemisphereLight
  private readonly sun: DirectionalLight
  private readonly fog: Fog
  private readonly sky = new Color()
  private readonly hourColor = new Color()
  private readonly white = new Color(0xffffff)
  private readonly duskWash = new Color(DUSK.wash)
  private readonly duskHemi = new Color(DUSK.hemi)
  private readonly duskGround = new Color(DUSK.ground)
  private readonly duskSun = new Color(DUSK.sun)
  private readonly dayGround = new Color('#8faf7a')
  private readonly daySeat = new Color(GROUND.cream)
  private readonly fireflyTex: CanvasTexture
  private readonly fireflyMat: SpriteMaterial
  private readonly fireflySprite: Sprite
  private readonly fireflyLight: PointLight
  private readonly fireflyColor = new Color()
  private readonly dummy = new Object3D()
  private readonly euler = new Euler()
  private readonly baseMat = new Matrix4()
  private readonly worldMat = new Matrix4()
  private readonly paintColor = new Color()
  private readonly paintHsl = { h: 0, s: 0, l: 0 }
  private stems: InstancePool
  private readonly blooms: Record<FlowerKind, InstancePool>
  private readonly leaves: Record<FlowerKind, InstancePool>
  private grass: InstancePool
  private readonly mailboxSprite: Sprite
  private readonly foxSprite: Sprite
  private readonly liftSprite: Sprite
  private readonly carrySprites: Sprite[]
  private readonly pixelTextures = new Map<HTMLImageElement, Texture>()
  private readonly canvasTextures = new Map<HTMLCanvasElement, CanvasTexture>()
  /** Pitch-class glow from the latest render. Emissive also carries breath and the onset wave. */
  private resonance = new Map<FlowerPlant, number>()
  /** Allows an onset crest at most three times a second. */
  private onsetGate = createOnsetGate()

  private constructor(renderer: WebGLRenderer) {
    this.renderer = renderer
    this.renderer.autoClear = true
    this.scene = new Scene()
    this.camera = new PerspectiveCamera(60, 1, 0.1, 80)
    this.camera.position.set(0, 1.2, 0)
    this.camera.lookAt(0, 0.9, -4)
    this.look = new LookControl()
    this.look.attach(renderer.domElement)

    const turf = new Color('#8faf7a')
    this.groundMat = new MeshStandardMaterial({
      color: turf,
      roughness: 0.92,
      metalness: 0,
    })
    const ground = new Mesh(new CircleGeometry(18, 48), this.groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = false
    ground.raycast = noopRaycast
    this.ground = ground
    this.scene.add(ground)

    this.seatMat = new MeshStandardMaterial({
      color: GROUND.cream,
      roughness: 0.88,
      metalness: 0.02,
    })
    // Wide enough that the front of the stone reads in the seated frustum.
    const seat = new Mesh(new CylinderGeometry(1.85, 2.05, 0.16, 32), this.seatMat)
    seat.position.set(0, 0.08, 0)
    seat.raycast = noopRaycast
    this.seat = seat
    this.scene.add(seat)

    this.stemGeo = createStemGeometry()
    this.stemMat = new MeshStandardMaterial({
      roughness: 0.95,
      metalness: 0,
      vertexColors: true,
      flatShading: true,
    })
    this.stems = makePool(this.scene, this.stemGeo, this.stemMat, POOL_START, false)

    this.bloomMat = makeBloomMaterial()
    this.bloomGeos = []
    this.leafGeos = []
    const blooms = {} as Record<FlowerKind, InstancePool>
    const leaves = {} as Record<FlowerKind, InstancePool>
    for (const kind of FLOWER_KINDS) {
      const geo = createKindGeometry(kind)
      this.bloomGeos.push(geo)
      blooms[kind] = makePool(this.scene, geo, this.bloomMat, POOL_START, true)
      const leafGeo = createLeafGeometry(kind)
      this.leafGeos.push(leafGeo)
      leaves[kind] = makePool(this.scene, leafGeo, this.stemMat, POOL_START, false)
    }
    this.blooms = blooms
    this.leaves = leaves

    this.grassGeo = createGrassBladeGeometry()
    this.grassMat = new MeshStandardMaterial({
      color: PASTEL.grass,
      roughness: 0.95,
      metalness: 0,
      vertexColors: true,
      flatShading: true,
    })
    this.grass = makePool(this.scene, this.grassGeo, this.grassMat, GRASS_COUNT, false)
    this.grass.mesh.count = GRASS_COUNT
    this.grass.mesh.raycast = noopRaycast
    this.writeGrass(0, 0, true, 0)

    this.hemi = new HemisphereLight('#f2efe4', '#d2c4a0', 0.95)
    this.scene.add(this.hemi)

    this.sun = new DirectionalLight(0xffe8b0, 1.7)
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    this.sky.set('#d4ecdf')
    this.fog = new Fog(this.sky, 16, 38)
    this.scene.fog = this.fog
    this.scene.background = this.sky
    this.renderer.setClearColor(this.sky)

    this.mailboxSprite = makeBillboard()
    this.mailboxSprite.position.set(MAILBOX_WORLD.x, 0.02, MAILBOX_WORLD.z)
    this.scene.add(this.mailboxSprite)
    this.foxSprite = makeBillboard()
    this.foxSprite.visible = false
    this.scene.add(this.foxSprite)
    this.liftSprite = makeBillboard()
    this.liftSprite.visible = false
    this.scene.add(this.liftSprite)
    this.carrySprites = [0, 1, 2].map(() => {
      const s = makeBillboard()
      s.visible = false
      this.scene.add(s)
      return s
    })

    this.fireflyTex = makeFireflyTexture()
    this.fireflyMat = new SpriteMaterial({
      map: this.fireflyTex,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    })
    this.fireflySprite = new Sprite(this.fireflyMat)
    this.fireflySprite.scale.set(0.38, 0.38, 1)
    this.fireflySprite.center.set(0.5, 0.5)
    this.fireflySprite.visible = false
    this.fireflySprite.frustumCulled = false
    this.fireflySprite.renderOrder = 6
    this.fireflySprite.raycast = noopRaycast
    this.scene.add(this.fireflySprite)
    this.fireflyLight = new PointLight('#fff6c2', 0, 9, 2)
    this.fireflyLight.visible = false
    this.scene.add(this.fireflyLight)
  }

  static tryCreate(canvas: HTMLCanvasElement): GardenScene | null {
    try {
      const renderer = new WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: false,
      })
      return new GardenScene(renderer)
    } catch {
      return null
    }
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width))
    const h = Math.max(1, Math.floor(height))
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /**
   * Pitch-class glow from the last render, 0–1.
   * Emissive on the bloom also includes the loudness breath and the onset wave.
   */
  resonanceOf(plant: FlowerPlant): number {
    return this.resonance.get(plant) ?? 0
  }

  render(
    garden: Garden,
    now = 0,
    forage: ForageView | null = null,
    listen: ListenLight | null = null,
    duskT = 0,
    livePitchT: number | null = null,
  ): void {
    const dt = this.prevNow === 0 ? 0 : Math.max(0, (now - this.prevNow) / 1000)
    this.prevNow = now
    this.look.update(dt, this.reducedMotion)
    this.look.apply(this.camera)
    this.resonance.clear()
    stepOnsetGate(this.onsetGate, now, garden.lastOnset, this.reducedMotion)
    this.sync(garden, now, forage, listen)
    this.applyHour(garden.listenMs, duskT)
    this.placeFirefly(listen, livePitchT, now)
    this.renderer.render(this.scene, this.camera)
  }

  get isDragging(): boolean {
    return this.look.isDragging
  }

  /** Last/current gesture moved past the look threshold (survives pointerup). */
  get didLookDrag(): boolean {
    return this.look.didDrag
  }

  /**
   * Flower under a client point on `#garden-3d`, or null for air / grass / seat.
   * Blooms are tested before stems; wilted plants still in the pool may chime.
   */
  hitFlower(clientX: number, clientY: number): FlowerPlant | null {
    const ndc = pointerToNdc(clientX, clientY, this.renderer.domElement.getBoundingClientRect())
    if (!ndc) return null
    this.ndc.set(ndc.x, ndc.y)
    this.look.apply(this.camera)
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(this.ndc, this.camera)

    const bloomMeshes: InstancedMesh[] = []
    for (const kind of FLOWER_KINDS) {
      const mesh = this.blooms[kind].mesh
      if (mesh.count > 0) bloomMeshes.push(mesh)
    }
    if (bloomMeshes.length > 0) {
      const hits = this.raycaster.intersectObjects(bloomMeshes, false)
      for (const hit of hits) {
        const plant = this.plantFromHit(hit.object, hit.instanceId)
        if (plant) return plant
      }
    }

    const leafMeshes: InstancedMesh[] = []
    for (const kind of FLOWER_KINDS) {
      const mesh = this.leaves[kind].mesh
      if (mesh.count > 0) leafMeshes.push(mesh)
    }
    if (leafMeshes.length > 0) {
      const hits = this.raycaster.intersectObjects(leafMeshes, false)
      for (const hit of hits) {
        const plant = this.plantFromHit(hit.object, hit.instanceId)
        if (plant) return plant
      }
    }

    if (this.stems.mesh.count > 0) {
      const hits = this.raycaster.intersectObject(this.stems.mesh, false)
      for (const hit of hits) {
        const plant = this.plantFromHit(hit.object, hit.instanceId)
        if (plant) return plant
      }
    }
    return null
  }

  private plantFromHit(object: object, instanceId: number | undefined): FlowerPlant | null {
    return flowerFromInstance(
      object,
      instanceId,
      this.blooms,
      this.bloomAt,
      this.stems.mesh,
      this.stemAt,
      this.leaves,
      this.leafAt,
    )
  }

  dispose(): void {
    this.look.dispose()
    this.scene.remove(this.stems.mesh)
    this.stems.mesh.dispose()
    for (const kind of FLOWER_KINDS) {
      this.scene.remove(this.blooms[kind].mesh)
      this.blooms[kind].mesh.dispose()
      this.scene.remove(this.leaves[kind].mesh)
      this.leaves[kind].mesh.dispose()
    }
    this.scene.remove(this.grass.mesh)
    this.grass.mesh.dispose()
    this.ground.geometry.dispose()
    this.groundMat.dispose()
    this.seat.geometry.dispose()
    this.seatMat.dispose()
    this.stemGeo.dispose()
    this.stemMat.dispose()
    for (const geo of this.bloomGeos) geo.dispose()
    for (const geo of this.leafGeos) geo.dispose()
    this.bloomMat.dispose()
    this.grassGeo.dispose()
    this.grassMat.dispose()
    this.disposeBillboard(this.mailboxSprite)
    this.disposeBillboard(this.foxSprite)
    this.disposeBillboard(this.liftSprite)
    for (const s of this.carrySprites) this.disposeBillboard(s)
    this.scene.remove(this.fireflySprite)
    this.fireflyMat.dispose()
    this.fireflyTex.dispose()
    this.scene.remove(this.fireflyLight)
    this.fireflyLight.dispose()
    for (const tex of this.pixelTextures.values()) tex.dispose()
    this.pixelTextures.clear()
    for (const tex of this.canvasTextures.values()) tex.dispose()
    this.canvasTextures.clear()
    this.renderer.dispose()
  }

  private applyHour(listenMs: number, duskT: number): void {
    const night = Math.min(1, Math.max(0, duskT))
    const hour = hourGelForDusk(listenMs, night)
    this.sky.set('#d4ecdf')
    this.hourColor.set(hour.tint)
    this.sky.lerp(this.hourColor, hour.alpha * 0.65)
    // Fuller than the courtyard veil. A 0.58 mix of the day sky still reads as afternoon.
    this.sky.lerp(this.duskWash, night * 0.92)
    this.scene.background = this.sky
    this.renderer.setClearColor(this.sky)
    this.fog.color.copy(this.sky)

    this.groundMat.color.copy(this.dayGround)
    this.groundMat.color.lerp(this.duskGround, night * 0.78)
    this.seatMat.color.copy(this.daySeat)
    this.seatMat.color.lerp(this.duskGround, night * 0.55)

    const pose = sunPoseForListenMs(listenMs)
    this.sun.position.set(pose.x, pose.y, pose.z)
    this.sun.target.position.set(0, 0, 0)
    this.sun.color.copy(this.hourColor)
    this.sun.color.lerp(this.white, Math.min(0.55, pose.intensity * 0.35))
    this.sun.color.lerp(this.duskSun, night)
    const daySun = Math.max(1.45, pose.intensity * 1.25)
    this.sun.intensity = daySun + (0.16 - daySun) * night

    this.hemi.color.set('#f2efe4')
    this.hemi.color.lerp(this.hourColor, hour.alpha * 0.3)
    this.hemi.color.lerp(this.duskHemi, night)
    this.hemi.groundColor.set('#d2c4a0')
    this.hemi.groundColor.lerp(this.duskGround, night)
    this.hemi.intensity = 0.95 + (0.14 - 0.95) * night
  }

  /** Melody lamp on the pitch ring. Hidden when no live note is in the air. */
  private placeFirefly(
    listen: ListenLight | null,
    livePitchT: number | null,
    now: number,
  ): void {
    if (livePitchT === null) {
      this.fireflySprite.visible = false
      this.fireflyLight.visible = false
      this.fireflyLight.intensity = 0
      return
    }
    const pitchT = listen?.pitchT ?? livePitchT
    const panT = listen?.panT ?? 0.5
    const loudnessT = listen?.loudnessT ?? 0.35
    const hz = listen && listen.hz > 0 ? listen.hz : null
    const bob = this.reducedMotion ? 0 : Math.sin(now / 280) * 0.1
    const pose = fireflyWorldPosition(pitchT, panT, loudnessT, bob)
    this.fireflySprite.position.set(pose.x, pose.y, pose.z)
    this.fireflySprite.visible = true
    this.fireflyLight.position.set(pose.x, pose.y, pose.z)
    this.fireflyLight.visible = true
    this.fireflyLight.intensity = 1.4 + loudnessT * 2.2
    const paint = fireflyPaint(hz, pitchT)
    paintCss(this.fireflyColor, paint.core)
    this.fireflyMat.color.copy(this.fireflyColor)
    this.fireflyLight.color.copy(this.fireflyColor)
  }

  private sync(
    garden: Garden,
    now: number,
    forage: ForageView | null,
    listen: ListenLight | null,
  ): void {
    this.syncFlowers(garden, now, listen)
    this.writeGrass(now, this.onsetGate.spikedAt, this.reducedMotion, listen?.loudnessT ?? 0)
    this.syncForage(forage)
  }

  private syncForage(forage: ForageView | null): void {
    this.placeBillboard(
      this.mailboxSprite,
      mailboxImage(forage?.mailboxFlag ?? false),
      MAILBOX_HEIGHT_M,
      1,
    )
    this.mailboxSprite.position.set(MAILBOX_WORLD.x, 0.02, MAILBOX_WORLD.z)

    if (!forage) {
      this.foxSprite.visible = false
      this.liftSprite.visible = false
      for (const s of this.carrySprites) s.visible = false
      return
    }

    const pose = foxWorldPose(forage)
    const foxImg = foxImage(forage.pose, forage.frame)
    this.placeBillboard(this.foxSprite, foxImg, FOX_HEIGHT_M, pose.facing)
    this.foxSprite.position.set(pose.x, 0.02, pose.z)

    if (forage.lifting) {
      const head = tintedBloomHeadCanvas(
        forage.lifting.kind,
        forage.lifting.hz,
        forage.lifting.pitchT,
        forage.lifting.timbreT,
        0,
      )
      this.placeCanvasBillboard(this.liftSprite, head, LIFT_HEIGHT_M, pose.facing)
      const liftY = 0.28 + forage.ring.pickT * 0.5
      this.liftSprite.position.set(pose.x, liftY, pose.z)
    } else {
      this.liftSprite.visible = false
    }

    const carry = forage.bundle.slice(-3).filter((p) => p !== forage.lifting)
    for (let i = 0; i < this.carrySprites.length; i++) {
      const sprite = this.carrySprites[i]!
      const plant = carry[i]
      if (!plant) {
        sprite.visible = false
        continue
      }
      const head = tintedBloomHeadCanvas(plant.kind, plant.hz, plant.pitchT, plant.timbreT, 0)
      this.placeCanvasBillboard(sprite, head, CARRY_HEIGHT_M, pose.facing)
      const trail = 0.16 + i * 0.12
      sprite.position.set(
        pose.x - pose.facing * trail,
        0.34 + i * 0.05,
        pose.z + 0.04 * (i + 1),
      )
    }
  }

  private placeBillboard(
    sprite: Sprite,
    img: HTMLImageElement | null,
    heightM: number,
    facing: 1 | -1,
  ): void {
    if (!img || img.naturalWidth < 1) {
      sprite.visible = false
      return
    }
    const mat = sprite.material as SpriteMaterial
    mat.map = this.pixelTexture(img)
    mat.needsUpdate = true
    const aspect = img.naturalWidth / Math.max(1, img.naturalHeight)
    sprite.scale.set(facing * heightM * aspect, heightM, 1)
    sprite.visible = true
  }

  private placeCanvasBillboard(
    sprite: Sprite,
    canvas: HTMLCanvasElement | null,
    heightM: number,
    facing: 1 | -1,
  ): void {
    if (!canvas || canvas.width < 1) {
      sprite.visible = false
      return
    }
    const mat = sprite.material as SpriteMaterial
    mat.map = this.canvasTexture(canvas)
    mat.needsUpdate = true
    const aspect = canvas.width / Math.max(1, canvas.height)
    sprite.scale.set(facing * heightM * aspect, heightM, 1)
    sprite.visible = true
  }

  private pixelTexture(img: HTMLImageElement): Texture {
    const hit = this.pixelTextures.get(img)
    if (hit) return hit
    const tex = new Texture(img)
    tex.magFilter = NearestFilter
    tex.minFilter = NearestFilter
    tex.generateMipmaps = false
    tex.colorSpace = SRGBColorSpace
    tex.needsUpdate = true
    this.pixelTextures.set(img, tex)
    return tex
  }

  private canvasTexture(canvas: HTMLCanvasElement): CanvasTexture {
    const hit = this.canvasTextures.get(canvas)
    if (hit) return hit
    const tex = new CanvasTexture(canvas)
    tex.magFilter = NearestFilter
    tex.minFilter = NearestFilter
    tex.generateMipmaps = false
    tex.colorSpace = SRGBColorSpace
    tex.needsUpdate = true
    this.canvasTextures.set(canvas, tex)
    return tex
  }

  private disposeBillboard(sprite: Sprite): void {
    this.scene.remove(sprite)
    const mat = sprite.material as SpriteMaterial
    mat.dispose()
  }

  private syncFlowers(garden: Garden, now: number, listen: ListenLight | null): void {
    const flowers: FlowerPlant[] = []
    const byKind: Record<FlowerKind, number> = {
      daisy: 0,
      tulip: 0,
      bell: 0,
      rose: 0,
      star: 0,
      poppy: 0,
      orchid: 0,
    }
    for (const plant of garden.plants) {
      if (plant.type !== 'flower') continue
      flowers.push(plant)
      byKind[plant.kind]++
    }

    this.stems = ensurePool(this.scene, this.stems, flowers.length, false)
    for (const kind of FLOWER_KINDS) {
      this.blooms[kind] = ensurePool(this.scene, this.blooms[kind], byKind[kind], true)
      const leafN = kindHasFoliage(kind) ? byKind[kind] : 0
      this.leaves[kind] = ensurePool(this.scene, this.leaves[kind], leafN, false)
    }

    const reduce = this.reducedMotion
    const usedKind: Record<FlowerKind, number> = {
      daisy: 0,
      tulip: 0,
      bell: 0,
      rose: 0,
      star: 0,
      poppy: 0,
      orchid: 0,
    }
    const usedLeaf: Record<FlowerKind, number> = {
      daisy: 0,
      tulip: 0,
      bell: 0,
      rose: 0,
      star: 0,
      poppy: 0,
      orchid: 0,
    }
    let stemI = 0
    this.stemAt.length = 0
    for (const kind of FLOWER_KINDS) {
      this.bloomAt[kind].length = 0
      this.leafAt[kind].length = 0
    }

    for (const plant of flowers) {
      const pose = plantToWorld(plant)
      const life = plantLife(plant, now)
      const seedGrow = reduce ? 1 : life.phase === 'seed' ? life.grow : 1
      const wiltScale = life.phase === 'wilt' ? Math.max(0.12, 1 - life.wiltT * 0.55) : 1
      const plantScale = seedGrow * wiltScale
      const stemH = pose.stemHeight * (1 - life.restT * 0.12)
      const loudness = listen?.loudnessT ?? 0
      const across = yawAcross(pose.yaw)
      const ripple = onsetRipple(now, this.onsetGate.spikedAt, across)
      const sway = plantSway(now, pose.x, pose.z, plant.hz, loudness, reduce)
      const leanAmp = 0.07 + (reduce ? 0 : ripple) * 0.03
      const leanX = sway.lean * leanAmp
      const leanZ = sway.cross * leanAmp * 0.45
      const nod = 0.62 + life.restT * 0.2 + (plant.kind === 'bell' ? 0.22 : 0)
      const bloomScale = 1 + (reduce ? 0 : ripple) * 0.04

      this.dummy.position.set(pose.x, 0, pose.z)
      this.dummy.rotation.set(leanX, 0, leanZ)
      this.dummy.scale.set(plantScale, plantScale, plantScale)
      this.dummy.updateMatrix()
      this.baseMat.copy(this.dummy.matrix)

      this.dummy.position.set(0, stemH * 0.5, 0)
      this.dummy.quaternion.identity()
      this.dummy.scale.set(1, Math.max(0.04, stemH) / STEM_GEO_HEIGHT, 1)
      this.dummy.updateMatrix()
      this.worldMat.multiplyMatrices(this.baseMat, this.dummy.matrix)
      this.stems.mesh.setMatrixAt(stemI, this.worldMat)
      this.stemAt.push(plant)
      stemI++

      this.dummy.position.set(0, stemH, 0)
      this.euler.set(nod, -pose.yaw, 0, 'YXZ')
      this.dummy.quaternion.setFromEuler(this.euler)
      this.dummy.scale.set(bloomScale, bloomScale * (1 + (reduce ? 0 : ripple) * 0.01), bloomScale)
      this.dummy.updateMatrix()
      this.worldMat.multiplyMatrices(this.baseMat, this.dummy.matrix)

      const kindI = usedKind[plant.kind]
      const bloom = this.blooms[plant.kind]
      bloom.mesh.setMatrixAt(kindI, this.worldMat)

      const pcT = plant.hz > 0 ? pitchClassT(plant.hz) : 0
      const paint = bloomPaintRgb(pcT, plant.pitchT, plant.timbreT, life.wiltT)
      const singing = flowerGlow(plant, now).singing
      const pitchGlow = glowAmount(plant.hz, listen, plant.wiltStarted !== null)
      this.resonance.set(plant, pitchGlow)
      const onsetLight = onsetBrightness(this.onsetGate, ripple, now, reduce)
      const halo = haloBrightness(pitchGlow, now, loudness, onsetLight, reduce)
      const punch = 1.38 + singing * 0.18 * 1.15
      this.paintColor.setRGB(
        (paint.mid[0] / 255) * punch,
        (paint.mid[1] / 255) * punch,
        (paint.mid[2] / 255) * punch,
      )
      this.paintColor.getHSL(this.paintHsl)
      this.paintColor.setHSL(
        this.paintHsl.h,
        Math.min(0.86, Math.max(0.55, this.paintHsl.s * 1.2 + 0.28)),
        Math.min(0.55, Math.max(0.44, this.paintHsl.l * 0.82)),
      )
      bloom.mesh.setColorAt(kindI, this.paintColor)
      bloom.extra?.setXY(kindI, halo, jewelFromSound(plant.pitchT, plant.timbreT))
      this.bloomAt[plant.kind].push(plant)
      usedKind[plant.kind]++

      if (kindHasFoliage(plant.kind)) {
        this.dummy.position.set(0, stemH, 0)
        this.euler.set(0, -pose.yaw, 0, 'YXZ')
        this.dummy.quaternion.setFromEuler(this.euler)
        this.dummy.scale.set(1, 1, 1)
        this.dummy.updateMatrix()
        this.worldMat.multiplyMatrices(this.baseMat, this.dummy.matrix)
        const leafI = usedLeaf[plant.kind]
        const leaf = this.leaves[plant.kind]
        leaf.mesh.setMatrixAt(leafI, this.worldMat)
        this.leafAt[plant.kind].push(plant)
        usedLeaf[plant.kind]++
      }
    }

    this.stems.mesh.count = stemI
    this.stems.mesh.instanceMatrix.needsUpdate = true
    for (const kind of FLOWER_KINDS) {
      const pool = this.blooms[kind]
      pool.mesh.count = usedKind[kind]
      pool.mesh.instanceMatrix.needsUpdate = true
      if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true
      if (pool.extra) pool.extra.needsUpdate = true
      const leafPool = this.leaves[kind]
      leafPool.mesh.count = usedLeaf[kind]
      leafPool.mesh.instanceMatrix.needsUpdate = true
    }
  }

  private writeGrass(now: number, spikedAt: number, freeze: boolean, loudnessT: number): void {
    const mesh = this.grass.mesh
    for (let i = 0; i < GRASS_COUNT; i++) {
      const pose = grassBladePose(i)
      const yaw = Math.atan2(pose.x, -pose.z)
      const rustle = grassLean(now, spikedAt, yaw, i, loudnessT, freeze)
      this.dummy.position.set(pose.x, 0, pose.z)
      this.dummy.rotation.set(rustle, pose.yaw, rustle * 0.35)
      this.dummy.scale.set(pose.scale, pose.scale, pose.scale)
      this.dummy.updateMatrix()
      mesh.setMatrixAt(i, this.dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }
}

function noopRaycast(): void {}

function makeFireflyTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 7
  canvas.height = 7
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')
  ctx.clearRect(0, 0, 7, 7)
  ctx.fillStyle = '#fff6c2'
  const glow = [
    [3, 0],
    [2, 1],
    [3, 1],
    [4, 1],
    [1, 2],
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 2],
    [0, 3],
    [1, 3],
    [2, 3],
    [4, 3],
    [5, 3],
    [6, 3],
    [1, 4],
    [2, 4],
    [3, 4],
    [4, 4],
    [5, 4],
    [2, 5],
    [3, 5],
    [4, 5],
    [3, 6],
  ]
  for (const [x, y] of glow) ctx.fillRect(x, y, 1, 1)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(3, 3, 1, 1)
  const tex = new CanvasTexture(canvas)
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.colorSpace = SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function paintCss(color: Color, css: string): void {
  const rgb = css.match(/rgb\((\d+)[ ,]+(\d+)[ ,]+(\d+)/)
  if (rgb) {
    color.setRGB(Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255)
    return
  }
  color.set(css)
}

function makeBillboard(): Sprite {
  const mat = new SpriteMaterial({
    transparent: true,
    alphaTest: 0.15,
    depthTest: true,
    depthWrite: true,
    sizeAttenuation: true,
  })
  const sprite = new Sprite(mat)
  sprite.center.set(0.5, 0)
  sprite.frustumCulled = false
  sprite.renderOrder = 3
  sprite.raycast = noopRaycast
  return sprite
}

function emptyBloomAt(): Record<FlowerKind, Array<FlowerPlant | undefined>> {
  return {
    daisy: [],
    tulip: [],
    bell: [],
    rose: [],
    star: [],
    poppy: [],
    orchid: [],
  }
}

function makePool(
  scene: Scene,
  geometry: BufferGeometry,
  material: Material,
  cap: number,
  extras: boolean,
): InstancePool {
  const mesh = new InstancedMesh(geometry, material, cap)
  mesh.frustumCulled = false
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.raycast = InstancedMesh.prototype.raycast
  mesh.count = 0
  const extra = extras ? attachExtra(geometry, cap) : null
  scene.add(mesh)
  return { mesh, extra, cap }
}

function ensurePool(scene: Scene, pool: InstancePool, needed: number, extras: boolean): InstancePool {
  if (needed <= pool.cap) return pool
  let cap = pool.cap
  while (cap < needed) cap *= 2
  const geometry = pool.mesh.geometry
  const material = pool.mesh.material as Material
  scene.remove(pool.mesh)
  pool.mesh.dispose()
  return makePool(scene, geometry, material, cap, extras)
}

function attachExtra(geometry: BufferGeometry, cap: number): InstancedBufferAttribute {
  const extra = new InstancedBufferAttribute(new Float32Array(cap * 2), 2)
  extra.setUsage(DynamicDrawUsage)
  geometry.setAttribute('instanceExtra', extra)
  return extra
}

function makeBloomMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    roughness: 0.8,
    metalness: 0,
    vertexColors: true,
    flatShading: true,
    side: FrontSide,
  })
  mat.customProgramCacheKey = () => 'sg-bloom-pollen'
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 instanceExtra;
attribute float pollen;
varying vec2 vInstanceExtra;
varying float vPollen;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vInstanceExtra = instanceExtra;
vPollen = pollen;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vInstanceExtra;
varying float vPollen;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (vPollen > 0.01) {
  diffuseColor.rgb = vec3(1.2, 0.94, 0.14) * vPollen;
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vInstanceExtra.x;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor *= mix(1.0, 0.55, vInstanceExtra.y);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.1, vInstanceExtra.y);`,
      )
  }
  return mat
}

/** Same mix as 2D jewel vs soft — high pitch/timbre, lower roughness. */
function jewelFromSound(pitchT: number, timbreT: number): number {
  const t = Math.min(1, Math.max(0, 0.58 * pitchT + 0.42 * timbreT))
  return t * t * (3 - 2 * t)
}

function windPhase(x: number, z: number, hz: number): number {
  const n =
    Math.imul(Math.round(x * 40) | 0, 374761393) ^
    Math.imul(Math.round(z * 40) | 0, 668265263) ^
    Math.imul(Math.round(hz) | 0, 1274126177)
  return ((n >>> 0) % 6283) / 1000
}

function plantSway(
  now: number,
  x: number,
  z: number,
  hz: number,
  loudnessT: number,
  reducedMotion: boolean,
): { lean: number; cross: number } {
  return swayPair(now, windPhase(x, z, hz), loudnessT, reducedMotion)
}

function yawAcross(yaw: number): number {
  return ((yaw / (Math.PI * 2)) % 1 + 1) % 1
}

function grassLean(
  now: number,
  spikedAt: number,
  yaw: number,
  index: number,
  loudnessT: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return 0
  const pulse = onsetRipple(now, spikedAt, yawAcross(yaw))
  const idle = Math.sin(now / 1100 + index * 0.17) * 0.035 * swayAmplitude(loudnessT)
  return idle + pulse * 0.04
}
