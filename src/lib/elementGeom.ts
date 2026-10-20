import type { Element, Pt } from './types'

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
