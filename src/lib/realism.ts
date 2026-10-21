// חומרים ריאליסטיים לרמת הגימור "מפורט": טקסטורות ברזולוציה גבוהה, מפות בליטה (normal) וחספוס (roughness)
// שנגזרות מהטקסטורה עצמה, וטקסטורות לטיח, רעפים, קליפת עץ, עלווה ואדמה.
import * as THREE from 'three'
import type { SurfaceMaterial } from './garden'
import { MATERIALS } from './garden'
import { shade, textureCanvas } from './textures'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// מפת בליטה מבהירות התמונה (Sobel): חריצים כהים נראים שקועים
export function normalFromCanvas(src: HTMLCanvasElement, strength = 2.2): HTMLCanvasElement {
  const w = src.width
  const h = src.height
  const sd = src.getContext('2d')!.getImageData(0, 0, w, h).data
  const lum = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) lum[i] = (sd[i * 4] * 0.3 + sd[i * 4 + 1] * 0.59 + sd[i * 4 + 2] * 0.11) / 255
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const L = (x: number, y: number) => lum[((y + h) % h) * w + ((x + w) % w)]
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1)) * strength
      const dy = (L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1)) * strength
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1)
      const i = (y * w + x) * 4
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255
      img.data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255
      img.data[i + 2] = (inv * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  ctx.putImageData(img, 0, 0)
  return out
}

// מפת חספוס: אזורים כהים (חריצים, לכלוך) מחוספסים יותר
function roughFromCanvas(src: HTMLCanvasElement, base: number, spread: number): HTMLCanvasElement {
  const w = src.width
  const h = src.height
  const sd = src.getContext('2d')!.getImageData(0, 0, w, h).data
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    const l = (sd[i * 4] * 0.3 + sd[i * 4 + 1] * 0.59 + sd[i * 4 + 2] * 0.11) / 255
    const v = Math.max(0, Math.min(1, base + (0.5 - l) * spread)) * 255
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return out
}

export interface PBRSet {
  map: THREE.Texture
  normalMap: THREE.Texture
  roughnessMap: THREE.Texture
  roughness: number
  metalness: number
  normalScale: number
}

const cache = new Map<string, PBRSet>()

function tex(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

const PBR_PARAMS: Record<SurfaceMaterial, { r: number; spread: number; n: number; metal?: number }> = {
  paving: { r: 0.82, spread: 0.6, n: 1.2 },
  tiles: { r: 0.45, spread: 0.8, n: 0.9 },
  stone: { r: 0.78, spread: 0.5, n: 1.4 },
  concrete: { r: 0.7, spread: 0.3, n: 0.5 },
  deck: { r: 0.62, spread: 0.5, n: 1.0 },
  gravel: { r: 0.95, spread: 0.2, n: 2.2 },
  pebbles: { r: 0.55, spread: 0.6, n: 2.4 },
  lawn: { r: 0.92, spread: 0.2, n: 1.6 },
  turf: { r: 0.7, spread: 0.2, n: 1.2 },
  bed: { r: 1, spread: 0.1, n: 2 },
  mulch: { r: 1, spread: 0.1, n: 2 },
  sand: { r: 0.95, spread: 0.1, n: 1.2 },
  water: { r: 0.04, spread: 0.02, n: 0.6, metal: 0.05 },
}

// חבילת טקסטורות לחומר משטח, משותפת לכל המשטחים מאותו חומר וצבע (העתק לכל חזרה)
export function surfacePBR(material: SurfaceMaterial, color: string | undefined): PBRSet {
  const key = `${material}:${color ?? ''}`
  let set = cache.get(key)
  if (!set) {
    const c = textureCanvas(material, color, 512)
    const p = PBR_PARAMS[material]
    set = {
      map: tex(c, true),
      normalMap: tex(normalFromCanvas(c, p.n * 2), false),
      roughnessMap: tex(roughFromCanvas(c, p.r, p.spread), false),
      roughness: 1,
      metalness: p.metal ?? 0,
      normalScale: p.n,
    }
    cache.set(key, set)
  }
  return set
}

// עותק עם חזרה משלו (לא משנה את המטמון המשותף)
export function withRepeat(set: PBRSet, rx: number, ry: number): PBRSet {
  const cl = (t: THREE.Texture) => {
    const n = t.clone()
    n.repeat.set(rx, ry)
    n.needsUpdate = true
    return n
  }
  return { ...set, map: cl(set.map), normalMap: cl(set.normalMap), roughnessMap: cl(set.roughnessMap) }
}

export function tileOf(material: SurfaceMaterial) {
  return MATERIALS[material].tile
}

// ---------- טקסטורות לבית ולצמחייה ----------

function canvas(size: number, draw: (g: CanvasRenderingContext2D, S: number, r: () => number) => void, seed = 7) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!, size, rng(seed))
  return c
}

const special = new Map<string, PBRSet>()
function specialSet(key: string, make: () => HTMLCanvasElement, rough: number, spread: number, n: number): PBRSet {
  let s = special.get(key)
  if (!s) {
    const c = make()
    s = { map: tex(c, true), normalMap: tex(normalFromCanvas(c, n * 2), false), roughnessMap: tex(roughFromCanvas(c, rough, spread), false), roughness: 1, metalness: 0, normalScale: n }
    special.set(key, s)
  }
  return s
}

// טיח חוץ בהיר עם גרגר עדין
export const plasterPBR = (base = '#ece6da') =>
  specialSet(
    `plaster:${base}`,
    () =>
      canvas(512, (g, S, r) => {
        g.fillStyle = base
        g.fillRect(0, 0, S, S)
        for (let i = 0; i < 9000; i++) {
          g.fillStyle = r() > 0.5 ? shade(base, -0.06 - r() * 0.05) : shade(base, 0.05 + r() * 0.05)
          const s = 1 + r() * 2.5
          g.fillRect(r() * S, r() * S, s, s)
        }
        g.globalAlpha = 0.06
        for (let i = 0; i < 14; i++) {
          g.fillStyle = shade(base, -0.25)
          g.beginPath()
          g.ellipse(r() * S, r() * S, 30 + r() * 90, 10 + r() * 40, r() * 3, 0, Math.PI * 2)
          g.fill()
        }
        g.globalAlpha = 1
      }, 11),
    0.88,
    0.3,
    0.8,
  )

// קיר אבן לקירות פיתוח
export const stoneWallPBR = () => surfacePBR('stone', '#cdbf9f')

// רעפי חימר
export const roofTilePBR = () =>
  specialSet(
    'roof',
    () =>
      canvas(512, (g, S, r) => {
        const base = '#a5543a'
        g.fillStyle = base
        g.fillRect(0, 0, S, S)
        const rows = 8
        const cols = 6
        const h = S / rows
        const w = S / cols
        for (let y = 0; y < rows; y++)
          for (let x = -1; x <= cols; x++) {
            const ox = (y % 2) * (w / 2)
            const grd = g.createLinearGradient(0, y * h, 0, (y + 1) * h)
            const dv = (r() - 0.5) * 0.25
            grd.addColorStop(0, shade(base, 0.12 + dv))
            grd.addColorStop(0.75, shade(base, dv))
            grd.addColorStop(1, shade(base, -0.45))
            g.fillStyle = grd
            g.beginPath()
            g.roundRect(x * w + ox + 2, y * h + 1, w - 4, h - 2, [0, 0, w / 2.4, w / 2.4])
            g.fill()
          }
      }, 3),
    0.7,
    0.4,
    1.6,
  )

// קליפת עץ
export const barkPBR = () =>
  specialSet(
    'bark',
    () =>
      canvas(256, (g, S, r) => {
        g.fillStyle = '#6b513a'
        g.fillRect(0, 0, S, S)
        for (let i = 0; i < 160; i++) {
          g.strokeStyle = r() > 0.5 ? '#4a3626' : '#82674c'
          g.lineWidth = 1 + r() * 3
          const x = r() * S
          g.beginPath()
          g.moveTo(x, 0)
          g.bezierCurveTo(x + (r() - 0.5) * 20, S / 3, x + (r() - 0.5) * 20, (2 * S) / 3, x + (r() - 0.5) * 10, S)
          g.stroke()
        }
      }, 5),
    0.95,
    0.2,
    2,
  )

// עלווה: כתמי עלים בגוונים
export const leafPBR = (base: string) =>
  specialSet(
    `leaf:${base}`,
    () =>
      canvas(256, (g, S, r) => {
        g.fillStyle = shade(base, -0.25)
        g.fillRect(0, 0, S, S)
        for (let i = 0; i < 1600; i++) {
          g.fillStyle = shade(base, (r() - 0.45) * 0.55)
          g.beginPath()
          g.ellipse(r() * S, r() * S, 2 + r() * 5, 1.2 + r() * 2.5, r() * Math.PI, 0, Math.PI * 2)
          g.fill()
        }
      }, 9),
    0.85,
    0.3,
    2.4,
  )

// קרקע טבעית סביב המגרש: אדמה, חצץ ועשבים יבשים
export const soilPBR = () =>
  specialSet(
    'soil',
    () =>
      canvas(512, (g, S, r) => {
        g.fillStyle = '#b9ad8f'
        g.fillRect(0, 0, S, S)
        for (let i = 0; i < 7000; i++) {
          const t = r()
          g.fillStyle = t < 0.4 ? '#a39778' : t < 0.7 ? '#cbbf9f' : t < 0.85 ? '#8f9a6a' : '#9e8c6b'
          const s = 1 + r() * 3
          g.fillRect(r() * S, r() * S, s, s)
        }
        g.globalAlpha = 0.18
        for (let i = 0; i < 40; i++) {
          g.fillStyle = r() > 0.5 ? '#7f8d58' : '#a2967a'
          g.beginPath()
          g.ellipse(r() * S, r() * S, 20 + r() * 60, 10 + r() * 30, r() * 3, 0, Math.PI * 2)
          g.fill()
        }
        g.globalAlpha = 1
      }, 21),
    0.97,
    0.1,
    1.4,
  )

// עץ לדלתות
export const woodPBR = () => surfacePBR('deck', '#7a5636')
