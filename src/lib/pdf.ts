import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { Opening, PageKind, PermitPage, Wall } from './types'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export const PT_TO_M_AT_1 = 0.0254 / 72 // מטר לנקודה בקנה מידה 1:1

export async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  // pdf.js מעביר את הבאפר ל-worker, לכן עובדים על עותק.
  return pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise
}

// ---------- סיווג עמוד וקנה מידה ----------

const KEYWORDS: Record<Exclude<PageKind, 'other'>, string[]> = {
  plan: ['תכנית קומה', 'תוכנית קומה', 'קומת קרקע', 'קומה', 'מרתף', 'floor plan', 'ground floor', 'plan'],
  elevation: ['חזית', 'elevation'],
  section: ['חתך', 'section'],
  site: ['תשריט', 'מגרש', 'מפה מצבית', 'תכנית מדידה', 'סביבה', 'site plan', 'site', 'survey'],
}

const reverse = (s: string) => [...s].reverse().join('')

export function classifyText(text: string): PageKind {
  const t = text.toLowerCase()
  let best: PageKind = 'other'
  let bestScore = 0
  for (const [kind, words] of Object.entries(KEYWORDS) as [Exclude<PageKind, 'other'>, string[]][]) {
    let score = 0
    for (const w of words) {
      // טקסט עברי ב-PDF מגיע לעיתים בסדר הפוך (סדר חזותי)
      const re = new RegExp(escapeRe(w), 'g')
      const reR = new RegExp(escapeRe(reverse(w)), 'g')
      score += (t.match(re)?.length ?? 0) * (w.length > 6 ? 2 : 1)
      score += (t.match(reR)?.length ?? 0) * (w.length > 6 ? 2 : 1)
    }
    // "plan" מופיע גם ב-"site plan"; נותנים עדיפות לביטוי הארוך
    if (kind === 'plan' && /site plan/.test(t)) score -= 1
    if (score > bestScore) {
      bestScore = score
      best = kind
    }
  }
  return best
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const COMMON_DEN = [10, 20, 25, 50, 75, 100, 200, 250, 500, 1000, 1250, 2500]

export function findScale(text: string): number | null {
  const counts = new Map<number, number>()
  const re = /(?:^|[^\d.])1\s*:\s*(\d{1,4})(?![\d.])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const den = Number(m[1])
    if (COMMON_DEN.includes(den)) counts.set(den, (counts.get(den) ?? 0) + 1)
  }
  // גם בסדר הפוך: "100:1"
  const re2 = /(?:^|[^\d.])(\d{2,4})\s*:\s*1(?![\d.:])/g
  while ((m = re2.exec(text))) {
    const den = Number(m[1])
    if (COMMON_DEN.includes(den)) counts.set(den, (counts.get(den) ?? 0) + 1)
  }
  let best: number | null = null
  let bestN = 0
  counts.forEach((n, den) => {
    if (n > bestN) {
      bestN = n
      best = den
    }
  })
  return best
}

export async function analyzePages(doc: PDFDocumentProxy, onProgress?: (i: number) => void): Promise<PermitPage[]> {
  const pages: PermitPage[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    onProgress?.(i)
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    const text = tc.items.map((it) => ('str' in it ? it.str : '')).join(' ')
    const segs = await extractSegments(page)
    pages.push({
      index: i,
      kind: classifyText(text),
      scaleDen: findScale(text),
      widthPt: vp.width,
      heightPt: vp.height,
      vectorSegments: segs.lines.length,
      textSample: text.replace(/\s+/g, ' ').trim().slice(0, 160),
    })
  }
  return pages
}

export function pickPlanPage(pages: PermitPage[]): number {
  const plans = pages.filter((p) => p.kind === 'plan')
  const pool = plans.length ? plans : pages
  return [...pool].sort((a, b) => b.vectorSegments - a.vectorSegments)[0]?.index ?? 1
}

export async function renderPage(doc: PDFDocumentProxy, index: number, targetWidth: number): Promise<string> {
  const page = await doc.getPage(index)
  const vp1 = page.getViewport({ scale: 1 })
  const scale = Math.min(4, targetWidth / vp1.width)
  const vp = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(vp.width)
  canvas.height = Math.round(vp.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport: vp }).promise
  return canvas.toDataURL('image/png')
}

// ---------- חילוץ קווים וקטוריים ----------

type M = [number, number, number, number, number, number]
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
]
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

export interface Seg {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Extracted {
  lines: Seg[]
  arcs: { x: number; y: number; r: number }[]
}

export async function extractSegments(page: PDFPageProxy): Promise<Extracted> {
  const ops = await page.getOperatorList()
  const vp = page.getViewport({ scale: 1 })
  const OPS = pdfjs.OPS
  const lines: Seg[] = []
  const arcs: { x: number; y: number; r: number }[] = []
  let ctm: M = vp.transform as M
  const stack: M[] = []
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i]
    if (fn === OPS.save) stack.push(ctm)
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
    else if (fn === OPS.transform) ctm = mul(ctm, args as M)
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm)
      if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = mul(ctm, args[0] as M)
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm
    else if (fn === OPS.constructPath) {
      const subOps = args[0] as number[]
      const coords = args[1] as number[]
      let k = 0
      let cx = 0
      let cy = 0
      let sx = 0
      let sy = 0
      for (const op of subOps) {
        if (op === OPS.moveTo) {
          cx = coords[k++]
          cy = coords[k++]
          sx = cx
          sy = cy
        } else if (op === OPS.lineTo) {
          const nx = coords[k++]
          const ny = coords[k++]
          pushLine(lines, ctm, cx, cy, nx, ny)
          cx = nx
          cy = ny
        } else if (op === OPS.curveTo) {
          const x3 = coords[k + 4]
          const y3 = coords[k + 5]
          pushArc(arcs, ctm, cx, cy, x3, y3)
          k += 6
          cx = x3
          cy = y3
        } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
          const x3 = coords[k + 2]
          const y3 = coords[k + 3]
          pushArc(arcs, ctm, cx, cy, x3, y3)
          k += 4
          cx = x3
          cy = y3
        } else if (op === OPS.closePath) {
          pushLine(lines, ctm, cx, cy, sx, sy)
          cx = sx
          cy = sy
        } else if (op === OPS.rectangle) {
          const x = coords[k++]
          const y = coords[k++]
          const w = coords[k++]
          const h = coords[k++]
          pushLine(lines, ctm, x, y, x + w, y)
          pushLine(lines, ctm, x + w, y, x + w, y + h)
          pushLine(lines, ctm, x + w, y + h, x, y + h)
          pushLine(lines, ctm, x, y + h, x, y)
          cx = x
          cy = y
        }
      }
    }
  }
  return { lines, arcs }
}

function pushLine(out: Seg[], m: M, x1: number, y1: number, x2: number, y2: number) {
  const [a, b] = apply(m, x1, y1)
  const [c, d] = apply(m, x2, y2)
  if (Math.hypot(c - a, d - b) < 0.5) return
  out.push({ x1: a, y1: b, x2: c, y2: d })
}

function pushArc(out: { x: number; y: number; r: number }[], m: M, x0: number, y0: number, x3: number, y3: number) {
  const [a, b] = apply(m, x0, y0)
  const [c, d] = apply(m, x3, y3)
  out.push({ x: (a + c) / 2, y: (b + d) / 2, r: Math.hypot(c - a, d - b) })
}

// ---------- זיהוי קירות ופתחים ----------

interface Line1D {
  c: number // קואורדינטה קבועה (y לאופקי, x לאנכי)
  a: number // תחילה
  b: number // סוף
}

export interface Detection {
  walls: Wall[]
  openings: Opening[]
}

export function detectWalls(ex: Extracted, metersPerPt: number, newId: () => string, pageNo: number): Detection {
  const toM = (v: number) => v * metersPerPt
  const H: Line1D[] = []
  const V: Line1D[] = []
  for (const s of ex.lines) {
    const dx = toM(s.x2 - s.x1)
    const dy = toM(s.y2 - s.y1)
    const len = Math.hypot(dx, dy)
    if (len < 0.25) continue
    const ang = Math.abs(Math.atan2(dy, dx)) // 0..pi
    if (ang < 0.035 || ang > Math.PI - 0.035) H.push({ c: toM((s.y1 + s.y2) / 2), a: toM(Math.min(s.x1, s.x2)), b: toM(Math.max(s.x1, s.x2)) })
    else if (Math.abs(ang - Math.PI / 2) < 0.035) V.push({ c: toM((s.x1 + s.x2) / 2), a: toM(Math.min(s.y1, s.y2)), b: toM(Math.max(s.y1, s.y2)) })
  }

  const runs: { o: 'h' | 'v'; c: number; a: number; b: number; t: number }[] = []
  for (const [o, list] of [
    ['h', mergeCollinear(H)],
    ['v', mergeCollinear(V)],
  ] as const) {
    const sorted = [...list].sort((p, q) => p.c - q.c)
    for (let i = 0; i < sorted.length; i++) {
      const A = sorted[i]
      let best: { j: number; d: number; a: number; b: number } | null = null
      for (let j = i + 1; j < sorted.length; j++) {
        const B = sorted[j]
        const d = B.c - A.c
        if (d < 0.07) continue
        if (d > 0.45) break
        const a = Math.max(A.a, B.a)
        const b = Math.min(A.b, B.b)
        const ov = b - a
        if (ov < 0.4) continue
        if (ov < 0.5 * Math.min(A.b - A.a, B.b - B.a)) continue
        if (!best || d < best.d) best = { j, d, a, b }
      }
      if (best) runs.push({ o, c: A.c + best.d / 2, a: best.a, b: best.b, t: best.d })
    }
  }

  // הסרת כפילויות: ריצות חופפות באותו מקום
  const uniq: typeof runs = []
  for (const r of runs.sort((p, q) => q.b - q.a - (p.b - p.a))) {
    const dup = uniq.some(
      (u) => u.o === r.o && Math.abs(u.c - r.c) < Math.max(u.t, r.t) * 0.9 && Math.min(u.b, r.b) - Math.max(u.a, r.a) > 0.6 * (r.b - r.a),
    )
    if (!dup) uniq.push(r)
  }

  // איחוד קירות קוליניאריים עם רווח: הרווח הוא פתח
  const walls: Wall[] = []
  const openings: Opening[] = []
  const groups = new Map<string, typeof uniq>()
  for (const r of uniq) {
    const key = `${r.o}:${Math.round(r.c / 0.04)}:${Math.round(r.t / 0.04)}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const arcsM = ex.arcs.map((a) => ({ x: toM(a.x), y: toM(a.y), r: toM(a.r) })).filter((a) => a.r > 0.4 && a.r < 2)
  const src = `עמוד ${pageNo}, זיהוי וקטורי`
  for (const list of groups.values()) {
    list.sort((p, q) => p.a - q.a)
    let cur = { ...list[0], gaps: [] as { a: number; b: number }[] }
    const flush = () => {
      if (cur.b - cur.a < 0.4) return
      const id = newId()
      const [x1, y1, x2, y2] = cur.o === 'h' ? [cur.a, cur.c, cur.b, cur.c] : [cur.c, cur.a, cur.c, cur.b]
      walls.push({ id, kind: 'wall', scope: 'house', x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), thickness: r2(cur.t), height: 3, label: 'estimated', source: src, approved: false })
      for (const g of cur.gaps) {
        const mid = (g.a + g.b) / 2
        const [mx, my] = cur.o === 'h' ? [mid, cur.c] : [cur.c, mid]
        const isDoor = arcsM.some((a) => Math.hypot(a.x - mx, a.y - my) < (g.b - g.a) * 1.2)
        openings.push({
          id: newId(),
          kind: 'opening',
          wallId: id,
          type: isDoor ? 'door' : 'window',
          offset: r2(g.a - cur.a),
          width: r2(g.b - g.a),
          height: isDoor ? 2.1 : 1.2,
          sill: isDoor ? 0 : 0.9,
          label: 'estimated',
          source: src,
          approved: false,
        })
      }
    }
    for (let i = 1; i < list.length; i++) {
      const r = list[i]
      const gap = r.a - cur.b
      if (gap <= 0.05) cur.b = Math.max(cur.b, r.b)
      else if (gap >= 0.55 && gap <= 3) {
        cur.gaps.push({ a: cur.b, b: r.a })
        cur.b = r.b
      } else {
        flush()
        cur = { ...r, gaps: [] }
      }
    }
    flush()
  }
  return { walls: walls.slice(0, 400), openings: openings.slice(0, 400) }
}

const r2 = (v: number) => Math.round(v * 100) / 100

function mergeCollinear(list: Line1D[]): Line1D[] {
  const sorted = [...list].sort((p, q) => p.c - q.c || p.a - q.a)
  const out: Line1D[] = []
  for (const l of sorted) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.c - l.c) < 0.012 && l.a <= last.b + 0.02) last.b = Math.max(last.b, l.b)
    else out.push({ ...l })
  }
  return out
}
