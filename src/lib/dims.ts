import * as pdfjs from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { DimScale, Element, PlanDimension, Project, ScaleInfo } from './types'
import { PT_TO_M_AT_1, type Seg } from './pdf'

// ---------- פענוח טקסט של מידה ----------

export interface ParsedDim {
  value: number
  unit: 'cm' | 'm' | 'mm'
  kind: 'length' | 'level'
  relative: boolean
}

// מוסכמות היתרים בישראל: אורכים בס"מ (526), מפלסים במטרים (699.00, ±0.00, +0.40).
export function parseDimText(raw: string): ParsedDim | null {
  const t = raw.replace(/\s+/g, '').replace(/,/g, '.').replace(/[‎‏]/g, '')
  if (!t || /[:/]/.test(t)) return null
  const level = /^(±|\+|-|−)(\d{1,3}\.\d{2})$/.exec(t)
  if (level) {
    const sign = level[1] === '-' || level[1] === '−' ? -1 : 1
    const v = sign * Number(level[2])
    return { value: v, unit: 'm', kind: 'level', relative: Math.abs(v) < 20 }
  }
  const m = /^(\d{1,4})(?:\.(\d{1,3}))?$/.exec(t)
  if (!m) return null
  const n = Number(t)
  if (m[2] !== undefined) {
    // 699.00 = מפלס מוחלט; 5.26 = אורך במטרים
    if (n >= 100 && m[2].length === 2) return { value: n, unit: 'm', kind: 'level', relative: false }
    if (n > 0 && n < 100 && m[2].length === 2) return { value: n, unit: 'm', kind: 'length', relative: false }
    if (n >= 5 && n < 3000 && m[2].length === 1) return { value: n / 100, unit: 'cm', kind: 'length', relative: false }
    return null
  }
  if (n >= 5 && n <= 5000) return { value: n / 100, unit: 'cm', kind: 'length', relative: false }
  return null
}

// ---------- שכבת הטקסט של PDF וקטורי ----------

export async function extractTextDims(page: PDFPageProxy, pageNo: number, newId: () => string): Promise<PlanDimension[]> {
  const vp = page.getViewport({ scale: 1 })
  const tc = await page.getTextContent()
  const out: PlanDimension[] = []
  for (const it of tc.items) {
    if (!('str' in it) || !it.str.trim()) continue
    const parsed = parseDimText(it.str)
    if (!parsed) continue
    const tx = pdfjs.Util.transform(vp.transform, it.transform) as number[]
    const ang = Math.atan2(tx[1], tx[0])
    const fh = Math.hypot(tx[2], tx[3]) || 6
    const w = it.width || fh * it.str.length * 0.55
    const ux = Math.cos(ang)
    const uy = Math.sin(ang)
    // מלבן הטקסט: מקו הבסיס לאורך הכיוון, ולמעלה (בניצב) בגובה האות
    const nx = uy
    const ny = -ux
    const pts = [
      [tx[4], tx[5]],
      [tx[4] + ux * w, tx[5] + uy * w],
      [tx[4] + nx * fh, tx[5] + ny * fh],
      [tx[4] + ux * w + nx * fh, tx[5] + uy * w + ny * fh],
    ]
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const a = Math.abs(((ang % Math.PI) + Math.PI) % Math.PI)
    const orientation = a < 0.2 || a > Math.PI - 0.2 ? 'h' : Math.abs(a - Math.PI / 2) < 0.2 ? 'v' : 'other'
    out.push({
      id: newId(),
      page: pageNo,
      raw: it.str.trim(),
      ...parsed,
      orientation,
      box: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
      line: null,
      agrees: null,
      source: 'text-layer',
      confidence: 'high',
      status: 'pending',
    })
  }
  return out
}

// ---------- קווי מידה וקנה מידה ----------

interface Candidate {
  line: { x1: number; y1: number; x2: number; y2: number }
  mpp: number
}

// קו מידה: קו מקביל לטקסט וקרוב אליו. בשרשרת מידות הקו רציף, לכן תחום המידה הוא הקטע
// שבין שתי שנתות (או קווי עזר) סמוכות שחוצות את הקו, משני צדי מרכז הטקסט.
export function lineCandidates(d: PlanDimension, lines: Seg[]): Candidate[] {
  if (d.kind !== 'length' || d.orientation === 'other') return []
  const h = d.orientation === 'h'
  const cx = d.box.x + d.box.w / 2
  const cy = d.box.y + d.box.h / 2
  const th = h ? d.box.h : d.box.w
  const tl = h ? d.box.w : d.box.h
  const along = h ? cx : cy
  const found: { c: Candidate; dist: number }[] = []
  for (const s of lines) {
    const dx = s.x2 - s.x1
    const dy = s.y2 - s.y1
    const L = Math.hypot(dx, dy)
    if (L < tl * 1.05) continue
    if (h ? Math.abs(dy) > L * 0.02 : Math.abs(dx) > L * 0.02) continue
    const a = h ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2)
    const b = h ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2)
    if (along < a - th || along > b + th) continue
    const c = h ? (s.y1 + s.y2) / 2 : (s.x1 + s.x2) / 2
    const off = c - (h ? cy : cx)
    if (Math.abs(off) > th * 2.5) continue
    // נקודות חיתוך של שנתות וקווי עזר עם הקו
    const tol = Math.max(0.5, th * 0.15)
    const cuts = [a, b]
    for (const t of lines) {
      if (t === s) continue
      const tdx = t.x2 - t.x1
      const tdy = t.y2 - t.y1
      const tL = Math.hypot(tdx, tdy)
      if (h ? Math.abs(tdy) < tL * 0.2 : Math.abs(tdx) < tL * 0.2) continue // מקביל, לא חוצה
      const lo = h ? Math.min(t.y1, t.y2) : Math.min(t.x1, t.x2)
      const hi = h ? Math.max(t.y1, t.y2) : Math.max(t.x1, t.x2)
      if (c < lo - tol || c > hi + tol) continue
      const k = h ? (Math.abs(tdy) < 1e-9 ? 0 : (c - t.y1) / tdy) : Math.abs(tdx) < 1e-9 ? 0 : (c - t.x1) / tdx
      const p = h ? t.x1 + tdx * k : t.y1 + tdy * k
      if (p > a - tol && p < b + tol) cuts.push(p)
    }
    cuts.sort((p, q) => p - q)
    let lo = a
    let hi = b
    for (const p of cuts) {
      if (p <= along && p > lo) lo = p
      if (p >= along && p < hi) hi = p
    }
    const len = hi - lo
    if (len < tl * 0.9) continue
    const line = h ? { x1: lo, y1: c, x2: hi, y2: c } : { x1: c, y1: lo, x2: c, y2: hi }
    found.push({ c: { line, mpp: d.value / len }, dist: Math.abs(off) })
  }
  return found
    .sort((p, q) => p.dist - q.dist)
    .slice(0, 6)
    .map((f) => f.c)
}

// קנה המידה שרוב המידות מסכימות עליו (מצב בקנה לוגריתמי, סובלנות 2.5%)
export function inferScale(cands: Candidate[][]): { mpp: number; support: number; spread: number } | null {
  const all = cands.flat().map((c) => c.mpp)
  if (!all.length) return null
  let best = { mpp: 0, support: 0, spread: 1 }
  for (const v of all) {
    const hits: number[] = []
    for (const list of cands) {
      const m = list.find((c) => Math.abs(c.mpp / v - 1) < 0.025)
      if (m) hits.push(m.mpp)
    }
    if (hits.length > best.support) {
      hits.sort((a, b) => a - b)
      const med = hits[Math.floor(hits.length / 2)]
      const spread = hits.reduce((s, h) => s + Math.abs(h / med - 1), 0) / hits.length
      best = { mpp: med, support: hits.length, spread }
    }
  }
  return best.support ? best : null
}

// מצמיד לכל מידה את קו המידה שתואם לקנה המידה, ומחזיר את קנה המידה של העמוד
export function attachLines(dims: PlanDimension[], lines: Seg[], page: number): { dims: PlanDimension[]; scale: DimScale | null } {
  const onPage = dims.filter((d) => d.page === page && d.kind === 'length' && d.status !== 'rejected')
  const cands = onPage.map((d) => (d.source === 'ai' && d.line ? [{ line: d.line, mpp: d.value / segLen(d.line) }] : lineCandidates(d, lines)))
  const inf = inferScale(cands)
  const byId = new Map<string, PlanDimension>()
  onPage.forEach((d, i) => {
    if (!inf) {
      byId.set(d.id, { ...d, agrees: null })
      return
    }
    const best = cands[i].find((c) => Math.abs(c.mpp / inf.mpp - 1) < 0.03)
    byId.set(d.id, { ...d, line: best ? best.line : d.line, agrees: best ? true : cands[i].length ? false : null })
  })
  return {
    dims: dims.map((d) => byId.get(d.id) ?? d),
    scale: inf ? { page, metersPerPt: inf.mpp, support: inf.support, total: onPage.length, spread: inf.spread } : null,
  }
}

export const segLen = (l: { x1: number; y1: number; x2: number; y2: number }) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1) || 1e-9

// קנה מידה מהמידות בצורת 1:N כשמדובר ב-PDF (נקודה = 1/72 אינץ')
export const denFromMpp = (mpp: number) => mpp / PT_TO_M_AT_1

export function scaleAgreement(dimMpp: number, scale: ScaleInfo): number | null {
  if (!scale.metersPerPt) return null
  return dimMpp / scale.metersPerPt - 1
}

// מיזוג מידות חדשות עם קיימות: שומר החלטות משתמש, מסיר כפילויות לפי ערך ומיקום
export function mergeDims(existing: PlanDimension[], incoming: PlanDimension[]): PlanDimension[] {
  const out = [...existing]
  for (const d of incoming) {
    const cx = d.box.x + d.box.w / 2
    const cy = d.box.y + d.box.h / 2
    const dup = out.find(
      (e) =>
        e.page === d.page &&
        Math.abs(e.value - d.value) < 1e-6 &&
        Math.hypot(e.box.x + e.box.w / 2 - cx, e.box.y + e.box.h / 2 - cy) < Math.max(e.box.w, e.box.h, d.box.w, d.box.h) * 1.5,
    )
    if (!dup) out.push(d)
    else if (!dup.line && d.line) Object.assign(dup, { line: d.line })
  }
  return out
}

// ---------- שימוש במידות על אלמנטים ----------

export function elementLength(e: Element): number | null {
  if (e.kind === 'wall' || e.kind === 'fence') return Math.hypot(e.x2 - e.x1, e.y2 - e.y1)
  if (e.kind === 'opening') return e.width
  return null
}

// מידות מועמדות לאלמנט: בעמוד העבודה, קרובות במרחב ובאורך
export function dimsForElement(project: Project, e: Element, elements: Element[]): { d: PlanDimension; score: number }[] {
  const p = project.permit
  const mpp = p?.scale.metersPerPt
  if (!p?.dims || !mpp) return []
  const target = elementLength(e)
  if (target === null) return []
  let ex1: number, ey1: number, ex2: number, ey2: number
  if (e.kind === 'opening') {
    const w = elements.find((x) => x.id === e.wallId)
    if (!w || w.kind !== 'wall') return []
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1
    const ux = (w.x2 - w.x1) / L
    const uy = (w.y2 - w.y1) / L
    ex1 = w.x1 + ux * e.offset
    ey1 = w.y1 + uy * e.offset
    ex2 = ex1 + ux * e.width
    ey2 = ey1 + uy * e.width
  } else if (e.kind === 'wall' || e.kind === 'fence') {
    ;[ex1, ey1, ex2, ey2] = [e.x1, e.y1, e.x2, e.y2]
  } else return []
  const mx = (ex1 + ex2) / 2
  const my = (ey1 + ey2) / 2
  return p.dims
    .filter((d) => d.page === p.planPage && d.kind === 'length' && d.status !== 'rejected')
    .map((d) => {
      const cx = (d.line ? (d.line.x1 + d.line.x2) / 2 : d.box.x + d.box.w / 2) * mpp
      const cy = (d.line ? (d.line.y1 + d.line.y2) / 2 : d.box.y + d.box.h / 2) * mpp
      const dist = Math.hypot(cx - mx, cy - my)
      const rel = Math.abs(d.value - target) / Math.max(target, 0.1)
      return { d, score: dist + rel * 10 }
    })
    .filter((x) => x.score < 12)
    .sort((a, b) => a.score - b.score)
    .slice(0, 6)
}

export function dimLabelText(d: PlanDimension): string {
  if (d.kind === 'level') return d.relative ? `${d.value >= 0 ? '+' : ''}${d.value.toFixed(2)}` : d.value.toFixed(2)
  return `${d.value.toFixed(2)} מ'`
}

// ---------- ריצה על כל ההיתר ----------

export async function readTextLayerDims(
  doc: import('pdfjs-dist').PDFDocumentProxy,
  pageCount: number,
  newId: () => string,
  onPage?: (i: number) => void,
): Promise<{ dims: PlanDimension[]; dimScales: DimScale[] }> {
  const { extractSegments } = await import('./pdf')
  let dims: PlanDimension[] = []
  const dimScales: DimScale[] = []
  for (let i = 1; i <= Math.min(pageCount, 40); i++) {
    onPage?.(i)
    const page = await doc.getPage(i)
    const found = await extractTextDims(page, i, newId)
    if (!found.length) continue
    const segs = await extractSegments(page)
    const r = attachLines(found, segs.lines, i)
    dims = dims.concat(r.dims)
    if (r.scale) dimScales.push(r.scale)
  }
  return { dims, dimScales }
}

// קנה מידה מהמידות נחשב אמין כשלפחות 3 מידות מסכימות, ורובן
export const reliableDimScale = (s: DimScale | undefined) => Boolean(s && s.support >= 3 && s.support >= s.total * 0.5)
