import polygonClipping from 'polygon-clipping'
import type { Building, Cladding, Drawing, FloorPlan, PlanStructure, Project, Pt, StoreyKind } from './types'
import { simplify } from './geom'
import { unitFootprints } from './structureToElements'
import { getState, updateProject } from './store'

// כל קומה מהתוכנית שלה, בשיטת פרויקט התאנה: קו המתאר והפתחים של קומה עליונה נקראים מתוכנית הקומה,
// ומוצבים מעל קומת הקרקע. הקומה לא מצוירת כקופסה מעל קו המתאר של הקרקע.

const ORDER: [RegExp, number][] = [
  [/ראשונ|first|(^|[\s'"׳״])א($|[\s'"׳״.])/i, 1],
  [/שני|second|(^|[\s'"׳״])ב($|[\s'"׳״.])/i, 2],
  [/שלישי|third|(^|[\s'"׳״])ג($|[\s'"׳״.])/i, 3],
  [/עליית|attic|גג|roof/i, 9],
]

// מספר הקומה לפי הכיתוב ("א", "קומה ראשונה", "עליית גג"). 0: לא זוהה
export function floorOrder(d: { floor: string; title: string }): number {
  for (const src of [d.floor, d.title]) for (const [re, n] of ORDER) if (re.test(src)) return n
  return 0
}

export const STOREY_TEXT: Record<StoreyKind, string> = { basement: 'מרתף', floor: 'קומה', roof: 'גג' }

// כל התוכניות שמהן נבנה הבית חוץ מקומת הקרקע: מרתף, קומות עליונות וגג. מהנמוכה לגבוהה.
export function storeyDrawings(list: Drawing[], groundId?: string): { d: Drawing; kind: StoreyKind }[] {
  const out: { d: Drawing; kind: StoreyKind; o: number }[] = []
  const g = list.find((d) => d.id === groundId)
  list.forEach((d, i) => {
    if (d.id === groundId) return
    // תוכנית קומה אמיתית משורטטת בגודל של תוכנית הקרקע. תרשים חישוב שטחים קטן ממנה בהרבה, ואינו קומה.
    if (g && (d.box.w * d.box.h < g.box.w * g.box.h * 0.45 || d.box.w < g.box.w * 0.6 || d.box.h < g.box.h * 0.6)) return
    const t = d.floor + ' ' + d.title
    if (d.kind === 'basement_plan' || (d.kind === 'floor_plan' && /מרתף|basement|מסד|חני/i.test(t))) out.push({ d, kind: 'basement', o: -1 + i * 0.001 })
    else if (d.kind === 'roof_plan' || (d.kind === 'floor_plan' && /תכנית\s*(ה)?גג|roof plan/i.test(t))) out.push({ d, kind: 'roof', o: 20 + i * 0.001 })
    else if (d.kind === 'floor_plan' && !/קרקע|ground/i.test(t) && !(g && d.title && d.title === g.title)) out.push({ d, kind: 'floor', o: floorOrder(d) || 5 + i * 0.01 })
  })
  return out.sort((a, b) => a.o - b.o).map(({ d, kind }) => ({ d, kind }))
}
export const upperFloorDrawings = (list: Drawing[], groundId?: string) => storeyDrawings(list, groundId).filter((x) => x.kind === 'floor').map((x) => x.d)

const ring = (p: Pt[]): [number, number][] => p.map((v) => [v.x, v.y])
const bounds = (ps: Pt[]) => {
  const xs = ps.map((p) => p.x)
  const ys = ps.map((p) => p.y)
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}
export function polyArea(p: Pt[]) {
  let a = 0
  for (let i = 0; i < p.length; i++) a += p[i].x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * p[i].y
  return Math.abs(a) / 2
}
function overlap(a: Pt[][], b: Pt[][]): number {
  try {
    const r = polygonClipping.intersection(a.map((p) => [ring(p)]), b.map((p) => [ring(p)]))
    return r.reduce((s, poly) => s + polyArea(poly[0].map(([x, y]) => ({ x, y }))), 0)
  } catch {
    return 0
  }
}

// הצבת קומה מעל הקרקע: תוכנית הקומה משורטטת במקום אחר בגיליון, ולכן מחפשים את ההזזה שבה הקומה הכי חופפת לקרקע.
// נבדקות תשע הצבות: יישור לכל צד ולמרכז, בשני הצירים. הקומה היא חלק מהבית, ולכן ההצבה הנכונה היא זו שבה היא יושבת עליו.
export function alignToGround(upper: Pt[][], ground: Pt[][]): { dx: number; dy: number; share: number } {
  const u = bounds(upper.flat())
  const g = bounds(ground.flat())
  const area = upper.reduce((s, p) => s + polyArea(p), 0) || 1
  let best = { dx: (g.x0 + g.x1 - u.x0 - u.x1) / 2, dy: (g.y0 + g.y1 - u.y0 - u.y1) / 2, share: -1 }
  for (const dx of [(g.x0 + g.x1 - u.x0 - u.x1) / 2, g.x0 - u.x0, g.x1 - u.x1])
    for (const dy of [(g.y0 + g.y1 - u.y0 - u.y1) / 2, g.y0 - u.y0, g.y1 - u.y1]) {
      const share = overlap(upper.map((p) => p.map((v) => ({ x: v.x + dx, y: v.y + dy }))), ground) / area
      if (share > best.share + 0.005) best = { dx, dy, share }
    }
  return best
}

// מקריאת המבנה של תוכנית קומה לקומה במטרים, מוצבת מעל הקרקע
export function floorFromStructure(p: Project, d: Drawing, s: PlanStructure, id: string, kind: StoreyKind = 'floor'): FloorPlan | null {
  const sc = p.permit?.scale
  const ground = unitFootprints(p)
  if (!sc?.metersPerPt || !ground.length) return null
  // קנה המידה של תוכנית הקומה יכול להיות שונה משל תוכנית הקרקע
  const mpp = sc.metersPerPt * (d.scaleDen && sc.den ? d.scaleDen / sc.den : 1)
  const M = (v: Pt): Pt => ({ x: v.x * mpp, y: v.y * mpp })
  const raw = s.units.map((u) => simplify(u.footprint.map(M), 0.05)).filter((f) => f.length >= 3)
  if (!raw.length) return null
  // הצבה לפי המסגרת: תוכניות הקומות משורטטות במסגרות זהות, ולכן אותה נקודה במסגרת היא אותה נקודה במגרש.
  // זו ההצבה המדויקת. כשאין מסגרות, או שהתוצאה לא יושבת על הבית, נופלים לחיפוש החפיפה הטובה ביותר.
  const gd = p.permit?.drawings?.find((x) => x.id === p.permit?.structure?.drawingId)
  let t = alignToGround(raw, ground)
  let byFrame = false
  if (gd?.anchor && d.anchor) {
    const gm = sc.metersPerPt
    const dx = gd.anchor.x * gm - d.anchor.x * mpp
    const dy = gd.anchor.y * gm - d.anchor.y * mpp
    const area0 = raw.reduce((a, f) => a + polyArea(f), 0) || 1
    const share = overlap(raw.map((f) => f.map((v) => ({ x: v.x + dx, y: v.y + dy }))), ground) / area0
    if (share > 0.45 || kind === 'basement') (t = { dx, dy, share }), (byFrame = true)
  }
  const T = (v: Pt): Pt => ({ x: Math.round((v.x + t.dx) * 100) / 100, y: Math.round((v.y + t.dy) * 100) / 100 })
  const area = raw.reduce((a, f) => a + polyArea(f), 0)
  return {
    id,
    drawingId: d.id,
    title: d.title || 'תוכנית קומה',
    kind,
    order: floorOrder(d),
    footprints: raw.map((f) => f.map(T)),
    openings: s.openings.map((o) => ({ type: o.type, a: T(M(o.a)), b: T(M(o.b)) })),
    area: Math.round(area * 100) / 100,
    how: byFrame ? `הוצבה לפי מסגרת השרטוט, כמו בגיליון (${Math.round(t.share * 100)}% מעל הבית)` : t.share > 0.6 ? `הוצבה מעל הקרקע לפי החפיפה הטובה ביותר (${Math.round(t.share * 100)}% מהקומה מעל הבית)` : 'החפיפה לקרקע חלשה: כדאי לבדוק את ההצבה במודל',
    readAt: new Date().toISOString(),
  }
}

export function setFloors(projectId: string, floors: FloorPlan[]) {
  updateProject(projectId, (p) => ({ ...p, floors }))
}
export function removeFloor(projectId: string, id: string) {
  updateProject(projectId, (p) => ({ ...p, floors: (p.floors ?? []).filter((f) => f.id !== id) }))
}


// ---------- כיול מחדש: תיקון ידני כשההצבה האוטומטית טעתה ----------

const r2 = (v: number) => Math.round(v * 100) / 100
function mapFloor(f: FloorPlan, fn: (v: Pt) => Pt, how: string): FloorPlan {
  const T = (v: Pt) => {
    const q = fn(v)
    return { x: r2(q.x), y: r2(q.y) }
  }
  return { ...f, footprints: f.footprints.map((fp) => fp.map(T)), openings: f.openings.map((o) => ({ ...o, a: T(o.a), b: T(o.b) })), how }
}
const center = (f: FloorPlan) => {
  const b = bounds(f.footprints.flat())
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
}
export const movedFloor = (f: FloorPlan, dx: number, dy: number) => mapFloor(f, (v) => ({ x: v.x + dx, y: v.y + dy }), 'הוזזה ידנית')
export function rotatedFloor(f: FloorPlan): FloorPlan {
  const c = center(f)
  return mapFloor(f, (v) => ({ x: c.x - (v.y - c.y), y: c.y + (v.x - c.x) }), 'סובבה ידנית ב-90 מעלות')
}
export function mirroredFloor(f: FloorPlan): FloorPlan {
  const c = center(f)
  const m = mapFloor(f, (v) => ({ x: 2 * c.x - v.x, y: v.y }), 'שוקפה ידנית')
  return { ...m, footprints: m.footprints.map((fp) => [...fp].reverse()) }
}
export function realignedFloor(f: FloorPlan, ground: Pt[][]): FloorPlan {
  const t = alignToGround(f.footprints, ground)
  return mapFloor(f, (v) => ({ x: v.x + t.dx, y: v.y + t.dy }), `הוצבה מחדש אוטומטית (${Math.round(Math.max(0, t.share) * 100)}% מעל הבית)`)
}
export function patchFloor(projectId: string, id: string, fn: (f: FloorPlan) => FloorPlan) {
  updateProject(projectId, (p) => ({ ...p, floors: (p.floors ?? []).map((f) => (f.id === id ? fn(f) : f)) }))
}

// ---------- שכבות הבית ----------

export interface LayerOpening {
  type: 'door' | 'sliding_door' | 'window' | 'opening'
  a: Pt
  b: Pt
}
export interface HouseLayer {
  fps: Pt[][]
  z0: number
  z1: number
  openings: LayerOpening[]
  fromPlan: boolean // נקראה מהתוכנית שלה, ולא שוכפלה מקומה אחרת
  title: string
  kind: 'basement' | 'ground' | 'floor' | 'parapet'
}

export interface House {
  ground: HouseLayer | null
  basements: HouseLayer[] // מהעליון לתחתון
  uppers: HouseLayer[]
  parapet: HouseLayer | null // מעקה גג שטוח
  roofFps: Pt[][]
  roofFromPlan: boolean
  top: number // ראש הקירות
  ridge: number | null
  pitched: boolean
  hip: boolean
}

const kindOf = (f: FloorPlan): StoreyKind => f.kind ?? 'floor'
const levelOf = (b: Building | undefined, meaning: string) => b?.levels.find((l) => l.meaning === meaning)?.rel

// הבית כולו, מהמרתף עד הגג: שכבה לכל מפלס, כל אחת מהתוכנית שלה כשנקראה. קומה שלא נקראה מקבלת את קו המתאר של הקומה שמתחתיה.
export function houseOf(p: Project, ground: Pt[][]): House {
  const b = p.building
  const all = p.floors ?? []
  const floors = all.filter((f) => kindOf(f) === 'floor')
  const gh = b?.groundHeight ?? 3
  const empty: House = { ground: null, basements: [], uppers: [], parapet: null, roofFps: [], roofFromPlan: false, top: gh, ridge: null, pitched: false, hip: false }
  if (!ground.length) return empty
  const s = p.permit?.structure
  const mpp = p.permit?.scale.metersPerPt ?? 0
  const gOpen: LayerOpening[] = s && mpp ? s.openings.map((o) => ({ type: o.type, a: { x: o.a.x * mpp, y: o.a.y * mpp }, b: { x: o.b.x * mpp, y: o.b.y * mpp } })) : []
  const groundL: HouseLayer = { fps: ground, z0: 0, z1: gh, openings: gOpen, fromPlan: true, title: 'קומת קרקע', kind: 'ground' }

  // קומות עליונות
  const n = Math.max(floors.length, (b?.storeys ?? 1) - 1)
  let top = b?.eaveRel && b.eaveRel > gh + 0.3 ? b.eaveRel : gh * (n + 1)
  if (n > 0 && top < gh + n * 2.2) top = gh + n * 3
  const uppers: HouseLayer[] = []
  if (n > 0) {
    // מפלס כל קומה מהחתכים, כשנקרא: קומה א' ואחריה קומה ב' או עליית הגג
    const marks = [levelOf(b, 'second_floor') ?? levelOf(b, 'attic')].filter((v): v is number => typeof v === 'number' && v > gh + 2 && v < top - 0.5)
    const fixed = floors.reduce((a, f) => a + (f.height ?? 0), 0)
    const free = n - floors.filter((f) => f.height).length
    const h = free > 0 ? Math.max(2.2, (top - gh - fixed) / free) : 0
    let z = gh
    for (let i = 0; i < n; i++) {
      const f = floors[Math.min(i, floors.length - 1)]
      const own = i < floors.length
      const fh = (own && f?.height) || (n === 2 && marks.length ? (i === 0 ? marks[0] - gh : top - marks[0]) : 0) || h || 3
      uppers.push({ fps: f ? f.footprints : ground, z0: z, z1: z + fh, openings: own && f ? f.openings : [], fromPlan: Boolean(own && f), title: f?.title ?? '', kind: 'floor' })
      z += fh
    }
    top = z
  } else if (!(b && top > gh + 0.3)) top = gh
  else uppers.push({ fps: ground, z0: gh, z1: top, openings: [], fromPlan: false, title: '', kind: 'floor' })

  // מרתפים: מתחת ל-0.00, מהעליון לתחתון
  const bs = all.filter((f) => kindOf(f) === 'basement')
  const bRel = levelOf(b, 'basement')
  const basements: HouseLayer[] = []
  let z = 0
  bs.forEach((f) => {
    const fh = f.height ?? (bs.length === 1 && bRel && bRel < -1.8 ? -bRel : 2.8)
    basements.push({ fps: f.footprints, z0: z - fh, z1: z, openings: [], fromPlan: true, title: f.title, kind: 'basement' })
    z -= fh
  })

  // גג
  const roof = all.find((f) => kindOf(f) === 'roof')
  const topFps = uppers.length ? uppers[uppers.length - 1].fps : ground
  const roofFps = roof ? roof.footprints : topFps
  const ridge = b?.ridgeRel && b.ridgeRel > top + 0.2 ? b.ridgeRel : null
  const pitched = Boolean(ridge && b && b.roofType !== 'flat')
  const par = levelOf(b, 'parapet')
  const ph = par && par > top + 0.2 && par < top + 2 ? par - top : 1
  const parapet: HouseLayer | null = !pitched && (uppers.length > 0 || Boolean(roof)) ? { fps: topFps, z0: top, z1: top + ph, openings: [], fromPlan: false, title: 'מעקה גג', kind: 'parapet' } : null
  return { ground: groundL, basements, uppers, parapet, roofFps, roofFromPlan: Boolean(roof), top, ridge, pitched, hip: b?.roofType === 'hip' }
}

// ---------- חיפוי ----------

export const CLADDING: Record<Cladding, { t: string; color: string; roof: string }> = {
  none: { t: 'בלי חיפוי (מסה)', color: '#e6e3dc', roof: '#a9aca8' },
  plaster: { t: 'טיח בהיר', color: '#f1ede4', roof: '#a5553c' },
  stone: { t: 'אבן', color: '#d9c7a3', roof: '#a5553c' },
  concrete: { t: 'בטון חשוף', color: '#b9b8b3', roof: '#6f706c' },
  wood: { t: 'עץ', color: '#a9794f', roof: '#55504a' },
  dark: { t: 'טיח כהה', color: '#5b5f63', roof: '#3a3c3e' },
}
// ברירת המחדל: בית שנקראו לו קומות או חזיתות מוצג לבוש בטיח, ולא כמסה שקופה
export const claddingOf = (p: Project): Cladding => p.cladding ?? ((p.floors?.length ?? 0) > 0 || (p.facades?.length ?? 0) > 0 ? 'plaster' : 'none')
export const setCladding = (projectId: string, c: Cladding) => updateProject(projectId, (p) => ({ ...p, cladding: c }))

export interface WallFace {
  a: Pt // תחילת הפאה בתוכנית
  dir: Pt // כיוון הפאה, יחידה
  n: Pt // כלפי חוץ
  len: number
  z0: number
  z1: number
  holes: { s0: number; s1: number; z0: number; z1: number; door: boolean }[] // פתחים: לאורך הפאה ובגובה
}

function inside(pt: Pt, poly: Pt[]) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

// הפאות החיצוניות של שכבה, עם הפתחים שעל כל פאה. כך הקיר נבנה כקיר עם פתחים, ולא כקופסה שעליה מודבקים חלונות.
export function wallFaces(l: HouseLayer): WallFace[] {
  const out: WallFace[] = []
  const H = l.z1 - l.z0
  for (const fp of l.fps)
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i]
      const b = fp[(i + 1) % fp.length]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 0.05) continue
      const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
      let n = { x: dir.y, y: -dir.x }
      if (inside({ x: (a.x + b.x) / 2 + n.x * 0.02, y: (a.y + b.y) / 2 + n.y * 0.02 }, fp)) n = { x: -n.x, y: -n.y }
      const holes: WallFace['holes'] = []
      for (const o of l.openings) {
        const m = { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 }
        const s = (m.x - a.x) * dir.x + (m.y - a.y) * dir.y
        const d = Math.abs((m.x - a.x) * n.x + (m.y - a.y) * n.y)
        const w = Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y)
        // הפתח שייך לפאה כשהוא מקביל לה, קרוב אליה, וכולו בתוכה
        const par = Math.abs(((o.b.x - o.a.x) * dir.x + (o.b.y - o.a.y) * dir.y) / (w || 1))
        if (w < 0.3 || d > 0.6 || par < 0.8 || s - w / 2 < 0.1 || s + w / 2 > len - 0.1) continue
        const door = o.type !== 'window'
        const sill = door ? 0 : 0.9
        const oh = Math.min(H - sill - 0.25, door ? 2.1 : 1.2)
        if (oh < 0.4 || holes.some((q) => s - w / 2 < q.s1 + 0.05 && s + w / 2 > q.s0 - 0.05)) continue
        holes.push({ s0: s - w / 2, s1: s + w / 2, z0: l.z0 + sill, z1: l.z0 + sill + oh, door })
      }
      out.push({ a, dir, n, len, z0: l.z0, z1: l.z1, holes })
    }
  return out
}

export const projectById = (id: string) => getState().projects.find((p) => p.id === id)

// תיאור הבניין להנחיית ההדמיה הריאליסטית: מספר הקומות, המרתף, הגג והחיפוי, כפי שנבנו במודל
export function buildingPhrase(p: Project): string {
  const clad = claddingOf(p)
  if (clad === 'none' && !(p.floors?.length || p.facades?.length)) return ''
  const fl = p.floors ?? []
  const ups = Math.max(fl.filter((f) => (f.kind ?? 'floor') === 'floor').length, (p.building?.storeys ?? 1) - 1)
  const roof = p.building && p.building.ridgeRel && p.building.roofType !== 'flat' ? (p.building.roofType === 'hip' ? 'גג רעפים בארבעה שיפועים' : 'גג רעפים משופע') : 'גג שטוח עם מעקה'
  const mat = { none: 'טיח בהיר', plaster: 'טיח בהיר חלק', stone: 'חיפוי אבן בנדבכים', concrete: 'בטון חשוף בלוחות', wood: 'חיפוי לוחות עץ', dark: 'טיח כהה' }[clad]
  return [
    `הבית: ${ups + 1} קומות מעל הקרקע, ${roof}. שמור בדיוק על הנפח של כל קומה, על הנסיגות והמרפסות, ועל מיקום וגודל כל חלון ודלת.`,
    `חיפוי הקירות: ${mat}. חלונות זכוכית עם מסגרות אלומיניום כהות, ודלתות עץ.`,
    p.facades?.length ? 'קווי השרטוט שעל הקירות הם חזיתות ההיתר: בנה לפיהם את הפתחים והחלוקות, ואל תשאיר קווי שרטוט בתמונה.' : '',
  ].filter(Boolean).join(' ')
}
