// גליון להדפסה: תצוגה מקדימה של דף A4, עריכת שדות, הדפסה ושמירה כ-PDF, והורדת HTML עצמאי.
// במצב תיקייה (/sheet-render) הקלט מגיע מסקריפט, והפלט נאסף ממנו: HTML, תמונות ובדיקות.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { updateProject, useApp } from '../lib/store'
import type { FolderInput, SheetModel } from '../lib/sheet/types'
import { fromFolder } from '../lib/sheet/fromFolder'
import { fromProject } from '../lib/sheet/fromProject'
import { haikuSuggestions, postSuggestions } from '../lib/sheet/suggest'
import { renderView } from '../lib/sheet/render3d'
import { Sheet, sheetCss, type SheetImages } from '../components/sheet/Sheet'
import { Empty, Loading, toast } from '../components/ui'
import { IconBtn } from '../components/EditIcons'
import { printPage } from '../lib/printing'

declare global {
  interface Window {
    __SHEET_INPUT__?: FolderInput
    __SHEET_READY__?: boolean
    __SHEET_OUT__?: { html: string; iso: string; main: string; report: Report; doc: string }
  }
}

interface Report {
  assumptions: string[]
  checks: { ok: boolean; text: string }[]
  overflow: string[]
  render: string
}

// ההדמיות: פרספקטיבה להדמיה הראשית ואיזומטרי לרצועה
function useImages(model: SheetModel | null) {
  const [img, setImg] = useState<(SheetImages & { checks: { ok: boolean; text: string }[] }) | null>(null)
  useEffect(() => {
    if (!model) return
    let alive = true
    const id = requestAnimationFrame(() => {
      try {
        const cam = model.camera ?? { az: 0, el: 20, zoom: 1 }
        const main = renderView(model.scene, { width: 2600, height: 1423, view: 'persp', callouts: model.callouts, az: cam.az, el: cam.el, zoom: cam.zoom })
        // הרצועה האיזומטרית מסתובבת יחד עם ההדמיה הראשית
        const iso = renderView(model.scene, { width: 3300, height: 560, view: 'iso', az: cam.az })
        if (alive) setImg({ main: main.dataUrl, iso: iso.dataUrl, anchors: main.anchors, checks: [...main.checks, ...iso.checks.map((c) => ({ ...c, text: `איזומטרי: ${c.text}` }))] })
      } catch (e) {
        if (alive) setImg({ main: null, iso: null, anchors: [], checks: [{ ok: false, text: `ההדמיה לא נוצרה: ${(e as Error).message}` }] })
      }
    })
    return () => {
      alive = false
      cancelAnimationFrame(id)
    }
  }, [model])
  return img
}

const toDataUrl = async (url: string) => {
  const b = await (await fetch(url)).blob()
  return await new Promise<string>((res) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.readAsDataURL(b)
  })
}

const FONT_FILES = [
  'heebo-hebrew-400-normal.woff2',
  'heebo-latin-400-normal.woff2',
  'heebo-hebrew-500-normal.woff2',
  'heebo-latin-500-normal.woff2',
  'heebo-hebrew-700-normal.woff2',
  'heebo-latin-700-normal.woff2',
  'heebo-hebrew-800-normal.woff2',
  'heebo-latin-800-normal.woff2',
  'frank-ruhl-libre-hebrew-400-normal.woff2',
  'frank-ruhl-libre-latin-400-normal.woff2',
  'roboto-mono-latin-400-normal.woff2',
  'roboto-mono-latin-500-normal.woff2',
]

// HTML עצמאי: הסגנון, הגופנים והתמונות בתוך הקובץ או בנתיבים יחסיים
export function standaloneHtml(title: string, pageHtml: string, fontBase: string) {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, '&lt;')}</title>
<style>${sheetCss(fontBase)}
html, body { margin: 0; background: #f5f2eb; }
body { padding: 3mm; }
@media print { body { padding: 0; } }
</style>
</head>
<body>
${pageHtml}
</body>
</html>
`
}

function collectOverflow(root: HTMLElement | null) {
  if (!root) return []
  const out: string[] = []
  root.querySelectorAll<HTMLElement>('.fit, .sh-callout').forEach((el) => {
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) out.push((el.textContent ?? '').slice(0, 40))
  })
  return out
}

function SheetView({ model, onReady, side }: { model: SheetModel; onReady?: (r: { html: string; iso: string; main: string; report: Report }) => void; side?: React.ReactNode }) {
  const img = useImages(model)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!img || !onReady) return
    let alive = true
    document.fonts.ready.then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!alive) return
          const page = wrap.current?.querySelector('.sheet-page') as HTMLElement | null
          onReady({
            html: page?.outerHTML ?? '',
            iso: img.iso ?? '',
            main: img.main ?? '',
            report: { assumptions: model.assumptions, checks: [...model.checks, ...img.checks], overflow: collectOverflow(page), render: 'three.js ב-Chromium (WebGL), מצלמה פרספקטיבית להדמיה הראשית ואורתוגרפית איזומטרית לרצועה' },
          })
        }),
      ),
    )
    return () => {
      alive = false
    }
  }, [img]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="sheet-layout">
      <style>{sheetCss('/fonts/')}</style>
      {/* בהדפסה מתוך האפליקציה: רק דף הגליון, במקום קבוע, בעמוד אחד */}
      <style>{`@media print {
  body * { visibility: hidden !important; }
  .sheet-page, .sheet-page * { visibility: visible !important; }
  .sheet-page { position: fixed !important; top: 0 !important; left: 0 !important; right: auto !important; margin: 0 !important; }
  .sheet-page * { break-inside: auto !important; page-break-inside: auto !important; break-after: auto !important; }
  html, body { height: 291mm !important; overflow: hidden !important; }
}`}</style>
      <div className="sheet-stage" ref={wrap}>
        {img ? <Sheet model={model} images={img} /> : <Loading text="בונה הדמיה ותוכניות" />}
      </div>
      {side && (
        <aside className="sheet-side no-print">
          {side}
          {img && (
            <div className="card flat sheet-checks" data-testid="sheet-checks">
              <b>בדיקות</b>
              <ul>
                {[...model.checks, ...img.checks].map((c) => (
                  <li key={c.text} className={c.ok ? 'ok' : 'bad'}>
                    {c.ok ? 'תקין: ' : 'לבדיקה: '}
                    {c.text}
                  </li>
                ))}
              </ul>
              {model.assumptions.length > 0 && (
                <>
                  <b>הנחות</b>
                  <ul>
                    {model.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </aside>
      )}
    </div>
  )
}

// מחוון שמעדכן את ההדמיה רק בסיום הגרירה (הרינדור כבד)
function CamSlider({ label, min, max, step, unit, value, onCommit }: { label: string; min: number; max: number; step: number; unit: string; value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <label className="field">
      <span>
        {label}: <bdi className="num">{unit ? v.toFixed(0) : v.toFixed(2)}</bdi>
        {unit}
      </span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => setV(Number(e.target.value))} onPointerUp={() => onCommit(v)} onKeyUp={() => onCommit(v)} onBlur={() => v !== value && onCommit(v)} aria-label={label} />
    </label>
  )
}

// מצב פרויקט: /p/:id/sheet
export default function SheetPage() {
  const { id } = useParams()
  const project = useApp((s) => s.projects.find((p) => p.id === id))
  const ready = useApp((s) => s.ready)
  const [out, setOut] = useState<{ html: string } | null>(null)
  const o = project?.sheet ?? {}
  const model = useMemo(() => (project ? fromProject(project, o) : null), [project]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready) return <Loading />
  if (!project || !model)
    return (
      <div className="card">
        <Empty title="הפרויקט לא נמצא">
          <Link className="btn" to="/projects">
            לפרויקטים
          </Link>
        </Empty>
      </div>
    )
  const set = (k: keyof NonNullable<typeof project.sheet>, v: string | number) => updateProject(project.id, (p) => ({ ...p, sheet: { ...p.sheet, [k]: v } }))
  const haikus = haikuSuggestions(project)
  const posts = postSuggestions(project)
  // דפדוף בין ההצעות: הבאה אחרי הנוכחית
  const cycle = (k: 'poem' | 'post', list: string[]) => {
    const cur = (k === 'poem' ? o.poem ?? model.poem : o.post ?? model.post).trim()
    const i = list.findIndex((x) => x.trim() === cur)
    set(k, list[(i + 1) % list.length])
  }
  const field = (k: keyof NonNullable<typeof project.sheet>, label: string, ph = '') => (
    <label className="field">
      <span>{label}</span>
      <input className="input" value={o[k] ?? ''} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
    </label>
  )
  const downloadHtml = async () => {
    if (!out) return
    let html = out.html
    // תמונות וגופנים בתוך הקובץ, כך שהוא נפתח גם בלי רשת
    const imgs = [...new Set([...html.matchAll(/src="(\/[^"]+)"/g)].map((m) => m[1]))]
    for (const u of imgs) html = html.split(`src="${u}"`).join(`src="${await toDataUrl(u)}"`)
    let doc = standaloneHtml(project.name, html, '/fonts/')
    for (const f of FONT_FILES) doc = doc.split(`/fonts/${f}`).join(await toDataUrl(`/fonts/${f}`))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([doc], { type: 'text/html;charset=utf-8' }))
    a.download = `גליון-${project.name}.html`
    document.body.appendChild(a)
    a.click()
    a.remove()
    toast('הקובץ ירד. אפשר לפתוח, לערוך בכל עורך HTML ולהדפיס')
  }
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row no-print" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div className="muted" style={{ fontSize: 14 }}>
          דף <b>A4 לאורך</b>: הדמיה, תוכנית, לוח חומרים ופרטי הפרויקט. עורכים בצד, ומדפיסים או שומרים כ-PDF.
        </div>
        <div className="row" style={{ gap: 6 }}>
          <IconBtn icon="print" label="הדפסה או שמירה כ-PDF" className="primary" onClick={printPage} testId="sheet-print" />
          <IconBtn icon="download" label="הורדת HTML לעריכה" onClick={downloadHtml} disabled={!out} testId="sheet-html" />
        </div>
      </div>
      <SheetView
        model={model}
        onReady={(r) => setOut(r)}
        side={
          <div className="card flat sheet-fields">
            <b>פרטי הגיליון</b>
            {field('subtitle', 'כותרת משנה', 'תכנון גינה, הדמיה ותוכנית')}
            {field('gush', 'גוש')}
            {field('helka', 'חלקה')}
            {field('drawingNo', 'מספר שרטוט', model.meta.drawingNo)}
            {field('planner', 'מתכנן', 'אד׳ ענת שטיבלמן')}
            <label className="field">
              <span>הייקו, שלוש שורות: הצעה, אפשר לערוך</span>
              <textarea className="input" rows={3} value={o.poem ?? model.poem} onChange={(e) => set('poem', e.target.value)} data-testid="sheet-poem" />
            </label>
            <button type="button" className="btn small" onClick={() => cycle('poem', haikus)}>
              הצעה אחרת להייקו
            </button>
            <label className="field">
              <span>פוסט: הצעה, אפשר לערוך</span>
              <textarea className="input" rows={5} value={o.post ?? model.post} onChange={(e) => set('post', e.target.value)} data-testid="sheet-post" />
            </label>
            <button type="button" className="btn small" onClick={() => cycle('post', posts)}>
              הצעה אחרת לפוסט
            </button>
            <b style={{ marginTop: 6 }}>זווית ההדמיה</b>
            <CamSlider label="סיבוב סביב המבנה" min={-180} max={180} step={15} unit="°" value={o.camAz ?? 0} onCommit={(v) => set('camAz', v)} />
            <CamSlider label="גובה המבט" min={6} max={70} step={2} unit="°" value={o.camEl ?? 20} onCommit={(v) => set('camEl', v)} />
            <CamSlider label="קרבה" min={0.6} max={1.8} step={0.1} unit="" value={o.camZoom ?? 1} onCommit={(v) => set('camZoom', v)} />
          </div>
        }
      />
    </div>
  )
}

// מצב תיקייה: /sheet-render. הסקריפט מזריק קלט ואוסף פלט
export function SheetRender() {
  const [input, setInput] = useState<FolderInput | null>(window.__SHEET_INPUT__ ?? null)
  useEffect(() => {
    const on = () => setInput(window.__SHEET_INPUT__ ?? null)
    window.addEventListener('sheet-input', on)
    return () => window.removeEventListener('sheet-input', on)
  }, [])
  const model = useMemo(() => (input ? fromFolder(input) : null), [input])
  if (!model) return <div className="card muted">ממתין לנתוני תיקיית הפרויקט</div>
  return (
    <SheetView
      model={model}
      onReady={(r) => {
        window.__SHEET_OUT__ = { ...r, doc: standaloneHtml(model.meta.title, r.html, 'assets/fonts/') }
        window.__SHEET_READY__ = true
      }}
    />
  )
}
