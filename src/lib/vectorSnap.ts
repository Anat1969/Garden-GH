import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Box, Pt } from './types'
import { extractSegments, type Seg } from './pdf'

// הצמדה לקווים הווקטוריים, בשיטת פרויקט התאנה: הבינה אומרת מה השרטוט ואיפה בערך עובר הקיר,
// והקו הווקטורי של ההיתר קובע איפה הוא עובר בדיוק. קובץ שיצא מתוכנת שרטוט מדויק עד המילימטר, ולכן אין סיבה לנחש מתמונה.
// קיר מזוהה כזוג קווים מקבילים (פאה חיצונית ופנימית). קו מידה או קו בניין בודדים אינם קיר, ולא מצמידים אליהם.

const cache = new WeakMap<PDFDocumentProxy, Map<number, Promise<Seg[]>>>()
export function pageSegments(doc: PDFDocumentProxy, pageNo: number): Promise<Seg[]> {
  let m = cache.get(doc)
  if (!m) cache.set(doc, (m = new Map()))
  let p = m.get(pageNo)
  if (!p) m.set(pageNo, (p = doc.getPage(pageNo).then(extractSegments).then((e) => e.lines)))
  return p
}

export const segsIn = (segs: Seg[], b: Box) => segs.filter((s) => Math.max(s.x1, s.x2) >= b.x && Math.min(s.x1, s.x2) <= b.x + b.w && Math.max(s.y1, s.y2) >= b.y && Math.min(s.y1, s.y2) <= b.y + b.h)

function inside(p: Pt, poly: Pt[]) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

interface Line {
  p: Pt
  u: Pt
}
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x
function meet(a: Line, b: Line): Pt | null {
  const d = cross(a.u, b.u)
  if (Math.abs(d) < 0.03) return null
  const t = cross({ x: b.p.x - a.p.x, y: b.p.y - a.p.y }, b.u) / d
  return { x: a.p.x + a.u.x * t, y: a.p.y + a.u.y * t }
}

export interface SnapResult {
  poly: Pt[]
  snapped: number
  edges: number
}

// tol: כמה רחוק מהקו של הבינה מחפשים, ביחידות העמוד. wallMin, wallMax: עובי קיר סביר, ביחידות העמוד.
export function snapPolygon(poly: Pt[], segs: Seg[], tol: number, wallMin: number, wallMax: number): SnapResult {
  const n = poly.length
  if (n < 3) return { poly, snapped: 0, edges: n }
  const bin = Math.max(0.25, wallMin / 6)
  const lines: Line[] = []
  let snapped = 0
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    const u = { x: (b.x - a.x) / (L || 1), y: (b.y - a.y) / (L || 1) }
    let nr = { x: u.y, y: -u.x }
    if (inside({ x: (a.x + b.x) / 2 + nr.x * 0.5, y: (a.y + b.y) / 2 + nr.y * 0.5 }, poly)) nr = { x: -nr.x, y: -nr.y }
    lines.push({ p: a, u })
    if (L < wallMax) continue
    // כיסוי לפי היסט: כמה מאורך הצלע מכוסה בקווים מקבילים בכל מרחק ממנה
    const cov = new Map<number, { len: number; best: Seg; bestLen: number }>()
    for (const s of segs) {
      const dx = s.x2 - s.x1
      const dy = s.y2 - s.y1
      const sl = Math.hypot(dx, dy)
      if (sl < 1) continue
      if (Math.abs(cross(u, { x: dx / sl, y: dy / sl })) > 0.035) continue // מעל 2 מעלות: לא מקביל
      const mx = (s.x1 + s.x2) / 2 - a.x
      const my = (s.y1 + s.y2) / 2 - a.y
      const d = mx * nr.x + my * nr.y
      if (Math.abs(d) > tol) continue
      const t1 = (s.x1 - a.x) * u.x + (s.y1 - a.y) * u.y
      const t2 = (s.x2 - a.x) * u.x + (s.y2 - a.y) * u.y
      const ov = Math.min(L, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2))
      if (ov <= 0) continue
      const k = Math.round(d / bin)
      const c = cov.get(k)
      if (!c) cov.set(k, { len: ov, best: s, bestLen: sl })
      else {
        c.len += ov
        if (sl > c.bestLen) (c.best = s), (c.bestLen = sl)
      }
    }
    const at = (k: number) => Math.min(L, (cov.get(k)?.len ?? 0) + (cov.get(k - 1)?.len ?? 0) * 0.5 + (cov.get(k + 1)?.len ?? 0) * 0.5)
    // מועמד: קו שמכסה לפחות חצי מהצלע, ויש לו בן זוג פנימי במרחק של עובי קיר.
    // מבין המועמדים נבחר הקרוב ביותר לקו של הבינה: שרשראות מידה הן גם זוגות קווים, אבל הן רחוקות יותר מהקיר.
    let pick: number | null = null
    for (const k of [...cov.keys()].sort((p, q) => Math.abs(p) - Math.abs(q))) {
      const c = at(k)
      if (c < L * 0.5) continue
      let twin = false
      for (let t = Math.round(wallMin / bin); t <= Math.round(wallMax / bin) && !twin; t++) if (at(k - t) >= c * 0.5) twin = true
      if (twin) {
        pick = k
        break
      }
    }
    if (pick === null) continue
    const s = cov.get(pick)!.best
    const sl = Math.hypot(s.x2 - s.x1, s.y2 - s.y1)
    let su = { x: (s.x2 - s.x1) / sl, y: (s.y2 - s.y1) / sl }
    if (su.x * u.x + su.y * u.y < 0) su = { x: -su.x, y: -su.y }
    lines[i] = { p: { x: s.x1, y: s.y1 }, u: su }
    snapped++
  }
  if (!snapped) return { poly, snapped: 0, edges: n }
  // הקודקודים: מפגש של שתי צלעות סמוכות. קודקוד שברח רחוק מדי נשאר במקומו.
  const out = poly.map((v, i) => {
    const m = meet(lines[(i + n - 1) % n], lines[i])
    return m && Math.hypot(m.x - v.x, m.y - v.y) <= tol * 2.5 ? m : v
  })
  return { poly: out, snapped, edges: n }
}

// פתח מוצמד כיחידה אחת לצלע הקרובה למרכזו: שני הקצוות על אותו קיר, כדי שהפתח יישב בתוך הקיר ולא יחצה פינה
export function snapOpening(a: Pt, b: Pt, polys: Pt[][], tol: number): { a: Pt; b: Pt } {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  let best: { p: Pt; q: Pt } | null = null
  let bd = tol
  for (const poly of polys)
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const L2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
      if (!L2) continue
      const t = Math.min(1, Math.max(0, ((m.x - p.x) * (q.x - p.x) + (m.y - p.y) * (q.y - p.y)) / L2))
      const d = Math.hypot(p.x + (q.x - p.x) * t - m.x, p.y + (q.y - p.y) * t - m.y)
      if (d < bd) (bd = d), (best = { p, q })
    }
  if (!best) return { a, b }
  const { p, q } = best
  const L2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
  const on = (v: Pt): Pt => {
    const t = Math.min(1, Math.max(0, ((v.x - p.x) * (q.x - p.x) + (v.y - p.y) * (q.y - p.y)) / L2))
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }
  }
  return { a: on(a), b: on(b) }
}
