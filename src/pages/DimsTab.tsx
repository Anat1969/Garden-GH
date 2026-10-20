import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import { usePermitDoc } from '../lib/usePermit'
import { extractSegments, renderPage } from '../lib/pdf'
import { attachLines, denFromMpp, dimLabelText, mergeDims, reliableDimScale, segLen, inferScale } from '../lib/dims'
import { aiAvailable, readPageWithAi, type Detail } from '../lib/aiRead'
import { setPlanScale, uid, updateProject } from '../lib/store'
import type { DimScale, Label, Permit, PlanDimension } from '../lib/types'
import { PAGE_KIND_TEXT } from '../lib/types'
import { Empty, ErrorState, Loading, NumField, Tag, toast } from '../components/ui'

export const dimLabel = (d: PlanDimension): Label => (d.source === 'text-layer' || d.status === 'confirmed' ? 'measured' : 'estimated')

const COLOR = { confirmed: '#2f6b4f', pending: '#c98a00', text: '#3b6ea8', rejected: '#9aa09d' }

interface View {
  x: number
  y: number
  w: number
  h: number
}

export default function DimsTab() {
  const { project } = useProject()
  const permit = project.permit
  const [params, setParams] = useSearchParams()
  const { doc, status } = usePermitDoc(project)
  const page = Number(params.get('page')) || permit?.planPage || 1
  const selId = params.get('dim')
  const [bg, setBg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed'>('all')
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ sx: number; sy: number; v: View; moved: boolean } | null>(null)

  const pg = permit?.pages.find((p) => p.index === page)
  const W = pg?.widthPt ?? 100
  const H = pg?.heightPt ?? 100
  const [view, setView] = useState<View>({ x: 0, y: 0, w: W, h: H })
  useEffect(() => setView({ x: 0, y: 0, w: W, h: H }), [W, H])

  useEffect(() => {
    if (!doc || !pg) return
    let alive = true
    setBg(null)
    renderPage(doc, pg.index, 2600)
      .then((u) => alive && setBg(u))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [doc, pg?.index])

  const all = permit?.dims ?? []
  const onPage = all.filter((d) => d.page === page)
  const shown = onPage.filter((d) => filter === 'all' || (filter === 'pending' ? d.status === 'pending' : d.status === 'confirmed'))
  const selected = onPage.find((d) => d.id === selId) ?? null
  const lengths = onPage.filter((d) => d.kind === 'length' && d.status !== 'rejected')
  const levels = onPage.filter((d) => d.kind === 'level' && d.status !== 'rejected')

  // קנה מידה חי מהמידות שיש להן קו
  const live = useMemo(() => {
    const cands = lengths.filter((d) => d.line).map((d) => [{ line: d.line!, mpp: d.value / segLen(d.line!) }])
    const inf = inferScale(cands)
    return inf ? ({ page, metersPerPt: inf.mpp, support: inf.support, total: lengths.length, spread: inf.spread } satisfies DimScale) : null
  }, [lengths, page])

  const setPermit = (fn: (p: Permit) => Permit) => updateProject(project.id, (p) => (p.permit ? { ...p, permit: fn(p.permit) } : p))
  const select = (id: string | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('dim', id)
    else p.delete('dim')
    setParams(p, { replace: true })
  }
  const setPage = (n: number) => {
    const p = new URLSearchParams(params)
    p.set('page', String(n))
    p.delete('dim')
    setParams(p, { replace: true })
  }
  const patchDim = (id: string, patch: Partial<PlanDimension>) =>
    setPermit((p) => ({ ...p, dims: (p.dims ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)) }))

  const runAi = async (detail: Detail) => {
    if (!doc || !permit) return
    setError(null)
    try {
      setBusy('מכינה את הגיליון')
      const r = await readPageWithAi(doc, page, permit.sourceType === 'image', detail, uid, (done, total) =>
        setBusy(total > 1 ? `קוראת אריח ${Math.min(done + 1, total)} מתוך ${total}` : 'קוראת את הגיליון'),
      )
      if (r.failed === r.tiles) throw new Error(r.errors[0] || 'הקריאה נכשלה')
      const segs = permit.sourceType === 'image' ? [] : (await extractSegments(await doc.getPage(page))).lines
      setPermit((p) => {
        const merged = mergeDims(p.dims ?? [], r.dims)
        const att = attachLines(merged, segs, page)
        const dimScales = [...(p.dimScales ?? []).filter((s) => s.page !== page), ...(att.scale ? [att.scale] : [])]
        return { ...p, dims: att.dims, dimScales, aiReadAt: new Date().toISOString() }
      })
      const added = r.dims.length
      toast(r.failed ? `נקראו ${added} מידות. ${r.failed} אריחים נכשלו.` : `נקראו ${added} מידות. לבדוק ולאשר.`)
      if (r.failed) setError(`חלק מהאריחים לא נקראו: ${r.errors.join(' · ')}`)
    } catch (e) {
      setError(`הקריאה החכמה נכשלה: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const useAsScale = () => {
    if (!live || !permit) return
    if (page !== permit.planPage) setPermit((p) => ({ ...p, planPage: page }))
    setPlanScale(project.id, { den: permit.sourceType === 'image' ? null : Math.round(denFromMpp(live.metersPerPt)), metersPerPt: live.metersPerPt, source: 'dimensions' })
    toast('קנה המידה נקבע מהמידות')
  }

  const confirmHigh = () =>
    setPermit((p) => ({
      ...p,
      dims: (p.dims ?? []).map((d) => (d.page === page && d.status === 'pending' && d.confidence === 'high' ? { ...d, status: 'confirmed' } : d)),
    }))

  // זום וגרירה
  const toWorld = (cx: number, cy: number) => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = cx
    pt.y = cy
    const m = svg.getScreenCTM()
    return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 }
  }
  const zoom = (f: number, px?: number, py?: number) =>
    setView((v) => {
      const cx = px ?? v.x + v.w / 2
      const cy = py ?? v.y + v.h / 2
      return { x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f, w: v.w * f, h: v.h * f }
    })
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const w = toWorld(e.clientX, e.clientY)
      zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, w.x, w.y)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  })
  const zoomTo = (d: PlanDimension) => {
    const pad = Math.max(d.box.w, d.box.h) * 8
    setView({ x: d.box.x + d.box.w / 2 - pad, y: d.box.y + d.box.h / 2 - pad * 0.7, w: pad * 2, h: pad * 1.4 })
  }

  if (!permit || !permit.pages.length) {
    return (
      <div className="card">
        <Empty title="אין היתר">
          <div>מעלים PDF, סריקה או תמונה של ההיתר, ואז המידות נקראות ממנו.</div>
          <Link className="btn primary" to="../permit">
            העלאת היתר
          </Link>
        </Empty>
      </div>
    )
  }
  if (status === 'loading') return <Loading text="טוען את ההיתר" />
  if (status === 'error') return <ErrorState>לא ניתן לפתוח את קובץ ההיתר.</ErrorState>

  const k = view.w / 900
  const isPlan = page === permit.planPage
  const scaleDiff = live && permit.scale.metersPerPt && isPlan ? live.metersPerPt / permit.scale.metersPerPt - 1 : null

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="card flat">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="h-section">מידות מההיתר</div>
            <div className="muted" style={{ fontSize: 14 }}>
              {permit.sourceType === 'image' || permit.declaredType === 'scan'
                ? 'סריקה או תמונה: המידות נקראות בקריאה חכמה, ונבדקות מול אורך קווי המידה.'
                : 'PDF וקטורי: המידות נקראו משכבת הטקסט. קריאה חכמה משלימה מידות שצוירו כקווים.'}
            </div>
          </div>
          <label className="field" style={{ minWidth: 200 }}>
            <span>עמוד</span>
            <select className="input" value={page} onChange={(e) => setPage(Number(e.target.value))} aria-label="עמוד">
              {permit.pages.map((p) => (
                <option key={p.index} value={p.index}>
                  עמוד {p.index} · {PAGE_KIND_TEXT[p.kind]} · {all.filter((d) => d.page === p.index).length} מידות
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={!aiAvailable || !!busy || status !== 'ready'} onClick={() => runAi('normal')}>
            קריאה חכמה
          </button>
          <button className="btn" disabled={!aiAvailable || !!busy || status !== 'ready'} onClick={() => runAi('fine')}>
            קריאה מפורטת (אריחים)
          </button>
          {onPage.some((d) => d.status === 'pending' && d.confidence === 'high') && (
            <button className="btn" onClick={confirmHigh}>
              אישור המידות בביטחון גבוה
            </button>
          )}
          <span className="spacer" />
          <div className="row" role="radiogroup" aria-label="סינון" style={{ gap: 4 }}>
            {(['all', 'pending', 'confirmed'] as const).map((f) => (
              <button key={f} className={`btn small ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>
                {f === 'all' ? 'הכול' : f === 'pending' ? 'לבדיקה' : 'מאושרות'}
              </button>
            ))}
          </div>
        </div>
        {!aiAvailable && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>הקריאה החכמה לא זמינה בסביבה הזו.</div>}
        {status === 'missing' && <div className="notice" style={{ marginTop: 8 }}>קובץ ההיתר לא נמצא במכשיר. המידות השמורות מוצגות בלי רקע.</div>}
      </div>

      {busy && (
        <div className="card flat">
          <Loading text={busy} />
        </div>
      )}
      {error && <div className="notice danger">{error}</div>}

      <div className="editor">
        <div className="canvas-box">
          <div className="toolbar">
            <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>
              {onPage.length} מידות בעמוד · {onPage.filter((d) => d.status === 'confirmed' || d.source === 'text-layer').length} מדודות
            </span>
            <span className="spacer" />
            <button className="btn small" onClick={() => zoom(1 / 1.3)}>
              קרוב
            </button>
            <button className="btn small" onClick={() => zoom(1.3)}>
              רחוק
            </button>
            <button className="btn small" onClick={() => setView({ x: 0, y: 0, w: W, h: H })}>
              התאמה
            </button>
          </div>
          <svg
            ref={svgRef}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            data-testid="dims-canvas"
            role="application"
            aria-label="גיליון עם מידות"
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => {
              if (e.button === 0) drag.current = { sx: e.clientX, sy: e.clientY, v: view, moved: false }
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (!d) return
              const dx = e.clientX - d.sx
              const dy = e.clientY - d.sy
              if (!d.moved && Math.hypot(dx, dy) < 5) return
              d.moved = true
              const r = svgRef.current!.getBoundingClientRect()
              const s = Math.max(d.v.w / r.width, d.v.h / r.height)
              setView({ ...d.v, x: d.v.x - dx * s, y: d.v.y - dy * s })
            }}
            onPointerUp={() => {
              const d = drag.current
              drag.current = null
              if (d && !d.moved) select(null)
            }}
            onPointerLeave={() => (drag.current = null)}
          >
            {bg && <image href={bg} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />}
            <rect x={0} y={0} width={W} height={H} fill="none" stroke="#c2c8c4" strokeWidth={k} />
            {shown.map((d) => {
              const c = d.status === 'rejected' ? COLOR.rejected : d.status === 'confirmed' ? COLOR.confirmed : d.source === 'text-layer' ? COLOR.text : COLOR.pending
              const sel = d.id === selId
              return (
                <g
                  key={d.id}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    drag.current = null
                    select(d.id)
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {d.line && <line {...d.line} stroke={c} strokeWidth={k * (sel ? 4 : 2.2)} opacity={0.85} />}
                  {d.line && (
                    <>
                      <circle cx={d.line.x1} cy={d.line.y1} r={k * 3.5} fill={c} />
                      <circle cx={d.line.x2} cy={d.line.y2} r={k * 3.5} fill={c} />
                    </>
                  )}
                  <rect
                    x={d.box.x - k * 2}
                    y={d.box.y - k * 2}
                    width={d.box.w + k * 4}
                    height={d.box.h + k * 4}
                    fill={c}
                    fillOpacity={sel ? 0.28 : 0.12}
                    stroke={c}
                    strokeWidth={k * (sel ? 2.5 : 1.2)}
                    strokeDasharray={d.status === 'rejected' ? `${k * 4} ${k * 3}` : undefined}
                    rx={k * 2}
                  />
                </g>
              )
            })}
          </svg>
        </div>

        <aside className="side">
          <div className="card">
            <div className="h-section">קנה מידה מהמידות</div>
            {live ? (
              <div className="stack" style={{ gap: 6, marginTop: 6 }}>
                <div>
                  {permit.sourceType !== 'image' && (
                    <span className="num" style={{ fontSize: 22 }}>
                      1:{denFromMpp(live.metersPerPt).toFixed(1)}{' '}
                    </span>
                  )}
                  <span className="muted" style={{ fontSize: 14 }}>
                    {live.support} מתוך {live.total} מידות אורך מסכימות (סטייה ממוצעת {(live.spread * 100).toFixed(1)}%)
                  </span>
                </div>
                {scaleDiff !== null && (
                  <div className={`notice ${Math.abs(scaleDiff) > 0.03 ? 'danger' : 'info'}`}>
                    {Math.abs(scaleDiff) <= 0.03 ? 'תואם לקנה המידה הפעיל.' : `שונה ב-${(scaleDiff * 100).toFixed(1)}% מקנה המידה הפעיל.`}
                  </div>
                )}
                {!reliableDimScale(live) && <div className="muted" style={{ fontSize: 13 }}>צריך לפחות 3 מידות מסכימות כדי לסמוך על קנה המידה.</div>}
                <button className="btn" disabled={!reliableDimScale(live)} onClick={useAsScale}>
                  {isPlan ? 'שימוש כקנה מידה של התוכנית' : 'עבודה על עמוד זה עם קנה מידה זה'}
                </button>
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                עוד אין מידות עם קו מידה בעמוד הזה.
              </div>
            )}
          </div>

          {selected && <DimEditor d={selected} onPatch={(p) => patchDim(selected.id, p)} onZoom={() => zoomTo(selected)} />}

          <div className="card">
            <div className="h-section" style={{ marginBottom: 8 }}>
              אורכים ({lengths.length})
            </div>
            {lengths.length === 0 ? (
              <div className="muted" style={{ fontSize: 14 }}>
                לא נקראו מידות בעמוד. בסריקה או בתמונה: קריאה חכמה.
              </div>
            ) : (
              <div className="el-list">
                {shown
                  .filter((d) => d.kind === 'length')
                  .map((d) => (
                    <DimRow key={d.id} d={d} sel={d.id === selId} onClick={() => select(d.id)} />
                  ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="h-section" style={{ marginBottom: 8 }}>
              מפלסים ({levels.length})
            </div>
            {levels.length === 0 ? (
              <div className="muted" style={{ fontSize: 14 }}>
                לא נקראו מפלסים בעמוד.
              </div>
            ) : (
              <div className="el-list">
                {shown
                  .filter((d) => d.kind === 'level')
                  .map((d) => (
                    <DimRow key={d.id} d={d} sel={d.id === selId} onClick={() => select(d.id)} />
                  ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function DimRow({ d, sel, onClick }: { d: PlanDimension; sel: boolean; onClick: () => void }) {
  return (
    <button className={`el-item ${sel ? 'sel' : ''}`} onClick={onClick} style={d.status === 'rejected' ? { opacity: 0.55 } : undefined}>
      <span className="num">
        {dimLabelText(d)} <span className="muted">({d.raw})</span>
      </span>
      <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
        <Tag label={dimLabel(d)} />
        {d.status === 'pending' && d.source === 'ai' && <span className="lbl estimated">לבדיקה</span>}
        {d.status === 'rejected' && <span className="lbl assumed">נדחתה</span>}
        {d.agrees === false && <span className="lbl estimated">קו לא תואם</span>}
      </span>
    </button>
  )
}

function DimEditor({ d, onPatch, onZoom }: { d: PlanDimension; onPatch: (p: Partial<PlanDimension>) => void; onZoom: () => void }) {
  return (
    <div className="card" data-testid="dim-editor">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow">{d.kind === 'level' ? (d.relative ? 'מפלס יחסי' : 'מפלס מוחלט') : 'מידת אורך'}</div>
          <div className="h-section num">{dimLabelText(d)}</div>
        </div>
        <Tag label={dimLabel(d)} />
      </div>
      <div className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>
        כתוב בגיליון: {d.raw} · מקור: {d.source === 'ai' ? `קריאה חכמה, ביטחון ${d.confidence === 'high' ? 'גבוה' : d.confidence === 'medium' ? 'בינוני' : 'נמוך'}` : 'שכבת הטקסט של ה-PDF'}
        {d.line ? ` · קו מידה ${d.agrees === false ? 'לא תואם לקנה המידה' : 'נמצא'}` : ' · בלי קו מידה'}
      </div>
      <div className="form-grid">
        <NumField
          label={d.kind === 'level' ? 'ערך (מ\')' : 'אורך (מ\')'}
          value={d.value}
          step={0.01}
          onChange={(v) => onPatch({ value: v, status: 'confirmed' })}
        />
        <label className="field">
          <span>סוג</span>
          <select className="input" value={d.kind} onChange={(e) => onPatch({ kind: e.target.value as PlanDimension['kind'] })}>
            <option value="length">אורך</option>
            <option value="level">מפלס</option>
          </select>
        </label>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        {d.status !== 'confirmed' && (
          <button className="btn primary" onClick={() => onPatch({ status: 'confirmed' })}>
            אישור
          </button>
        )}
        {d.status !== 'rejected' ? (
          <button className="btn danger" onClick={() => onPatch({ status: 'rejected' })}>
            דחייה
          </button>
        ) : (
          <button className="btn" onClick={() => onPatch({ status: 'pending' })}>
            החזרה לבדיקה
          </button>
        )}
        <button className="btn ghost" onClick={onZoom}>
          התמקדות
        </button>
      </div>
    </div>
  )
}
