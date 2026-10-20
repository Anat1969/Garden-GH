import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Box, Building, BuildingLevel, Drawing, DrawingKind, PlanStructure, Pt } from './types'

// קריאת היתר כמו שרטט: מיפוי הגיליון לשרטוטים, קריאת מבנה מתוכנית, וקריאת גבהים מחתכים וחזיתות.

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/garden-read-plan`
const KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? ''
export const MAX_EDGE = 2576

export async function callTask<T>(task: string, canvas: HTMLCanvasElement, hint = ''): Promise<T> {
  const b64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
  return postFn<T>({ task, image: b64, media_type: 'image/jpeg', width: canvas.width, height: canvas.height, hint })
}

// קריאה לפונקציה עם ניסיון חוזר על עומס או עלייה כושלת (429, 5xx)
export async function postFn<T>(body: Record<string, unknown>): Promise<T> {
  let last = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt * attempt))
    let res: Response
    try {
      res = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: JSON.stringify(body) })
    } catch {
      last = 'אין חיבור לשרת הקריאה'
      continue
    }
    const json = await res.json().catch(() => ({}))
    if (res.ok) return json.result as T
    last = json?.error || json?.message || `שגיאה ${res.status}`
    if (res.status !== 429 && res.status < 500) break
  }
  throw new Error(last)
}

// מרנדר אזור מהעמוד (ביחידות עמוד) לקנבס, בקנה מידה שהצלע הארוכה לא עולה על maxEdge
export async function renderRegion(doc: PDFDocumentProxy, pageNo: number, box: Box, maxEdge = MAX_EDGE, maxScale = 6) {
  const page = await doc.getPage(pageNo)
  const scale = Math.min(maxScale, maxEdge / Math.max(box.w, box.h))
  const vp = page.getViewport({ scale, offsetX: -box.x * scale, offsetY: -box.y * scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(box.w * scale))
  canvas.height = Math.max(1, Math.round(box.h * scale))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport: vp }).promise
  return { canvas, scale }
}

// ---------- 1. מיפוי הגיליון ----------

// גיליון ארוך מחולק בקווי מסגרת אנכיים. מוצאים אותם מפרופיל הכהות של העמודות.
export async function findPanels(doc: PDFDocumentProxy, pageNo: number): Promise<Box[]> {
  const page = await doc.getPage(pageNo)
  const vp1 = page.getViewport({ scale: 1 })
  const W = vp1.width
  const H = vp1.height
  if (W / H < 1.9 && H / W < 1.9) return [{ x: 0, y: 0, w: W, h: H }]
  const s = Math.min(700 / Math.min(W, H), 14000 / Math.max(W, H))
  const { canvas } = await renderRegion(doc, pageNo, { x: 0, y: 0, w: W, h: H }, Math.max(W, H) * s, s)
  const cw = canvas.width
  const ch = canvas.height
  const data = canvas.getContext('2d')!.getImageData(0, 0, cw, ch).data
  const horizontal = W >= H
  const n = horizontal ? cw : ch
  const m = horizontal ? ch : cw
  const dark = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let c = 0
    for (let j = 0; j < m; j++) {
      const k = horizontal ? (j * cw + i) * 4 : (i * cw + j) * 4
      if (data[k] * 0.3 + data[k + 1] * 0.59 + data[k + 2] * 0.11 < 140) c++
    }
    dark[i] = c / m
  }
  const cuts: number[] = []
  for (let i = 0; i < n; i++) {
    if (dark[i] > 0.5 && (cuts.length === 0 || i - cuts[cuts.length - 1] > m * 0.3)) cuts.push(i)
  }
  const edges = [0, ...cuts, n]
  const panels: Box[] = []
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i]
    const b = edges[i + 1]
    if (b - a < m * 0.25) continue
    // פנל רחב מדי מפוצל לחתיכות חופפות
    const parts = Math.max(1, Math.ceil((b - a) / (m * 2.2)))
    const step = (b - a) / parts
    for (let p = 0; p < parts; p++) {
      const s0 = Math.max(a, a + p * step - (parts > 1 ? step * 0.15 : 0))
      const s1 = Math.min(b, a + (p + 1) * step + (parts > 1 ? step * 0.15 : 0))
      panels.push(horizontal ? { x: s0 / s, y: 0, w: (s1 - s0) / s, h: H } : { x: 0, y: s0 / s, w: W, h: (s1 - s0) / s })
    }
  }
  return panels.length ? panels : [{ x: 0, y: 0, w: W, h: H }]
}

interface MapItem {
  title: string
  kind: DrawingKind
  floor: string
  scale_den: number
  box: { x0: number; y0: number; x1: number; y1: number }
}

export async function mapPage(
  doc: PDFDocumentProxy,
  pageNo: number,
  newId: () => string,
  onStep: (msg: string) => void,
): Promise<{ drawings: Drawing[]; errors: string[] }> {
  onStep(`מאתרת את חלוקת הגיליון בעמוד ${pageNo}`)
  const panels = await findPanels(doc, pageNo)
  const found: Drawing[] = []
  const errors: string[] = []
  let done = 0
  const queue = [...panels]
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        const { canvas, scale } = await renderRegion(doc, pageNo, p, 2400)
        const r = await callTask<{ drawings: MapItem[] }>('map', canvas)
        for (const d of r.drawings ?? []) {
          const x0 = Math.min(d.box.x0, d.box.x1)
          const y0 = Math.min(d.box.y0, d.box.y1)
          const w = Math.abs(d.box.x1 - d.box.x0)
          const h = Math.abs(d.box.y1 - d.box.y0)
          if (w < 10 || h < 10) continue
          found.push({
            id: newId(),
            page: pageNo,
            box: { x: p.x + x0 / scale, y: p.y + y0 / scale, w: w / scale, h: h / scale },
            kind: d.kind,
            title: d.title,
            floor: d.floor,
            scaleDen: d.scale_den > 0 ? d.scale_den : null,
          })
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
      done++
      onStep(`ממפה את עמוד ${pageNo}: ${done} מתוך ${panels.length} חלקים`)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return { drawings: dedupeDrawings(found), errors: [...new Set(errors)] }
}

const iou = (a: Box, b: Box) => {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const i = x * y
  return i / Math.min(a.w * a.h, b.w * b.h)
}

// שרטוט שנחתך בין שני חלקים חופפים מופיע פעמיים: שומרים את הגדול
export function dedupeDrawings(list: Drawing[]): Drawing[] {
  const sorted = [...list].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)
  const out: Drawing[] = []
  for (const d of sorted) if (!out.some((o) => o.page === d.page && iou(o.box, d.box) > 0.6)) out.push(d)
  return out.sort((a, b) => a.page - b.page || b.box.x - a.box.x)
}

// השרטוט המתאים לתכנון הגינה: קומת קרקע, ואם אין, פיתוח שטח
export function pickGardenDrawing(list: Drawing[]): Drawing | undefined {
  const ground = list.filter((d) => d.kind === 'floor_plan' && /קרקע|ground/i.test(d.floor + d.title))
  return ground[0] ?? list.find((d) => d.kind === 'development_plan') ?? list.find((d) => d.kind === 'floor_plan')
}

// ---------- 2. קריאת מבנה ----------

interface StructureRaw {
  north_angle_deg: number
  units: { name: string; footprint: Pt[]; wall_thickness_cm: number; floor_level_rel: number; floor_level_abs: number }[]
  openings: { type: PlanStructure['openings'][number]['type']; x1: number; y1: number; x2: number; y2: number }[]
  plot: Pt[]
  zones: { kind: string; label: string; polygon: Pt[]; level_abs: number }[]
  levels: { text: string; abs: number; rel: number; has_rel: boolean; x: number; y: number }[]
  trees: { x: number; y: number; r: number; kind: 'tree' | 'palm' | 'shrub' }[]
  retaining_walls: { x1: number; y1: number; x2: number; y2: number; label: string }[]
}

export async function readStructure(doc: PDFDocumentProxy, d: Drawing): Promise<PlanStructure> {
  const { canvas, scale } = await renderRegion(doc, d.page, d.box, MAX_EDGE)
  const r = await callTask<StructureRaw>('structure', canvas, d.title ? `Drawing title: ${d.title}` : '')
  const P = (x: number, y: number): Pt => ({ x: d.box.x + x / scale, y: d.box.y + y / scale })
  const poly = (ps: Pt[]) => (ps ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => P(p.x, p.y))
  return {
    drawingId: d.id,
    northDeg: Number.isFinite(r.north_angle_deg) ? r.north_angle_deg : 0,
    units: (r.units ?? [])
      .map((u) => ({
        name: u.name,
        footprint: poly(u.footprint),
        wallCm: u.wall_thickness_cm > 5 && u.wall_thickness_cm < 80 ? u.wall_thickness_cm : 25,
        levelRel: u.floor_level_rel || 0,
        levelAbs: u.floor_level_abs > 100 ? u.floor_level_abs : null,
      }))
      .filter((u) => u.footprint.length >= 3),
    openings: (r.openings ?? []).map((o) => ({ type: o.type, a: P(o.x1, o.y1), b: P(o.x2, o.y2) })),
    plot: poly(r.plot),
    zones: (r.zones ?? [])
      .map((z) => ({ kind: z.kind, label: z.label, polygon: poly(z.polygon), levelAbs: z.level_abs > 100 ? z.level_abs : null }))
      .filter((z) => z.polygon.length >= 3),
    levels: (r.levels ?? []).map((l) => ({ text: l.text, abs: l.abs > 100 ? l.abs : null, rel: l.has_rel ? l.rel : null, at: P(l.x, l.y) })),
    trees: (r.trees ?? []).map((t) => ({ at: P(t.x, t.y), r: t.r / scale, kind: t.kind })),
    retaining: (r.retaining_walls ?? []).map((w) => ({ a: P(w.x1, w.y1), b: P(w.x2, w.y2), label: w.label })),
    readAt: new Date().toISOString(),
  }
}

// ---------- 3. קריאת גבהים ----------

interface HeightsRaw {
  levels: { text: string; rel: number; abs: number; has_abs: boolean; meaning: string }[]
  roof_type: Building['roofType']
  roof_pitch_deg: number
  storeys_above_ground: number
}

export async function readHeights(
  doc: PDFDocumentProxy,
  drawings: Drawing[],
  onStep: (msg: string) => void,
): Promise<{ building: Building | null; errors: string[] }> {
  const levels: BuildingLevel[] = []
  const roofs: Building['roofType'][] = []
  let storeys = 0
  const errors: string[] = []
  let i = 0
  for (const d of drawings) {
    onStep(`קוראת גבהים: ${d.title || 'שרטוט'} (${++i} מתוך ${drawings.length})`)
    try {
      const { canvas } = await renderRegion(doc, d.page, d.box, MAX_EDGE)
      const r = await callTask<HeightsRaw>('heights', canvas, d.title ? `Drawing title: ${d.title}` : '')
      for (const l of r.levels ?? []) if (Number.isFinite(l.rel)) levels.push({ text: l.text, rel: l.rel, abs: l.has_abs && l.abs > 100 ? l.abs : null, meaning: l.meaning, drawing: d.title })
      if (r.roof_type) roofs.push(r.roof_type)
      storeys = Math.max(storeys, r.storeys_above_ground || 0)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  return { building: levels.length ? summarizeBuilding(levels, roofs, storeys) : null, errors: [...new Set(errors)] }
}

const mode = <T,>(xs: T[]): T | undefined => {
  const c = new Map<T, number>()
  xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1))
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

// מסכם רמות מכמה חתכים: הערך השכיח לכל משמעות
export function summarizeBuilding(levels: BuildingLevel[], roofs: Building['roofType'][], storeys: number): Building {
  const pick = (m: string) => mode(levels.filter((l) => l.meaning === m).map((l) => Math.round(l.rel * 100) / 100))
  const first = pick('first_floor')
  const eave = pick('roof_eave') ?? pick('flat_roof') ?? pick('parapet')
  const ridgeVals = levels.filter((l) => l.meaning === 'ridge').map((l) => l.rel)
  const base = mode(levels.filter((l) => Math.abs(l.rel) < 0.005 && l.abs).map((l) => l.abs as number))
  return {
    baseAbs: base ?? null,
    groundHeight: first && first > 2 && first < 5 ? first : 3,
    eaveRel: eave ?? null,
    ridgeRel: ridgeVals.length ? Math.max(...ridgeVals) : null,
    roofType: mode(roofs) ?? 'gable',
    storeys: storeys || (first ? 2 : 1),
    levels,
    source: 'קריאת חתכים וחזיתות',
  }
}
