import polygonClipping from 'polygon-clipping'
import type { Element, Pt, Surface } from './types'

// נקודות מייצגות של אלמנט, לחישוב גבולות ולהתאמת תצוגה
export function elementPoints(e: Element): Pt[] {
  switch (e.kind) {
    case 'wall':
    case 'fence':
      return [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }]
    case 'surface':
      return e.poly ?? [{ x: e.x, y: e.y }, { x: e.x + e.w, y: e.y + e.d }]
    case 'object':
      return [{ x: e.x - e.w / 2, y: e.y - e.d / 2 }, { x: e.x + e.w / 2, y: e.y + e.d / 2 }]
    case 'line':
    case 'sketch':
      return e.pts
    case 'opening':
      return []
  }
}

export function boundsOf(elements: Element[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const e of elements)
    for (const p of elementPoints(e)) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
    }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null
}

const sp = (pts: Pt[], k: number) => pts.map((p) => ({ x: p.x * k, y: p.y * k }))

export function scaleElement(e: Element, k: number): Element {
  switch (e.kind) {
    case 'wall':
      return { ...e, x1: e.x1 * k, y1: e.y1 * k, x2: e.x2 * k, y2: e.y2 * k, thickness: e.thickness * k }
    case 'fence':
      return { ...e, x1: e.x1 * k, y1: e.y1 * k, x2: e.x2 * k, y2: e.y2 * k }
    case 'surface':
      return { ...e, x: e.x * k, y: e.y * k, w: e.w * k, d: e.d * k, poly: e.poly ? sp(e.poly, k) : undefined }
    case 'opening':
      return { ...e, offset: e.offset * k, width: e.width * k }
    case 'object':
      return { ...e, x: e.x * k, y: e.y * k }
    case 'line':
    case 'sketch':
      return { ...e, pts: sp(e.pts, k) }
  }
}

// הזזה של אלמנט (גרירה בכלי הבחירה)
export function moveElement(e: Element, dx: number, dy: number): Element {
  const mp = (pts: Pt[]) => pts.map((p) => ({ x: p.x + dx, y: p.y + dy }))
  switch (e.kind) {
    case 'wall':
    case 'fence':
      return { ...e, x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy }
    case 'surface':
      return { ...e, x: e.x + dx, y: e.y + dy, poly: e.poly ? mp(e.poly) : undefined }
    case 'object':
      return { ...e, x: e.x + dx, y: e.y + dy }
    case 'line':
    case 'sketch':
      return { ...e, pts: mp(e.pts) }
    case 'opening':
      return e
  }
}

// פישוט קו חופשי (Ramer-Douglas-Peucker)
export function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts
  const a = pts[0]
  const b = pts[pts.length - 1]
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1e-9
  let maxD = 0
  let idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((b.y - a.y) * pts[i].x - (b.x - a.x) * pts[i].y + b.x * a.y - b.y * a.x) / L
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD <= eps) return [a, b]
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)]
}

// ---------- הצמדה (snap) ----------

export interface SnapSet {
  pts: Pt[]
  segs: [Pt, Pt][]
}

// קודקודים וצלעות של כל האלמנטים, חוץ מאלמנט שמוחרג (זה שנגרר)
export function snapSet(elements: Element[], exclude?: string): SnapSet {
  const pts: Pt[] = []
  const segs: [Pt, Pt][] = []
  for (const e of elements) {
    if (e.id === exclude) continue
    switch (e.kind) {
      case 'wall':
      case 'fence': {
        const a = { x: e.x1, y: e.y1 }
        const b = { x: e.x2, y: e.y2 }
        pts.push(a, b)
        segs.push([a, b])
        break
      }
      case 'surface': {
        const p = surfacePoly(e)
        pts.push(...p)
        p.forEach((v, i) => segs.push([v, p[(i + 1) % p.length]]))
        break
      }
      case 'line':
        pts.push(...e.pts)
        for (let i = 1; i < e.pts.length; i++) segs.push([e.pts[i - 1], e.pts[i]])
        break
      case 'object':
        pts.push({ x: e.x, y: e.y })
        break
    }
  }
  return { pts, segs }
}

function projectOnSeg(p: Pt, a: Pt, b: Pt): { q: Pt; d: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L2 = dx * dx + dy * dy || 1e-12
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
  const q = { x: a.x + t * dx, y: a.y + t * dy }
  return { q, d: Math.hypot(p.x - q.x, p.y - q.y) }
}

// נקודה נצמדת לקודקוד קרוב, ואם אין, לצלע קרובה. מחזירה גם את סוג ההצמדה לתצוגה
export function snapTo(p: Pt, set: SnapSet, tol: number): { p: Pt; kind: 'vertex' | 'edge' } | null {
  let best: Pt | null = null
  let bd = tol
  for (const v of set.pts) {
    const d = Math.hypot(v.x - p.x, v.y - p.y)
    if (d < bd) {
      bd = d
      best = v
    }
  }
  if (best) return { p: { ...best }, kind: 'vertex' }
  let bq: Pt | null = null
  bd = tol * 0.8
  for (const [a, b] of set.segs) {
    const { q, d } = projectOnSeg(p, a, b)
    if (d < bd) {
      bd = d
      bq = q
    }
  }
  return bq ? { p: bq, kind: 'edge' } : null
}

// היסט הצמדה לאלמנט נגרר: הקודקוד שלו שהכי קרוב לקודקוד של אחר מושך את כל האלמנט
export function snapMove(e: Element, dx: number, dy: number, set: SnapSet, tol: number): { dx: number; dy: number; at: Pt | null } {
  const own = e.kind === 'object' ? [{ x: e.x, y: e.y }, ...elementPoints(e)] : elementPoints(e)
  let best: { dx: number; dy: number; d: number; at: Pt } | null = null
  for (const o of own) {
    const p = { x: o.x + dx, y: o.y + dy }
    for (const v of set.pts) {
      const d = Math.hypot(v.x - p.x, v.y - p.y)
      if (d < tol && (!best || d < best.d)) best = { dx: dx + v.x - p.x, dy: dy + v.y - p.y, d, at: v }
    }
  }
  return best ? { dx: best.dx, dy: best.dy, at: best.at } : { dx, dy, at: null }
}

// ---------- משטחים ----------

export function surfacePoly(s: { poly?: Pt[]; x: number; y: number; w: number; d: number }): Pt[] {
  return s.poly && s.poly.length >= 3
    ? s.poly
    : [
        { x: s.x, y: s.y },
        { x: s.x + s.w, y: s.y },
        { x: s.x + s.w, y: s.y + s.d },
        { x: s.x, y: s.y + s.d },
      ]
}

function withPoly(s: Surface, poly: Pt[]): Surface {
  const xs = poly.map((p) => p.x)
  const ys = poly.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { ...s, poly, x, y, w: Math.max(...xs) - x, d: Math.max(...ys) - y }
}

// הסרת קודקודים כפולים או על קו ישר בין שכניהם, במצולע סגור
export function dropCollinear(p: Pt[], eps = 0.005): Pt[] {
  let pts = p.filter((v, i) => {
    const n = p[(i + 1) % p.length]
    return Math.hypot(n.x - v.x, n.y - v.y) > 1e-6
  })
  let changed = true
  while (changed && pts.length > 3) {
    changed = false
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length]
      const b = pts[i]
      const c = pts[(i + 1) % pts.length]
      const L = Math.hypot(c.x - a.x, c.y - a.y) || 1e-9
      const d = Math.abs((c.x - a.x) * (a.y - b.y) - (a.x - b.x) * (c.y - a.y)) / L
      if (d < eps) {
        pts = pts.filter((_, j) => j !== i)
        changed = true
        break
      }
    }
  }
  return pts
}

// חיבור משטח למשטחים נוגעים או חופפים מאותו חומר ובאותו מפלס. מחזיר את המשטח המאוחד ואת מה שנבלע בו
export function mergeSameMaterial(elements: Element[], id: string): { merged: Surface; removed: string[] } | null {
  const s = elements.find((e): e is Surface => e.id === id && e.kind === 'surface')
  if (!s) return null
  const ring = (p: Pt[]): [number, number][] => p.map((v) => [v.x, v.y])
  let current: Pt[] = surfacePoly(s)
  const removed: string[] = []
  const others = elements.filter((e): e is Surface => e.kind === 'surface' && e.id !== id && e.material === s.material && Math.abs(e.level - s.level) < 0.01 && (e.color ?? '') === (s.color ?? ''))
  let changed = true
  while (changed) {
    changed = false
    for (const o of others) {
      if (removed.includes(o.id)) continue
      let u: ReturnType<typeof polygonClipping.union>
      try {
        u = polygonClipping.union([ring(current)], [ring(surfacePoly(o))])
      } catch {
        continue
      }
      // מתחברים רק אם יצא מצולע אחד בלי חורים
      if (u.length === 1 && u[0].length === 1) {
        const outer = u[0][0].slice(0, -1).map(([x, y]) => ({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }))
        current = dropCollinear(outer)
        removed.push(o.id)
        changed = true
      }
    }
  }
  if (!removed.length) return null
  return { merged: withPoly(s, current), removed }
}

// שינוי אורך צלע i במצולע: הקודקוד שבסוף הצלע זז לאורך הכיוון שלה. אם הצלע הבאה ניצבת, גם הקודקוד שאחריה זז, כך שמלבן נשאר מלבן
export function setEdgeLength(poly: Pt[], i: number, L: number, closed = true): Pt[] {
  const n = poly.length
  const a = poly[i]
  const j = closed ? (i + 1) % n : i + 1
  const b = poly[j]
  if (!b) return poly
  const cur = Math.hypot(b.x - a.x, b.y - a.y) || 1e-9
  const ux = (b.x - a.x) / cur
  const uy = (b.y - a.y) / cur
  const dx = ux * (L - cur)
  const dy = uy * (L - cur)
  const out = poly.map((p) => ({ ...p }))
  if (!closed) {
    // קו פתוח: כל הנקודות מ-j והלאה זזות יחד
    for (let k = j; k < n; k++) out[k] = { x: out[k].x + dx, y: out[k].y + dy }
    return out
  }
  out[j] = { x: b.x + dx, y: b.y + dy }
  const k2 = (j + 1) % n
  if (k2 !== i) {
    const c = poly[k2]
    const vx = c.x - b.x
    const vy = c.y - b.y
    const vl = Math.hypot(vx, vy) || 1e-9
    if (Math.abs((vx * ux + vy * uy) / vl) < 0.2) out[k2] = { x: c.x + dx, y: c.y + dy }
  }
  return out
}

export function surfaceWithEdge(s: Surface, i: number, L: number): Surface {
  return withPoly(s, setEdgeLength(surfacePoly(s), i, L).map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })))
}

// ---------- שכפול וסיבוב ----------

export function rotateElement(e: Element, deg: number): Element {
  const c = (() => {
    const b = boundsOf([e])
    return b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : { x: 0, y: 0 }
  })()
  const r = (deg * Math.PI) / 180
  const rot = (p: Pt) => ({ x: Math.round((c.x + (p.x - c.x) * Math.cos(r) - (p.y - c.y) * Math.sin(r)) * 100) / 100, y: Math.round((c.y + (p.x - c.x) * Math.sin(r) + (p.y - c.y) * Math.cos(r)) * 100) / 100 })
  switch (e.kind) {
    case 'object':
      return { ...e, rot: (((e.rot + deg) % 360) + 360) % 360 }
    case 'surface':
      return withPoly(e, surfacePoly(e).map(rot))
    case 'line':
    case 'sketch':
      return { ...e, pts: e.pts.map(rot) }
    case 'wall':
    case 'fence': {
      const a = rot({ x: e.x1, y: e.y1 })
      const b = rot({ x: e.x2, y: e.y2 })
      return { ...e, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
    }
    default:
      return e
  }
}

// ---------- ידיות עריכה ----------

// נקודות הידיות של אלמנט: קודקודי משטח, נקודות קו, קצוות קיר וגדר, ופינת שינוי גודל לפריט
export function handlePoints(e: Element): Pt[] {
  switch (e.kind) {
    case 'surface':
      return surfacePoly(e)
    case 'line':
    case 'sketch':
      return e.pts
    case 'wall':
    case 'fence':
      return [
        { x: e.x1, y: e.y1 },
        { x: e.x2, y: e.y2 },
      ]
    case 'object':
      return [{ x: e.x + e.w / 2, y: e.y + e.d / 2 }]
    default:
      return []
  }
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function setVertex(e: Element, i: number, p: Pt): Element {
  const q = { x: r2(p.x), y: r2(p.y) }
  switch (e.kind) {
    case 'surface': {
      const poly = surfacePoly(e).map((v, j) => (j === i ? q : v))
      return withPoly(e, poly)
    }
    case 'line':
    case 'sketch':
      return { ...e, pts: e.pts.map((v, j) => (j === i ? q : v)) }
    case 'wall':
    case 'fence':
      return i === 0 ? { ...e, x1: q.x, y1: q.y } : { ...e, x2: q.x, y2: q.y }
    case 'object':
      return { ...e, w: Math.max(0.1, r2(Math.abs(q.x - e.x) * 2)), d: Math.max(0.1, r2(Math.abs(q.y - e.y) * 2)) }
    default:
      return e
  }
}
