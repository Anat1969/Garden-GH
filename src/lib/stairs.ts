// מדרגות: משטח עם מפלס עליון ותחתון וכיוון ירידה. מקור אחד לחלוקה למדרגות,
// בתוכנית (קווי שלח וחץ "עולה", כמו בשרטוט) ובמודל (מדרגות מוצקות).
import type { Pt, Surface } from './types'

export interface StairStep {
  poly: Pt[] // השלח במטרים
  top: number // מפלס עליון של השלח, יחסי ל-±0.00
}
export interface StairPlan {
  steps: StairStep[]
  riser: number
  tread: number
  count: number
  bottom: number
  axis: { a: Pt; b: Pt } // קו מרכז מלמטה (a) למעלה (b), לחץ "עולה"
}

const RISER = 0.16 // רום מדרגה נוח לגינה
const MIN_TREAD = 0.28

// חיתוך מצולע בחצי מישור (Sutherland-Hodgman): שומר את הנקודות שבהן dot(p,d) בין t0 ל-t1
function clipStrip(poly: Pt[], d: Pt, t0: number, t1: number): Pt[] {
  const half = (pts: Pt[], keep: (t: number) => boolean, edge: number) => {
    const out: Pt[] = []
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const q = pts[(i + 1) % pts.length]
      const tp = p.x * d.x + p.y * d.y
      const tq = q.x * d.x + q.y * d.y
      const ip = keep(tp)
      const iq = keep(tq)
      if (ip) out.push(p)
      if (ip !== iq) {
        const f = (edge - tp) / (tq - tp)
        out.push({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f })
      }
    }
    return out
  }
  return half(half(poly, (t) => t >= t0, t0), (t) => t <= t1, t1)
}

export function stairPlan(s: Surface): StairPlan | null {
  if (!s.stairs) return null
  const poly = s.poly ?? [
    { x: s.x, y: s.y },
    { x: s.x + s.w, y: s.y },
    { x: s.x + s.w, y: s.y + s.d },
    { x: s.x, y: s.y + s.d },
  ]
  const L0 = Math.hypot(s.stairs.dir.x, s.stairs.dir.y) || 1
  const d = { x: s.stairs.dir.x / L0, y: s.stairs.dir.y / L0 }
  const ts = poly.map((p) => p.x * d.x + p.y * d.y)
  const tMin = Math.min(...ts)
  const tMax = Math.max(...ts)
  const run = tMax - tMin
  const drop = s.level - s.stairs.bottom
  if (run < 0.3 || drop <= 0.02) return null
  // מספר מדרגות לפי רום נוח, ולא יותר ממה שהאורך מאפשר עם שלח מינימלי
  let count = Math.max(1, Math.round(drop / RISER))
  count = Math.min(count, Math.max(1, Math.floor(run / MIN_TREAD)))
  const tread = run / count
  const riser = drop / count
  const steps: StairStep[] = []
  for (let i = 0; i < count; i++) {
    const p = clipStrip(poly, d, tMin + i * tread, tMin + (i + 1) * tread)
    if (p.length >= 3) steps.push({ poly: p, top: s.level - i * riser })
  }
  // קו מרכז: ממוצע הנקודות בניצב לכיוון
  const n = { x: -d.y, y: d.x }
  const ns = poly.map((p) => p.x * n.x + p.y * n.y)
  const c = (Math.min(...ns) + Math.max(...ns)) / 2
  const at = (t: number): Pt => ({ x: d.x * t + n.x * c, y: d.y * t + n.y * c })
  return { steps, riser, tread, count, bottom: s.stairs.bottom, axis: { a: at(tMax - tread * 0.4), b: at(tMin + tread * 0.4) } }
}
