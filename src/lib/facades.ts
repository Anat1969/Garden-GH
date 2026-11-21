import type { Building, Facade, FacadeSide, Project, Pt } from './types'
import { deleteDocBlob, saveDocBlob } from './idb'
import { getState, uid, updateProject } from './store'
import { planDir } from './sun'
import { unitFootprints } from './structureToElements'

// חזיתות ההיתר על הבית, בשיטת פרויקט התאנה: חזית היא היטל ישר, ולכן מלבישים אותה על הקירות בהיטל ישר מאותו כיוון.
// כל נקודה בקיר מקבלת את מה שמצויר מולה בשרטוט. השרטוט עצמו נשמר במכשיר בלבד.

export const SIDE_TEXT: Record<FacadeSide, string> = { N: 'צפונית', S: 'דרומית', E: 'מזרחית', W: 'מערבית' }
const SIDE_AZ: Record<FacadeSide, number> = { N: 0, E: 90, S: 180, W: 270 }
export const SIDES: FacadeSide[] = ['N', 'E', 'S', 'W']

// הצד לפי כותרת השרטוט ("חזית דרומית", "South elevation")
export function sideFromTitle(title: string): FacadeSide | null {
  const t = title.toLowerCase()
  if (/צפו|north/.test(t)) return 'N'
  if (/דרו|south/.test(t)) return 'S'
  if (/מזר|east/.test(t)) return 'E'
  if (/מער|west/.test(t)) return 'W'
  return null
}

// גובה הבניין שהחזית מראה: רכס, ואם אין, תחילת הגג או מספר הקומות
export function buildingTop(b: Building | undefined): number {
  if (!b) return 3
  const eave = b.eaveRel && b.eaveRel > b.groundHeight + 0.3 ? b.eaveRel : b.groundHeight * Math.max(1, b.storeys)
  return b.ridgeRel && b.ridgeRel > eave + 0.2 ? b.ridgeRel : eave
}

// גובה הקירות שעליהם מולבשת החזית (בלי הגג)
export function wallTop(b: Building | undefined): number {
  if (!b) return 3
  return b.eaveRel && b.eaveRel > b.groundHeight + 0.3 ? b.eaveRel : b.groundHeight * Math.max(1, b.storeys)
}

// כיוון החזית בתוכנית (x ימינה, y למטה): n פונה החוצה מהקיר, r הוא ימין הצופה שמסתכל על החזית
export function sideAxes(side: FacadeSide, north: number) {
  const n = planDir(SIDE_AZ[side], north)
  return { n, r: { x: n.y, y: -n.x } }
}

// רוחב הבית כפי שהוא נראה מהצד הזה, במטרים
export function sideWidth(footprints: Pt[][], side: FacadeSide, north: number): number {
  const { r } = sideAxes(side, north)
  const s = footprints.flat().map((p) => p.x * r.x + p.y * r.y)
  return s.length ? Math.max(...s) - Math.min(...s) : 0
}

export interface Placement {
  x0: number
  x1: number
  yGround: number
  yTop: number
  how: string
}

// מיקום הבניין בתוך שרטוט החזית, מתוך התמונה עצמה:
// קו הקרקע הוא הקו האופקי הארוך ביותר, קירות הבית הם הקווים האנכיים הגבוהים שמעליו, והראש הוא השורה העליונה שיש בה דיו בין הקירות.
// כשקנה המידה ומידות הבית ידועים, הרוחב והגובה נקבעים מהם, והתמונה קובעת רק את המיקום.
export function placeInImage(data: Uint8ClampedArray, w: number, h: number, known?: { pxPerM: number; widthM: number; heightM: number }): Placement {
  const dark = new Uint8Array(w * h)
  for (let i = 0, j = 0; i < w * h; i++, j += 4) dark[i] = data[j] * 0.3 + data[j + 1] * 0.59 + data[j + 2] * 0.11 < 150 && data[j + 3] > 40 ? 1 : 0
  const rows = new Float64Array(h)
  for (let y = 0; y < h; y++) {
    let c = 0
    for (let x = 0; x < w; x++) c += dark[y * w + x]
    rows[y] = c
  }
  // קו הקרקע: השורה הכהה ביותר במחצית התחתונה. אם אין קו ברור, תחתית הדיו.
  let g = -1
  let best = 0
  for (let y = Math.floor(h * 0.35); y < h; y++) if (rows[y] > best) (best = rows[y]), (g = y)
  let inkTop = 0
  while (inkTop < h && rows[inkTop] < 2) inkTop++
  if (g < 0 || best < w * 0.2) {
    g = h - 1
    while (g > 0 && rows[g] < 2) g--
  }
  const span = Math.max(4, g - inkTop)
  const cols = new Float64Array(w)
  for (let x = 0; x < w; x++) {
    let c = 0
    for (let y = inkTop; y < g; y++) c += dark[y * w + x]
    cols[x] = c
  }
  // קירות: עמודות שהדיו בהן גבוה. כיתוב וסימוני מפלס בצדדים נמוכים מדי כדי לעבור את הסף.
  const peak = Math.max(...cols)
  const thr = Math.max(span * 0.18, peak * 0.4)
  let x0 = 0
  let x1 = w - 1
  while (x0 < w - 1 && cols[x0] < thr) x0++
  while (x1 > x0 && cols[x1] < thr) x1--
  let how = 'לפי קו הקרקע וקווי הקירות בשרטוט'
  if (x1 - x0 < w * 0.08) {
    x0 = Math.round(w * 0.1)
    x1 = Math.round(w * 0.9)
    how = 'לא נמצאו קווי קירות ברורים, מוקם במרכז השרטוט'
  }
  let top = inkTop
  for (let y = inkTop; y < g; y++) {
    let c = 0
    for (let x = x0; x <= x1; x++) c += dark[y * w + x]
    if (c >= Math.max(2, (x1 - x0) * 0.012)) {
      top = y
      break
    }
  }
  if (known && known.pxPerM > 0 && known.widthM > 0) {
    const wp = known.widthM * known.pxPerM
    const hp = known.heightM * known.pxPerM
    // מקבלים את מידות קנה המידה רק כשהן קרובות למה שנמצא בתמונה. אחרת השרטוט כנראה בקנה מידה אחר.
    if (Math.abs(wp / (x1 - x0) - 1) < 0.25) {
      const c = (x0 + x1) / 2
      x0 = c - wp / 2
      x1 = c + wp / 2
      if (hp > 4 && g - hp > 0) top = g - hp
      how = 'רוחב וגובה לפי קנה המידה, מיקום לפי קו הקרקע וקווי הקירות'
    }
  }
  const cl = (v: number) => Math.min(1, Math.max(0, v))
  return { x0: cl(x0 / w), x1: cl(x1 / w), yGround: cl(g / h), yTop: cl(top / h), how }
}

const latest = (id: string) => getState().projects.find((p) => p.id === id)

// שומר שרטוט חזית ומחשב את מיקום הבניין בו. pxPerPt: פיקסלים בתמונה לכל יחידת עמוד, אם השרטוט נחתך מההיתר.
export async function addFacade(projectId: string, canvas: HTMLCanvasElement, o: { title: string; side?: FacadeSide | null; drawingId?: string; mPerPx?: number | null }): Promise<Facade | null> {
  const p = latest(projectId)
  const ctx = canvas.getContext('2d')
  if (!p || !ctx || canvas.width < 8 || canvas.height < 8) return null
  const side = o.side ?? sideFromTitle(o.title)
  const fps = unitFootprints(p)
  const top = buildingTop(p.building)
  const widthM = side && fps.length ? sideWidth(fps, side, p.north || 0) : 0
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pl = placeInImage(img.data, canvas.width, canvas.height, o.mPerPx && widthM ? { pxPerM: 1 / o.mPerPx, widthM, heightM: top } : undefined)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.88))
  if (!blob) return null
  const f: Facade = { id: uid(), drawingId: o.drawingId, title: o.title, side, w: canvas.width, h: canvas.height, ...pl, topRel: top, addedAt: new Date().toISOString() }
  await saveDocBlob(f.id, blob)
  // חזית חדשה לאותו שרטוט או לאותו צד מחליפה את הקודמת: אין חזית על חזית
  const old = (p.facades ?? []).filter((x) => (o.drawingId && x.drawingId === o.drawingId) || (side && x.side === side))
  updateProject(projectId, (q) => ({ ...q, facades: [...(q.facades ?? []).filter((x) => !old.includes(x)), f] }))
  await Promise.all(old.map((x) => deleteDocBlob(x.id).catch(() => undefined)))
  return f
}

export async function addFacadeFromFile(projectId: string, file: File, side: FacadeSide | null): Promise<Facade | null> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k)
  canvas.height = Math.round(bmp.height * k)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return addFacade(projectId, canvas, { title: file.name.replace(/\.[^.]+$/, ''), side: side ?? sideFromTitle(file.name) })
}

export function updateFacade(projectId: string, id: string, patch: Partial<Facade>) {
  updateProject(projectId, (p) => ({ ...p, facades: (p.facades ?? []).map((f) => (f.id === id ? { ...f, ...patch, how: patch.how ?? (('x0' in patch || 'x1' in patch || 'yGround' in patch || 'yTop' in patch) ? 'תוקן ידנית' : f.how) } : f)) }))
}

export async function removeFacade(projectId: string, id: string) {
  updateProject(projectId, (p) => ({ ...p, facades: (p.facades ?? []).filter((f) => f.id !== id) }))
  await deleteDocBlob(id).catch(() => undefined)
}

function inside(p: Pt, poly: Pt[]) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

export interface FacadeQuad {
  // ארבע פינות בעולם (x, גובה, z) ו-uv תואם, בסדר: תחתון שמאל, תחתון ימין, עליון ימין, עליון שמאל
  pos: [number, number, number][]
  uv: [number, number][]
}

// לכל חזית: הקירות החיצוניים שפונים לכיוונה, עם קואורדינטות תמונה בהיטל ישר
// sides: כל הצדדים שיש להם חזית. כל קיר מקבל רק את החזית שפונה אליו הכי ישר, כדי שלא יולבשו שתי חזיתות על קיר אחד.
export function facadeQuads(f: Facade, layers: { fps: Pt[][]; z0: number; z1: number }[], north: number, sides: FacadeSide[] = SIDES, offset = 0.05): FacadeQuad[] {
  const footprints = layers.flatMap((l) => l.fps)
  if (!f.side || !footprints.length || f.topRel <= 0 || f.x1 <= f.x0 || f.yGround <= f.yTop) return []
  const { r } = sideAxes(f.side, north)
  const normals = [...new Set([...sides, f.side])].map((sd) => ({ sd, n: sideAxes(sd, north).n }))
  const all = footprints.flat().map((p) => p.x * r.x + p.y * r.y)
  const s0 = Math.min(...all)
  const s1 = Math.max(...all)
  if (s1 - s0 < 0.1) return []
  const u = (p: Pt) => f.x0 + ((p.x * r.x + p.y * r.y - s0) / (s1 - s0)) * (f.x1 - f.x0)
  const v = (z: number) => 1 - (f.yGround + (z / f.topRel) * (f.yTop - f.yGround))
  const out: FacadeQuad[] = []
  for (const { fps, z0, z1 } of layers) for (const fp of fps) {
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i]
      const b = fp[(i + 1) % fp.length]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 0.05) continue
      let nx = (b.y - a.y) / len
      let ny = -(b.x - a.x) / len
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (inside({ x: mid.x + nx * 0.02, y: mid.y + ny * 0.02 }, fp)) (nx = -nx), (ny = -ny)
      const fit = normals.map((o) => ({ sd: o.sd, d: nx * o.n.x + ny * o.n.y })).sort((p, q) => q.d - p.d)[0]
      if (fit.sd !== f.side || fit.d < 0.5) continue
      // סדר הפינות משמאל לימין מנקודת מבטו של הצופה
      const [l, rt] = a.x * r.x + a.y * r.y <= b.x * r.x + b.y * r.y ? [a, b] : [b, a]
      const P = (p: Pt, z: number): [number, number, number] => [p.x + nx * offset, z, p.y + ny * offset]
      out.push({ pos: [P(l, z0), P(rt, z0), P(rt, z1), P(l, z1)], uv: [[u(l), v(z0)], [u(rt), v(z0)], [u(rt), v(z1)], [u(l), v(z1)]] })
    }
  }
  return out
}

export const projectFacades = (p: Project) => (p.facades ?? []).filter((f) => f.side)
