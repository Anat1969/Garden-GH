import type { Pt } from './types'

export function polyArea(p: Pt[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length]
    a += p[i].x * q.y - q.x * p[i].y
  }
  return a / 2
}

export function bbox(p: Pt[]) {
  const xs = p.map((v) => v.x)
  const ys = p.map((v) => v.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

// הסטת מצולע פנימה במרחק d (קו מרכז של קיר שעוביו 2d, מתוך הפאה החיצונית)
export function insetPolygon(p: Pt[], d: number): Pt[] {
  const n = p.length
  if (n < 3) return p
  const sign = polyArea(p) > 0 ? 1 : -1 // בצירי מסך (y למטה) חיובי = עם כיוון השעון
  const lines = p.map((a, i) => {
    const b = p[(i + 1) % n]
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    // נורמל פנימי
    const nx = (-(b.y - a.y) / L) * sign
    const ny = ((b.x - a.x) / L) * sign
    return { a: { x: a.x + nx * d, y: a.y + ny * d }, b: { x: b.x + nx * d, y: b.y + ny * d } }
  })
  return lines.map((l, i) => {
    const prev = lines[(i - 1 + n) % n]
    return intersect(prev.a, prev.b, l.a, l.b) ?? l.a
  })
}

function intersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x)
  if (Math.abs(den) < 1e-9) return null
  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }
}

export function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

// הסרת נקודות כמעט כפולות או קוליניאריות
export function simplify(p: Pt[], tol: number): Pt[] {
  const out: Pt[] = []
  for (const v of p) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(v.x - last.x, v.y - last.y) > tol) out.push(v)
  }
  if (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= tol) out.pop()
  return out
}
