import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PlanDimension } from './types'

// קריאה חכמה של מידות: הגיליון מחולק לאריחים בגודל שהמודל קורא בחדות מלאה (עד 2576 פיקסל לצלע),
// כל אריח נשלח לפונקציית garden-read-plan, והתוצאות מוחזרות ליחידות העמוד.

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/garden-read-plan`
const KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? ''
const TILE = 2400
const MAX_RENDER_EDGE = 6000

export const aiAvailable = Boolean(import.meta.env.VITE_SUPABASE_URL)

export type Detail = 'normal' | 'fine'

interface AiItem {
  text: string
  value: number
  unit: 'cm' | 'm' | 'mm'
  kind: 'length' | 'level'
  relative: boolean
  orientation: 'horizontal' | 'vertical' | 'other'
  text_box: { x0: number; y0: number; x1: number; y1: number }
  has_line: boolean
  line: { x1: number; y1: number; x2: number; y2: number }
  confidence: 'high' | 'medium' | 'low'
}

export interface AiResult {
  dims: PlanDimension[]
  scaleText: string
  tiles: number
  failed: number
  errors: string[]
}

export function tilePlan(pageW: number, pageH: number, isImage: boolean, detail: Detail) {
  const long = Math.max(pageW, pageH)
  let target: number
  if (detail === 'normal') target = Math.min(2576, isImage ? long : 2576)
  else target = Math.min(MAX_RENDER_EDGE, isImage ? Math.max(long, TILE * 2) : TILE * 2)
  const scale = target / long
  const W = Math.round(pageW * scale)
  const H = Math.round(pageH * scale)
  const nx = Math.max(1, Math.ceil(W / TILE - 0.08))
  const ny = Math.max(1, Math.ceil(H / TILE - 0.08))
  return { scale, W, H, nx, ny }
}

async function callFn(b64: string, w: number, h: number, hint: string): Promise<{ scale_text: string; dimensions: AiItem[] }> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY },
    body: JSON.stringify({ image: b64, media_type: 'image/jpeg', width: w, height: h, hint }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `שגיאה ${res.status}`)
  return json.result
}

export async function readPageWithAi(
  doc: PDFDocumentProxy,
  pageNo: number,
  isImage: boolean,
  detail: Detail,
  newId: () => string,
  onProgress: (done: number, total: number) => void,
): Promise<AiResult> {
  const page = await doc.getPage(pageNo)
  const vp1 = page.getViewport({ scale: 1 })
  const plan = tilePlan(vp1.width, vp1.height, isImage, detail)
  const canvas = document.createElement('canvas')
  canvas.width = plan.W
  canvas.height = plan.H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, plan.W, plan.H)
  await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: plan.scale }) }).promise

  const tw = Math.ceil(plan.W / plan.nx)
  const th = Math.ceil(plan.H / plan.ny)
  const ov = Math.round(Math.min(tw, th) * 0.08)
  const tiles: { x: number; y: number; w: number; h: number }[] = []
  for (let j = 0; j < plan.ny; j++)
    for (let i = 0; i < plan.nx; i++) {
      const x = Math.max(0, i * tw - ov)
      const y = Math.max(0, j * th - ov)
      tiles.push({ x, y, w: Math.min(plan.W - x, tw + ov * 2), h: Math.min(plan.H - y, th + ov * 2) })
    }

  const dims: PlanDimension[] = []
  const errors: string[] = []
  let scaleText = ''
  let done = 0
  let failed = 0
  onProgress(0, tiles.length)
  const queue = [...tiles]
  const hint = tiles.length > 1 ? 'This is one tile of a larger sheet; dimensions cut at the tile edge may be skipped.' : ''
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const tc = document.createElement('canvas')
      tc.width = t.w
      tc.height = t.h
      tc.getContext('2d')!.drawImage(canvas, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h)
      const b64 = tc.toDataURL('image/jpeg', 0.9).split(',')[1]
      try {
        const r = await callFn(b64, t.w, t.h, hint)
        if (r.scale_text && !scaleText) scaleText = r.scale_text
        for (const it of r.dimensions ?? []) {
          const d = toDim(it, t, plan.scale, pageNo, newId)
          if (d) dims.push(d)
        }
      } catch (e) {
        failed++
        errors.push(e instanceof Error ? e.message : String(e))
      }
      done++
      onProgress(done, tiles.length)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return { dims, scaleText, tiles: tiles.length, failed, errors: [...new Set(errors)] }
}

function toDim(it: AiItem, t: { x: number; y: number; w: number; h: number }, s: number, page: number, newId: () => string): PlanDimension | null {
  if (!Number.isFinite(it.value)) return null
  const b = it.text_box
  if (![b.x0, b.y0, b.x1, b.y1].every(Number.isFinite)) return null
  const toPage = (x: number, y: number) => [(t.x + x) / s, (t.y + y) / s]
  const [bx0, by0] = toPage(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1))
  const [bx1, by1] = toPage(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1))
  let value: number
  if (it.kind === 'level') value = it.value
  else value = it.unit === 'cm' ? it.value / 100 : it.unit === 'mm' ? it.value / 1000 : it.value
  if (it.kind === 'length' && (value <= 0.04 || value > 200)) return null
  let line: PlanDimension['line'] = null
  if (it.kind === 'length' && it.has_line && Math.hypot(it.line.x2 - it.line.x1, it.line.y2 - it.line.y1) > 8) {
    const [x1, y1] = toPage(it.line.x1, it.line.y1)
    const [x2, y2] = toPage(it.line.x2, it.line.y2)
    line = { x1, y1, x2, y2 }
  }
  return {
    id: newId(),
    page,
    raw: it.text,
    value,
    unit: it.unit,
    kind: it.kind,
    relative: it.kind === 'level' && it.relative,
    orientation: it.orientation === 'horizontal' ? 'h' : it.orientation === 'vertical' ? 'v' : 'other',
    box: { x: bx0, y: by0, w: Math.max(1, bx1 - bx0), h: Math.max(1, by1 - by0) },
    line,
    agrees: null,
    source: 'ai',
    confidence: it.confidence,
    status: 'pending',
  }
}
