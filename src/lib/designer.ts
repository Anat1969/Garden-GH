// מתכנן גינה אוטומטי: מקבל אזור גינה (מצולע), את קירות הבית, סגנון ודרישות לקוח,
// ומחזיר אלמנטים רגילים (משטחים, פריטים, קווים) שאפשר לערוך, להזיז ולמחוק כמו כל אלמנט אחר.
// אין כאן חוות דעת הנדסית: כל מידה מסומנת "הונח" עד שבודקים אותה.
import polygonClipping, { type Polygon as PCPolygon } from 'polygon-clipping'
import type { Element, GardenLine, GardenObject, Pt, Surface, Wall } from './types'
import type { StyleGuide } from '../data/gardenGuide'
import { LINES, MATERIALS, OBJECTS, type LineType, type ObjectType, type SurfaceMaterial } from './garden'
import { dropCollinear, surfacePoly } from './elementGeom'
import { pointInPoly, polyArea } from './geom'

export type FunctionId = 'dining' | 'lounge' | 'kids' | 'edible' | 'water' | 'shade' | 'privacy' | 'bbq' | 'pets' | 'lowMaint'

export const FUNCTIONS: { id: FunctionId; text: string }[] = [
  { id: 'dining', text: 'פינת אוכל' },
  { id: 'lounge', text: 'פינת ישיבה ומנוחה' },
  { id: 'shade', text: 'צל' },
  { id: 'kids', text: 'משחק לילדים' },
  { id: 'edible', text: 'ירקות ותבלינים' },
  { id: 'water', text: 'מים בגינה' },
  { id: 'privacy', text: 'פרטיות מהשכנים' },
  { id: 'bbq', text: 'מטבח חוץ או גריל' },
  { id: 'pets', text: 'מקום לכלב' },
  { id: 'lowMaint', text: 'תחזוקה נמוכה' },
]

export interface DesignInput {
  zones: Surface[]
  walls: Wall[]
  style: StyleGuide
  functions: FunctionId[]
  budget: 'low' | 'mid' | 'high'
  uid: () => string
}

export interface DesignResult {
  elements: Element[]
  notes: string[]
}

type Ring = [number, number][]
const toRing = (p: Pt[]): Ring => p.map((v) => [v.x, v.y])
const fromRing = (r: Ring): Pt[] => r.slice(0, -1).map(([x, y]) => ({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }))

// חיתוך מצולע במצולע, מחזיר את החלקים (בלי חורים) ששטחם מעל הסף
// polygon-clipping נכשל לפעמים על מצולעים כמעט מנוונים: מעגלים ל-2 ספרות, מנקים, ובכישלון חוזרים לחלופה פשוטה
const clean = (p: Pt[]) => dropCollinear(p.map((v) => ({ x: Math.round(v.x * 100) / 100, y: Math.round(v.y * 100) / 100 })))
const centroid = (p: Pt[]) => p.reduce((a, v) => ({ x: a.x + v.x / p.length, y: a.y + v.y / p.length }), { x: 0, y: 0 })
function clip(a: Pt[], b: Pt[]): Pt[][] {
  try {
    const r = polygonClipping.intersection([toRing(clean(a))], [toRing(clean(b))])
    return r.map((poly) => fromRing(poly[0])).filter((p) => p.length >= 3 && Math.abs(polyArea(p)) > 0.3)
  } catch {
    return pointInPoly(centroid(a), b) ? [a] : []
  }
}
function minus(a: Pt[], cut: Pt[][]): Pt[][] {
  if (!cut.length) return [a]
  try {
    const r = polygonClipping.difference([toRing(clean(a))], ...cut.map((c) => [toRing(clean(c))] as PCPolygon))
    return r.map((poly) => fromRing(poly[0])).filter((p) => p.length >= 3 && Math.abs(polyArea(p)) > 0.3)
  } catch {
    // בלי חיסור: המשטח הרך נשאר מתחת לשאר, במפלס נמוך מעט
    return [a]
  }
}

function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L2 = dx * dx + dy * dy || 1e-9
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// קצה פנימי גלי לסגנון אורגני: מחליף את צלע הערוגה הפונה פנימה בקו מתפתל
function wavy(p: Pt[], amp: number): Pt[] {
  if (p.length !== 4) return p
  const out: Pt[] = []
  for (let i = 0; i < 4; i++) {
    const a = p[i]
    const b = p[(i + 1) % 4]
    out.push(a)
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    const n = Math.floor(L / 0.8)
    if (i === 2 && n > 1) {
      const nx = -(b.y - a.y) / L
      const ny = (b.x - a.x) / L
      for (let k = 1; k < n; k++) {
        const t = k / n
        const off = Math.sin(t * Math.PI * 2) * amp
        out.push({ x: a.x + (b.x - a.x) * t + nx * off, y: a.y + (b.y - a.y) * t + ny * off })
      }
    }
  }
  return out
}

export function designGarden(inp: DesignInput): DesignResult {
  const { style, functions, budget, uid } = inp
  const has = (f: FunctionId) => functions.includes(f)
  const P = style.plan
  const src = `תכנון אוטומטי · סגנון ${style.name}`
  const elements: Element[] = []
  const notes: string[] = []
  const base = { label: 'assumed' as const, source: src, approved: false }

  const surf = (poly: Pt[], material: SurfaceMaterial, level: number): Surface => {
    const xs = poly.map((p) => p.x)
    const ys = poly.map((p) => p.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { id: uid(), kind: 'surface', material, poly, x, y, w: Math.max(...xs) - x, d: Math.max(...ys) - y, level, ...base }
  }
  const obj = (type: ObjectType, at: Pt, level: number, rot = 0, scale = 1): GardenObject => {
    const d = OBJECTS[type]
    return { id: uid(), kind: 'object', type, x: Math.round(at.x * 100) / 100, y: Math.round(at.y * 100) / 100, w: d.w * scale, d: d.d * scale, h: d.h * (scale > 1 ? 1 : scale), rot, level, ...base }
  }
  const line = (type: LineType, pts: Pt[], level: number): GardenLine => ({ id: uid(), kind: 'line', type, pts: pts.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })), width: LINES[type].width, height: LINES[type].height, level, ...base })

  // תקציב נמוך: חומר קשה זול יותר, פחות עצים
  const hard: SurfaceMaterial = budget === 'low' && (P.hard === 'deck' || P.hard === 'stone' || P.hard === 'tiles') ? 'paving' : P.hard
  const soft: SurfaceMaterial = has('lowMaint') && P.soft === 'lawn' ? 'turf' : has('kids') && (P.soft === 'gravel' || P.soft === 'pebbles') ? 'lawn' : P.soft

  for (const zone of inp.zones) {
    const Z = clean(surfacePoly(zone))
    const lv = zone.level
    const xs = Z.map((p) => p.x)
    const ys = Z.map((p) => p.y)
    const bx = Math.min(...xs)
    const by = Math.min(...ys)
    const bw = Math.max(...xs) - bx
    const bh = Math.max(...ys) - by
    if (bw < 1.5 || bh < 1.5) {
      notes.push(`אזור ${MATERIALS[zone.material].text} קטן מדי לתכנון (${bw.toFixed(2)}×${bh.toFixed(2)} מ')`)
      continue
    }
    // הצד הקרוב לבית: הצלע של המלבן החוסם שמרכזה הכי קרוב לקיר בית
    const sides = [
      { s: 'top' as const, m: { x: bx + bw / 2, y: by } },
      { s: 'bottom' as const, m: { x: bx + bw / 2, y: by + bh } },
      { s: 'left' as const, m: { x: bx, y: by + bh / 2 } },
      { s: 'right' as const, m: { x: bx + bw, y: by + bh / 2 } },
    ]
    const houseWalls = inp.walls.filter((w) => w.scope === 'house')
    const dist = (m: Pt) => (houseWalls.length ? Math.min(...houseWalls.map((w) => segDist(m, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }))) : 99)
    const near = [...sides].sort((a, b) => dist(a.m) - dist(b.m))[0].s
    const along = near === 'top' || near === 'bottom' ? bw : bh
    const depth = near === 'top' || near === 'bottom' ? bh : bw
    // מערכת צירים מקומית: u לאורך הבית, v מהבית החוצה
    const toXY = (u: number, v: number): Pt =>
      near === 'top' ? { x: bx + u, y: by + v } : near === 'bottom' ? { x: bx + u, y: by + bh - v } : near === 'left' ? { x: bx + v, y: by + u } : { x: bx + bw - v, y: by + u }
    const band = (u0: number, u1: number, v0: number, v1: number) => [toXY(u0, v0), toXY(u1, v0), toXY(u1, v1), toXY(u0, v1)]

    // 1. פטיו צמוד לבית
    const wantDining = has('dining') || has('bbq') || P.objects.includes('dining')
    const patioDepth = Math.min(depth * 0.45, wantDining ? 3.6 : has('lounge') ? 3.0 : 2.4)
    const patioLen = Math.min(along, wantDining ? Math.max(4.2, along * 0.6) : Math.max(3, along * 0.5))
    const u0 = (along - patioLen) / 2
    const patio = clip(band(u0, u0 + patioLen, 0, patioDepth), Z)
    patio.forEach((p) => elements.push(surf(p, hard, lv)))

    // 2. ערוגות היקפיות בצדדים ובקצה הרחוק
    const bedD = Math.min(Math.max(0.8, depth * 0.14), 1.4)
    const bedBands = [band(0, along, depth - bedD, depth), band(0, Math.min(bedD, along), patioDepth, depth - bedD), band(Math.max(0, along - bedD), along, patioDepth, depth - bedD)]
    const beds = bedBands.flatMap((b, i) => clip(i === 0 && P.geometry === 'organic' ? wavy(b, bedD * 0.35) : b, Z))
    beds.forEach((b) => elements.push(surf(b, P.beds, lv)))

    // 3. מרכז: חומר רך לפי הסגנון, ומשטח הדגשה קטן בנקודת מוקד
    const rest = minus(Z, [...patio, ...beds])
    let accentPoly: Pt[] | null = null
    const accentMat: SurfaceMaterial | undefined = has('water') ? 'water' : P.accent
    const freeDepth = depth - patioDepth - bedD
    if (accentMat && freeDepth > 2.2 && along > 3) {
      const r = Math.min(1.4, freeDepth * 0.28, along * 0.2)
      const c = { u: along * 0.72, v: patioDepth + freeDepth * 0.55 }
      const n = P.geometry === 'organic' || accentMat === 'water' ? 14 : 4
      const pts = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (n === 4 ? Math.PI / 4 : 0)
        return toXY(c.u + Math.cos(a) * r * (n === 4 ? 1.3 : 1), c.v + Math.sin(a) * r * (n === 4 ? 1.3 : 0.8))
      })
      const cl = clip(pts, Z)
      if (cl.length) accentPoly = cl[0]
    }
    const softParts = rest.flatMap((p) => (accentPoly ? minus(p, [accentPoly]) : [p]))
    softParts.forEach((p) => elements.push(surf(p, soft, lv)))
    if (accentPoly) elements.push(surf(accentPoly, accentMat!, lv))

    const inside = (p: Pt) => pointInPoly(p, Z)
    const place = (type: ObjectType, u: number, v: number, rot = 0, scale = 1) => {
      const at = toXY(u, v)
      if (inside(at)) elements.push(obj(type, at, lv, rot, scale))
    }
    const rotAlong = near === 'top' || near === 'bottom' ? 0 : 90

    // 4. ריהוט על הפטיו
    if (patio.length) {
      if (wantDining) place('dining', u0 + Math.min(patioLen * 0.35, 2.2), patioDepth * 0.55, 0, Math.min(1, patioDepth / 2.6))
      if (has('lounge') || P.objects.includes('bench')) place('bench', u0 + patioLen * 0.78, patioDepth * 0.75, rotAlong)
      if (has('bbq')) place('grill', u0 + patioLen - 1.3, 0.45, rotAlong, Math.min(1, patioLen / 6))
      if (has('shade') || P.objects.includes('pergola')) {
        const pw = Math.min(patioLen, 4.2)
        const pd = Math.min(patioDepth, 3.2)
        const at = toXY(u0 + pw / 2 + 0.1, pd / 2)
        elements.push({ ...obj('pergola', at, lv, rotAlong), w: pw, d: pd })
      } else if (P.objects.includes('umbrella')) place('umbrella', u0 + patioLen * 0.35, patioDepth * 0.55)
      place('tap', u0 + 0.3, 0.3)
    }

    // 5. עצים בפינות הרחוקות, שיחים לאורך הערוגות
    const treeType: ObjectType = P.objects.includes('palm') ? 'palm' : has('edible') || P.objects.includes('fruit_tree') ? 'fruit_tree' : 'tree'
    const trees = budget === 'low' ? 1 : budget === 'high' ? 3 : 2
    const treeSpots = [
      [along - bedD * 0.5 - 0.2, depth - bedD * 0.5],
      [bedD * 0.5 + 0.2, depth - bedD * 0.5],
      [along * 0.5, depth - bedD * 0.5],
    ]
    treeSpots.slice(0, Math.min(trees, along > 6 ? 3 : 2)).forEach(([u, v], i) => place(i === 0 ? treeType : 'tree', u, v, 0, Math.min(1, Math.max(0.6, depth / 9))))
    const shrubStep = 1.6
    for (let u = bedD + 1.2; u < along - bedD - 1.2; u += shrubStep) place(has('privacy') ? 'shrub' : P.objects.includes('flowers') ? 'flowers' : 'shrub', u, depth - bedD * 0.5, 0, 0.8)

    // 6. פונקציות במרכז
    const midV = patioDepth + freeDepth * 0.5
    if (has('kids') && freeDepth > 2.5) place(along > 7 ? 'play' : 'sandbox', along * 0.28, midV, rotAlong, Math.min(1, freeDepth / 3.2))
    if (has('edible')) {
      const n = Math.max(1, Math.min(3, Math.floor((along - 2 * bedD) / 1.8)))
      for (let i = 0; i < n; i++) place('planter', bedD + 0.9 + i * 1.6, patioDepth + 0.6, rotAlong)
    }
    if (has('water') && !accentPoly) place('fountain', along * 0.72, midV)
    if (P.objects.includes('firepit') && freeDepth > 3) place('firepit', along * 0.5, midV)

    // 7. קווים: שביל, גדר חיה לפרטיות, אבן שפה, תאורה
    if (freeDepth > 3 && (P.lines.includes('path') || depth > 6)) {
      const pts = [toXY(along * 0.5, patioDepth), toXY(along * 0.5 + (P.geometry === 'organic' ? along * 0.12 : 0), patioDepth + freeDepth * 0.5), toXY(along * 0.72, depth - bedD - 0.2)].filter(inside)
      if (pts.length >= 2) elements.push(line('path', pts, lv))
    }
    if (has('privacy') || P.lines.includes('hedge')) {
      const pts = [toXY(0.2, depth - 0.25), toXY(along - 0.2, depth - 0.25)].filter(inside)
      if (pts.length === 2) elements.push(line('hedge', pts, lv))
    }
    if (P.lines.includes('edging') && soft !== P.beds) {
      const pts = [toXY(bedD, depth - bedD), toXY(along - bedD, depth - bedD)].filter(inside)
      if (pts.length === 2) elements.push(line('edging', pts, lv))
    }
    if (P.lines.includes('irrigation') || has('edible')) {
      const pts = [toXY(0.4, depth - bedD * 0.5), toXY(along - 0.4, depth - bedD * 0.5)].filter(inside)
      if (pts.length === 2) elements.push(line('irrigation', pts, lv))
    }
    if (P.objects.includes('lamp') || budget !== 'low') {
      for (let v = patioDepth + 1; v < depth - bedD; v += 3) place('lamp', 0.5, v)
    }
    if (has('pets')) notes.push('מקום לכלב: מומלץ חצץ או דשא סינתטי בפינה מוצלת, וברז קרוב')
  }

  if (!elements.length) notes.push('לא נוצרו אלמנטים: צריך לפחות אזור גינה אחד בגודל 1.5×1.5 מ\' ומעלה')
  notes.push('כל המידות בהצעה מסומנות "הונח". פרגולה, מים, חשמל וגז: דורש בעל מקצוע מוסמך.')
  return { elements, notes }
}

// אזורי ברירת מחדל לתכנון: משטחים רכים או אזורי גינה מההיתר, מהגדול לקטן
export function defaultZones(elements: Element[]): Surface[] {
  const soft: SurfaceMaterial[] = ['lawn', 'bed', 'turf', 'gravel', 'mulch', 'sand', 'pebbles']
  return elements
    .filter((e): e is Surface => e.kind === 'surface' && soft.includes(e.material))
    .filter((s) => Math.abs(polyArea(surfacePoly(s))) >= 6)
    .sort((a, b) => Math.abs(polyArea(surfacePoly(b))) - Math.abs(polyArea(surfacePoly(a))))
}
