import polygonClipping from 'polygon-clipping'
import type { Building, Drawing, FloorPlan, PlanStructure, Project, Pt } from './types'
import { simplify } from './geom'
import { unitFootprints } from './structureToElements'
import { updateProject } from './store'

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

// תוכניות הקומות שמעל הקרקע, מהנמוכה לגבוהה
export function upperFloorDrawings(list: Drawing[], groundId?: string): Drawing[] {
  return list
    .filter((d) => d.kind === 'floor_plan' && d.id !== groundId && !/קרקע|ground|מרתף|basement|מסד|חניה/i.test(d.floor + ' ' + d.title))
    .map((d, i) => ({ d, o: floorOrder(d) || 5 + i * 0.01 }))
    .sort((a, b) => a.o - b.o)
    .map((x) => x.d)
}

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
export function floorFromStructure(p: Project, d: Drawing, s: PlanStructure, id: string): FloorPlan | null {
  const sc = p.permit?.scale
  const ground = unitFootprints(p)
  if (!sc?.metersPerPt || !ground.length) return null
  // קנה המידה של תוכנית הקומה יכול להיות שונה משל תוכנית הקרקע
  const mpp = sc.metersPerPt * (d.scaleDen && sc.den ? d.scaleDen / sc.den : 1)
  const M = (v: Pt): Pt => ({ x: v.x * mpp, y: v.y * mpp })
  const raw = s.units.map((u) => simplify(u.footprint.map(M), 0.05)).filter((f) => f.length >= 3)
  if (!raw.length) return null
  const t = alignToGround(raw, ground)
  const T = (v: Pt): Pt => ({ x: Math.round((v.x + t.dx) * 100) / 100, y: Math.round((v.y + t.dy) * 100) / 100 })
  const area = raw.reduce((a, f) => a + polyArea(f), 0)
  return {
    id,
    drawingId: d.id,
    title: d.title || 'תוכנית קומה',
    order: floorOrder(d),
    footprints: raw.map((f) => f.map(T)),
    openings: s.openings.map((o) => ({ type: o.type, a: T(M(o.a)), b: T(M(o.b)) })),
    area: Math.round(area * 100) / 100,
    how: t.share > 0.6 ? `הוצבה מעל הקרקע לפי החפיפה הטובה ביותר (${Math.round(t.share * 100)}% מהקומה מעל הבית)` : 'החפיפה לקרקע חלשה: כדאי לבדוק את ההצבה במודל',
    readAt: new Date().toISOString(),
  }
}

export function setFloors(projectId: string, floors: FloorPlan[]) {
  updateProject(projectId, (p) => ({ ...p, floors }))
}
export function removeFloor(projectId: string, id: string) {
  updateProject(projectId, (p) => ({ ...p, floors: (p.floors ?? []).filter((f) => f.id !== id) }))
}

export interface HouseLayer {
  fps: Pt[][]
  z0: number
  z1: number
  openings: FloorPlan['openings']
  fromPlan: boolean // הקומה נקראה מהתוכנית שלה, ולא שוכפלה מקומה אחרת
  title: string
}

// שכבות הבית מעל קומת הקרקע: קומה לכל מפלס. קומה שלא נקראה מקבלת את קו המתאר של הקומה שמתחתיה.
export function upperLayers(p: Project, ground: Pt[][]): HouseLayer[] {
  const b: Building | undefined = p.building
  const floors = p.floors ?? []
  if (!ground.length || (!b && !floors.length)) return []
  const gh = b?.groundHeight ?? 3
  const n = Math.max(floors.length, (b?.storeys ?? 1) - 1)
  let top = b?.eaveRel && b.eaveRel > gh + 0.3 ? b.eaveRel : gh * (n + 1)
  if (n === 0) return top > gh + 0.3 ? [{ fps: ground, z0: gh, z1: top, openings: [], fromPlan: false, title: '' }] : []
  if (top < gh + n * 2.2) top = gh + n * 3
  const h = (top - gh) / n
  const out: HouseLayer[] = []
  for (let i = 0; i < n; i++) {
    const f = floors[Math.min(i, floors.length - 1)]
    out.push({ fps: f ? f.footprints : ground, z0: gh + i * h, z1: gh + (i + 1) * h, openings: f && i < floors.length ? f.openings : [], fromPlan: Boolean(f && i < floors.length), title: f?.title ?? '' })
  }
  return out
}
