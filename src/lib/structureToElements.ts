import type { Element, Fence, Opening, Project, Pt, Surface, SurfaceMaterial, Wall } from './types'
import { bbox, insetPolygon, pointInPoly, simplify } from './geom'

export const STRUCT_SRC = 'קריאת מבנה'
export const VECTOR_SRC = 'זיהוי וקטורי'

// אלמנטים של הבית שנבנו אוטומטית (מזיהוי וקטורי או מקריאת מבנה). בנייה חוזרת מחליפה את כולם, כדי שלא ייווצר מודל על מודל
export const isAutoHouse = (e: Element) =>
  (e.source.includes(VECTOR_SRC) || e.source.startsWith(STRUCT_SRC)) && ((e.kind === 'wall' && e.scope === 'house') || e.kind === 'opening')

// כשבונים מחדש מקריאת המבנה מוחלפים גם גבול המגרש ואזורי הגינה שנבנו ממנה. מה ששורטט ידנית נשאר
export function replaceAuto(elements: Element[], fresh: Element[], alsoStructure: boolean): Element[] {
  const drop = (e: Element) => isAutoHouse(e) || (alsoStructure && e.source.startsWith(STRUCT_SRC))
  const keep = elements.filter((e) => !drop(e))
  const ids = new Set(keep.map((e) => e.id))
  return [...keep.filter((e) => e.kind !== 'opening' || ids.has(e.wallId)), ...fresh]
}

const MATERIAL: Record<string, SurfaceMaterial | null> = {
  lawn: 'lawn',
  paving: 'paving',
  path: 'paving',
  stairs: 'paving',
  parking: 'paving',
  planting: 'bed',
  deck: 'deck',
  gravel: 'gravel',
  pool: null,
  other: null,
}

// המפלס המוחלט של ±0.00: מהחתכים, מהיחידה, או מסימון מפלס בתוכנית
export function baseAbs(p: Project): number | null {
  const s = p.permit?.structure
  return (
    p.building?.baseAbs ??
    s?.units.find((u) => u.levelAbs)?.levelAbs ??
    s?.levels.find((l) => l.rel !== null && Math.abs(l.rel) < 0.005 && l.abs)?.abs ??
    null
  )
}

export function structureToElements(p: Project, newId: () => string): Element[] {
  const s = p.permit?.structure
  const mpp = p.permit?.scale.metersPerPt
  if (!s || !mpp) return []
  const title = p.permit?.drawings?.find((d) => d.id === s.drawingId)?.title ?? 'תוכנית'
  const src = `${STRUCT_SRC}: ${title}`
  const M = (v: Pt): Pt => ({ x: v.x * mpp, y: v.y * mpp })
  const base = baseAbs(p)
  const groundH = p.building?.groundHeight ?? 3
  const out: Element[] = []
  const walls: Wall[] = []

  for (const u of s.units) {
    const t = u.wallCm / 100
    const outer = simplify(u.footprint.map(M), 0.05)
    if (outer.length < 3) continue
    const center = insetPolygon(outer, t / 2)
    for (let i = 0; i < center.length; i++) {
      const a = center[i]
      const b = center[(i + 1) % center.length]
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.2) continue
      const w: Wall = { id: newId(), kind: 'wall', scope: 'house', x1: r2(a.x), y1: r2(a.y), x2: r2(b.x), y2: r2(b.y), thickness: t, height: groundH, label: 'estimated', source: src, approved: false }
      walls.push(w)
      out.push(w)
    }
  }

  for (const o of s.openings) {
    const a = M(o.a)
    const b = M(o.b)
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    let best: { w: Wall; dist: number } | null = null
    for (const w of walls) {
      const d = distToSeg(mid, w)
      if (!best || d < best.dist) best = { w, dist: d }
    }
    if (!best || best.dist > 0.6) continue
    const w = best.w
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1)
    const ta = along(a, w)
    const tb = along(b, w)
    const start = Math.max(0, Math.min(ta, tb))
    const width = Math.min(L - start, Math.abs(tb - ta))
    if (width < 0.4) continue
    const door = o.type === 'door' || o.type === 'sliding_door' || o.type === 'opening'
    const op: Opening = {
      id: newId(),
      kind: 'opening',
      wallId: w.id,
      type: door ? 'door' : 'window',
      offset: r2(start),
      width: r2(width),
      height: door ? 2.2 : 1.3,
      sill: door ? 0 : 0.9,
      label: 'estimated',
      source: src,
      approved: false,
    }
    out.push(op)
  }

  const plot = simplify(s.plot.map(M), 0.1)
  for (let i = 0; i < plot.length && plot.length >= 3; i++) {
    const a = plot[i]
    const b = plot[(i + 1) % plot.length]
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.3) continue
    const f: Fence = { id: newId(), kind: 'fence', x1: r2(a.x), y1: r2(a.y), x2: r2(b.x), y2: r2(b.y), height: 1.2, boundary: true, label: 'estimated', source: src, approved: false }
    out.push(f)
  }

  for (const rw of s.retaining) {
    const a = M(rw.a)
    const b = M(rw.b)
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5) continue
    out.push({ id: newId(), kind: 'wall', scope: 'garden', x1: r2(a.x), y1: r2(a.y), x2: r2(b.x), y2: r2(b.y), thickness: 0.2, height: 1, label: 'estimated', source: `${src} (${rw.label || 'קיר פיתוח'})`, approved: false })
  }

  for (const z of s.zones) {
    const mat = MATERIAL[z.kind]
    if (!mat) continue
    const poly = simplify(z.polygon.map(M), 0.05)
    if (poly.length < 3) continue
    let abs = z.levelAbs
    if (abs === null) abs = s.levels.find((l) => l.abs && pointInPoly(l.at, z.polygon))?.abs ?? null
    const level = abs !== null && base !== null ? r2(abs - base) : 0
    const bb = bbox(poly)
    const sf: Surface = {
      id: newId(),
      kind: 'surface',
      material: mat,
      poly: poly.map((v) => ({ x: r2(v.x), y: r2(v.y) })),
      x: r2(bb.x),
      y: r2(bb.y),
      w: r2(bb.w),
      d: r2(bb.h),
      level,
      label: 'estimated',
      source: `${src}${z.label ? ` (${z.label})` : ''}`,
      approved: false,
    }
    out.push(sf)
  }
  return out
}

function distToSeg(p: Pt, w: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = w.x2 - w.x1
  const dy = w.y2 - w.y1
  const L2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / L2))
  return Math.hypot(p.x - (w.x1 + t * dx), p.y - (w.y1 + t * dy))
}

function along(p: Pt, w: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = w.x2 - w.x1
  const dy = w.y2 - w.y1
  const L = Math.hypot(dx, dy) || 1
  return ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / L
}

const r2 = (v: number) => Math.round(v * 100) / 100

// מצולעי היחידות במטרים, מתוך קריאת המבנה
export function unitFootprints(p: Project): Pt[][] {
  const s = p.permit?.structure
  const mpp = p.permit?.scale.metersPerPt
  if (!s || !mpp) return []
  return s.units.map((u) => simplify(u.footprint.map((v) => ({ x: v.x * mpp, y: v.y * mpp })), 0.05)).filter((f) => f.length >= 3)
}
