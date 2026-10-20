import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import { usePermitDoc } from '../lib/usePermit'
import { PT_TO_M_AT_1, renderPage } from '../lib/pdf'
import { setPlanScale, uid, updateProject, updateVariant, upsertElement } from '../lib/store'
import { dimLabelText, segLen } from '../lib/dims'
import type { Element, Fence, Opening, OpeningType, Surface, SurfaceMaterial, Wall } from '../lib/types'
import { MATERIAL_COLOR, MATERIAL_TEXT } from '../lib/types'
import { NO_BASIS, numberedNames } from '../lib/bom'
import { ElementEditor, approvedLabel } from '../components/ElementEditor'
import { Empty, Tag, toast } from '../components/ui'

type Tool = 'select' | 'wall' | 'gwall' | 'opening' | 'surface' | 'fence' | 'calibrate'

const TOOLS: { id: Tool; t: string }[] = [
  { id: 'select', t: 'בחירה' },
  { id: 'wall', t: 'קיר בית' },
  { id: 'gwall', t: 'קיר גינה' },
  { id: 'opening', t: 'פתח' },
  { id: 'surface', t: 'משטח' },
  { id: 'fence', t: 'גדר' },
  { id: 'calibrate', t: 'כיול' },
]


interface View {
  x: number
  y: number
  w: number
  h: number
}

const snap = (v: number) => Math.round(v / 0.05) * 0.05

export function openingSegment(o: Opening, w: Wall) {
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1
  const ux = (w.x2 - w.x1) / L
  const uy = (w.y2 - w.y1) / L
  return { x1: w.x1 + ux * o.offset, y1: w.y1 + uy * o.offset, x2: w.x1 + ux * (o.offset + o.width), y2: w.y1 + uy * (o.offset + o.width) }
}

function projectOnWall(px: number, py: number, w: Wall) {
  const dx = w.x2 - w.x1
  const dy = w.y2 - w.y1
  const L2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((px - w.x1) * dx + (py - w.y1) * dy) / L2))
  const qx = w.x1 + t * dx
  const qy = w.y1 + t * dy
  return { t, dist: Math.hypot(px - qx, py - qy), along: t * Math.sqrt(L2) }
}

export default function PlanTab() {
  const { project, variant } = useProject()
  const [params, setParams] = useSearchParams()
  const { doc, status } = usePermitDoc(project)
  const permit = project.permit
  const mpp = permit?.scale.metersPerPt ?? null
  const manualOnly = permit?.scale.source === 'manual-only'
  // בלי קנה מידה מציגים את הגיליון ב-1:100 זמני, רק לצורך כיול
  const displayMpp = mpp ?? 100 * PT_TO_M_AT_1
  const hasBasis = Boolean(mpp) || manualOnly
  const tool = (params.get('tool') as Tool) || (hasBasis ? 'select' : 'calibrate')
  const selId = params.get('el')
  const [bg, setBg] = useState<string | null>(null)
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [calib, setCalib] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null)
  const [calibDist, setCalibDist] = useState('')
  const [openingType, setOpeningType] = useState<OpeningType>('door')
  const [material, setMaterial] = useState<SurfaceMaterial>('paving')
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ sx: number; sy: number; v: View; moved: boolean } | null>(null)

  const page = permit?.pages.find((p) => p.index === permit.planPage)
  const pageW = page ? page.widthPt * displayMpp : 40
  const pageH = page ? page.heightPt * displayMpp : 30
  const showBg = Boolean(permit && page && !manualOnly)

  const [view, setView] = useState<View>({ x: 0, y: 0, w: pageW, h: pageH })
  const fitKey = `${pageW.toFixed(2)}:${pageH.toFixed(2)}`
  const fit = () => {
    const els = variant.elements
    if (els.length && hasBasis) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const e of els) {
        const pts = e.kind === 'surface' ? [[e.x, e.y], [e.x + e.w, e.y + e.d]] : e.kind === 'opening' ? [] : [[e.x1, e.y1], [e.x2, e.y2]]
        for (const [x, y] of pts) {
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
        }
      }
      if (Number.isFinite(minX)) {
        const pad = Math.max(4, Math.max(maxX - minX, maxY - minY) * 0.45)
        setView({ x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 })
        return
      }
    }
    setView({ x: 0, y: 0, w: pageW, h: pageH })
  }
  useEffect(fit, [fitKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!doc || !permit || manualOnly) return
    let alive = true
    renderPage(doc, permit.planPage, 2400)
      .then((u) => alive && setBg(u))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [doc, permit?.planPage, manualOnly])

  const setTool = (t: Tool) => {
    const p = new URLSearchParams(params)
    p.set('tool', t)
    setParams(p, { replace: true })
    setPending(null)
    setCalib(null)
  }
  const select = (id: string | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('el', id)
    else p.delete('el')
    setParams(p, { replace: true })
  }

  const walls = variant.elements.filter((e): e is Wall => e.kind === 'wall')
  const names = useMemo(() => numberedNames(variant.elements), [variant.elements])
  const selected = variant.elements.find((e) => e.id === selId) ?? null

  const toWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const m = svg.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const r = pt.matrixTransform(m.inverse())
    return { x: r.x, y: r.y }
  }

  const endpoints = useMemo(
    () => variant.elements.flatMap((e) => (e.kind === 'wall' || e.kind === 'fence' ? [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }] : [])),
    [variant.elements],
  )

  const snapPoint = (p: { x: number; y: number }, from?: { x: number; y: number } | null) => {
    const tol = view.w / 60
    for (const ep of endpoints) if (Math.hypot(ep.x - p.x, ep.y - p.y) < tol) return { ...ep }
    let x = snap(p.x)
    let y = snap(p.y)
    if (from) {
      const dx = x - from.x
      const dy = y - from.y
      const ang = Math.abs(Math.atan2(dy, dx))
      if (ang < 0.14 || ang > Math.PI - 0.14) y = from.y
      else if (Math.abs(ang - Math.PI / 2) < 0.14) x = from.x
    }
    return { x, y }
  }

  const src = (tool: string) => `שרטוט ידני (${tool})`

  const clickWorld = (raw: { x: number; y: number }) => {
    if (tool === 'calibrate') {
      if (!calib) setCalib({ a: raw, b: raw })
      else if (calib.a === calib.b) setCalib({ a: calib.a, b: raw })
      else setCalib({ a: raw, b: raw })
      return
    }
    if (!hasBasis) return
    if (tool === 'select') {
      select(null)
      return
    }
    if (tool === 'opening') {
      let best: { w: Wall; along: number; dist: number } | null = null
      for (const w of walls) {
        const pr = projectOnWall(raw.x, raw.y, w)
        if (!best || pr.dist < best.dist) best = { w, along: pr.along, dist: pr.dist }
      }
      if (!best || best.dist > Math.max(0.6, view.w / 40)) {
        toast('יש ללחוץ על קיר כדי להוסיף בו פתח')
        return
      }
      const width = openingType === 'door' ? 0.9 : openingType === 'gate' ? 1.2 : 1.2
      const L = Math.hypot(best.w.x2 - best.w.x1, best.w.y2 - best.w.y1)
      const o: Opening = {
        id: uid(),
        kind: 'opening',
        wallId: best.w.id,
        type: openingType,
        offset: Math.max(0, Math.min(L - width, snap(best.along - width / 2))),
        width,
        height: openingType === 'window' ? 1.2 : 2.1,
        sill: openingType === 'window' ? 0.9 : 0,
        label: 'assumed',
        source: src('פתח'),
        approved: false,
      }
      upsertElement(project.id, o)
      select(o.id)
      return
    }
    const p = snapPoint(raw, pending)
    if (!pending) {
      setPending(p)
      return
    }
    if (Math.hypot(p.x - pending.x, p.y - pending.y) < 0.1) return
    let el: Element
    if (tool === 'wall' || tool === 'gwall') {
      el = {
        id: uid(),
        kind: 'wall',
        scope: tool === 'wall' ? 'house' : 'garden',
        x1: pending.x, y1: pending.y, x2: p.x, y2: p.y,
        thickness: tool === 'wall' ? 0.25 : 0.2,
        height: tool === 'wall' ? 3 : 0.6,
        label: 'assumed',
        source: src(tool === 'wall' ? 'קיר בית' : 'קיר גינה'),
        approved: false,
      } satisfies Wall
    } else if (tool === 'fence') {
      el = { id: uid(), kind: 'fence', x1: pending.x, y1: pending.y, x2: p.x, y2: p.y, height: 1.8, boundary: false, label: 'assumed', source: src('גדר'), approved: false } satisfies Fence
    } else {
      el = {
        id: uid(),
        kind: 'surface',
        material,
        x: Math.min(pending.x, p.x), y: Math.min(pending.y, p.y),
        w: Math.abs(p.x - pending.x) || 1, d: Math.abs(p.y - pending.y) || 1,
        level: 0,
        label: 'assumed',
        source: src(MATERIAL_TEXT[material]),
        approved: false,
      } satisfies Surface
    }
    upsertElement(project.id, el)
    setPending(null)
    select(el.id)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    drag.current = { sx: e.clientX, sy: e.clientY, v: view, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const w = toWorld(e.clientX, e.clientY)
    setHover(pending ? snapPoint(w, pending) : w)
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    d.moved = true
    const rect = svgRef.current!.getBoundingClientRect()
    const k = Math.max(d.v.w / rect.width, d.v.h / rect.height)
    setView({ ...d.v, x: d.v.x - dx * k, y: d.v.y - dy * k })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (d && !d.moved) clickWorld(toWorld(e.clientX, e.clientY))
  }
  const zoom = (f: number, cx?: number, cy?: number) => {
    setView((v) => {
      const px = cx ?? v.x + v.w / 2
      const py = cy ?? v.y + v.h / 2
      return { x: px - (px - v.x) * f, y: py - (py - v.y) * f, w: v.w * f, h: v.h * f }
    })
  }
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

  const applyCalibration = () => {
    if (!calib || !permit) return
    const D = Number(calibDist)
    const dw = Math.hypot(calib.b.x - calib.a.x, calib.b.y - calib.a.y)
    if (!(D > 0) || dw < 1e-6) {
      toast('יש לסמן שתי נקודות ולהזין מרחק חיובי')
      return
    }
    const k = D / dw
    const newMpp = displayMpp * k
    updateProject(project.id, (p) => ({
      ...p,
      permit: p.permit ? { ...p.permit, scale: { den: null, metersPerPt: newMpp, source: 'calibrated' } } : p.permit,
      variants: p.variants.map((v) => ({
        ...v,
        elements: v.elements.map((e) => scaleElement(e, k)),
      })),
    }))
    setCalib(null)
    setCalibDist('')
    toast('קנה המידה כויל')
    setTool('select')
  }

  const approveAll = () => {
    const lab = approvedLabel(project)
    updateVariant(project.id, (v) => ({
      ...v,
      elements: v.elements.map((e) => (e.kind === 'wall' || e.kind === 'opening') && !e.approved ? { ...e, approved: true, label: e.label === 'estimated' ? lab : e.label } : e),
    }))
    toast('כל הקירות והפתחים אושרו')
  }

  if (!permit && !manualOnly) {
    return (
      <div className="card">
        <Empty title={NO_BASIS}>
          <div>כדי לשרטט צריך היתר עם קנה מידה, או לעבוד על מידות ידניות בלבד.</div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link className="btn primary" to="../permit">
              העלאת היתר
            </Link>
            <button
              className="btn"
              onClick={() =>
                updateProject(project.id, (p) => ({
                  ...p,
                  permit: { fileName: 'ללא היתר', declaredType: 'vector', pageCount: 0, pages: [], planPage: 0, scale: { den: null, metersPerPt: null, source: 'manual-only' } },
                }))
              }
            >
              מידות ידניות בלבד
            </button>
          </div>
        </Empty>
      </div>
    )
  }

  const calibDims = (permit?.dims ?? [])
    .filter((d) => d.page === permit?.planPage && d.kind === 'length' && d.line && (d.status === 'confirmed' || d.source === 'text-layer'))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
  const pendingCount = variant.elements.filter((e) => !e.approved && (e.kind === 'wall' || e.kind === 'opening')).length
  const strokeK = view.w / 900

  return (
    <div className="editor">
      <div className="canvas-box">
        <div className="toolbar" role="toolbar" aria-label="כלי שרטוט">
          {TOOLS.map((t) => (
            <button key={t.id} className={`btn small ${tool === t.id ? 'active' : ''}`} onClick={() => setTool(t.id)} disabled={!hasBasis && t.id !== 'calibrate'} aria-pressed={tool === t.id}>
              {t.t}
            </button>
          ))}
          <span className="spacer" />
          <button className="btn small" onClick={() => zoom(1 / 1.3)}>
            קרוב
          </button>
          <button className="btn small" onClick={() => zoom(1.3)}>
            רחוק
          </button>
          <button className="btn small" onClick={fit}>
            התאמה
          </button>
        </div>
        {status === 'loading' && showBg && !bg && <div className="notice info" style={{ margin: 8 }}>טוען את גיליון התוכנית</div>}
        {status === 'missing' && showBg && <div className="notice" style={{ margin: 8 }}>קובץ ההיתר לא נמצא במכשיר. האלמנטים מוצגים בלי רקע.</div>}
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => {
            drag.current = null
            setHover(null)
          }}
          data-testid="plan-canvas"
          role="application"
          aria-label="קנבס תוכנית"
          style={{ cursor: tool === 'select' ? 'grab' : 'crosshair' }}
        >
          {showBg && bg && <image href={bg} x={0} y={0} width={pageW} height={pageH} opacity={0.55} preserveAspectRatio="none" />}
          {showBg && <rect x={0} y={0} width={pageW} height={pageH} fill="none" stroke="#c2c8c4" strokeWidth={strokeK} />}
          {hasBasis &&
            variant.elements.map((e) => {
              const sel = e.id === selId
              const onClick = (ev: React.PointerEvent) => {
                if (tool !== 'select') return
                ev.stopPropagation()
                drag.current = null
                select(e.id)
              }
              if (e.kind === 'surface')
                return (
                  <rect key={e.id} x={e.x} y={e.y} width={e.w} height={e.d} fill={MATERIAL_COLOR[e.material]} fillOpacity={0.6} stroke={sel ? '#1d2120' : '#6d6a60'} strokeWidth={strokeK * (sel ? 3 : 1)} onPointerDown={onClick} style={{ cursor: 'pointer' }} />
                )
              if (e.kind === 'fence')
                return (
                  <line key={e.id} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={sel ? '#1d2120' : '#5b4330'} strokeWidth={Math.max(0.08, strokeK * 3)} strokeDasharray={`${strokeK * 8} ${strokeK * 4}`} onPointerDown={onClick} style={{ cursor: 'pointer' }} />
                )
              if (e.kind === 'wall')
                return (
                  <g key={e.id} onPointerDown={onClick} style={{ cursor: 'pointer' }}>
                    <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={sel ? '#2f5d4a' : e.scope === 'garden' ? '#8a6a48' : '#3d4442'} strokeWidth={Math.max(e.thickness, strokeK * 2)} strokeLinecap="butt" opacity={0.9} />
                    {!e.approved && <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#e0a100" strokeWidth={strokeK * 2} strokeDasharray={`${strokeK * 6} ${strokeK * 4}`} />}
                  </g>
                )
              const w = walls.find((x) => x.id === e.wallId)
              if (!w) return null
              const s = openingSegment(e, w)
              return (
                <line key={e.id} {...s} stroke={sel ? '#2f5d4a' : e.type === 'door' ? '#3b6ea8' : e.type === 'gate' ? '#7a4fa0' : '#3aa0b8'} strokeWidth={Math.max(w.thickness * 1.2, strokeK * 3)} onPointerDown={onClick} style={{ cursor: 'pointer' }} opacity={e.approved ? 1 : 0.75} />
              )
            })}
          {pending && hover && (tool === 'surface' ? (
            <rect x={Math.min(pending.x, hover.x)} y={Math.min(pending.y, hover.y)} width={Math.abs(hover.x - pending.x)} height={Math.abs(hover.y - pending.y)} fill={MATERIAL_COLOR[material]} fillOpacity={0.4} stroke="#2f5d4a" strokeWidth={strokeK} />
          ) : (
            <line x1={pending.x} y1={pending.y} x2={hover.x} y2={hover.y} stroke="#2f5d4a" strokeWidth={strokeK * 3} strokeDasharray={`${strokeK * 5} ${strokeK * 3}`} />
          ))}
          {pending && <circle cx={pending.x} cy={pending.y} r={strokeK * 5} fill="#2f5d4a" />}
          {calib && (
            <g>
              <line x1={calib.a.x} y1={calib.a.y} x2={calib.b.x} y2={calib.b.y} stroke="#9b2c2c" strokeWidth={strokeK * 2} />
              <circle cx={calib.a.x} cy={calib.a.y} r={strokeK * 5} fill="#9b2c2c" />
              <circle cx={calib.b.x} cy={calib.b.y} r={strokeK * 5} fill="#9b2c2c" />
            </g>
          )}
        </svg>
        {pending && hover && hasBasis && tool !== 'opening' && (
          <div className="mono" style={{ position: 'absolute', bottom: 8, insetInlineEnd: 8, background: 'rgba(255,255,255,.9)', padding: '2px 8px', borderRadius: 8, fontSize: 12 }}>
            {tool === 'surface'
              ? `${Math.abs(hover.x - pending.x).toFixed(2)} x ${Math.abs(hover.y - pending.y).toFixed(2)} מ'`
              : `${Math.hypot(hover.x - pending.x, hover.y - pending.y).toFixed(2)} מ'`}{' '}
            · הונח
          </div>
        )}
      </div>

      <aside className="side">
        {!hasBasis && <div className="notice danger">{NO_BASIS}. מכיילים קנה מידה: שתי לחיצות על מידה ידועה בגיליון, ואז המרחק במטרים.</div>}

        {tool === 'calibrate' && (
          <div className="card">
            <div className="h-section">כיול קנה מידה</div>
            <div className="muted" style={{ fontSize: 14, margin: '4px 0 10px' }}>
              {!calib ? 'לוחצים על נקודה ראשונה של מידה ידועה.' : calib.a === calib.b ? 'לוחצים על הנקודה השנייה.' : 'מזינים את המרחק האמיתי בין הנקודות.'}
            </div>
            <div className="row">
              <label className="field" style={{ flex: 1 }}>
                <span>מרחק אמיתי (מ')</span>
                <input className="input num" type="number" inputMode="decimal" step="0.01" value={calibDist} onChange={(e) => setCalibDist(e.target.value)} />
              </label>
              <button className="btn primary" style={{ alignSelf: 'end' }} onClick={applyCalibration} disabled={!calib || calib.a === calib.b}>
                החלת כיול
              </button>
            </div>
            {hasBasis && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>כיול חוזר משנה את קנה המידה של כל האלמנטים בהתאם.</div>}
            {calibDims.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                  או כיול לפי מידה כתובה בהיתר (מאושרת):
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {calibDims.map((d) => (
                    <button
                      key={d.id}
                      className="btn small"
                      onClick={() => {
                        setPlanScale(project.id, { den: null, metersPerPt: d.value / segLen(d.line!), source: 'calibrated' })
                        toast(`כויל לפי המידה ${d.raw}`)
                        setTool('select')
                      }}
                    >
                      {dimLabelText(d)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tool === 'opening' && (
          <div className="card flat">
            <div className="muted" style={{ fontSize: 14, marginBottom: 8 }}>
              לוחצים על קיר כדי להוסיף בו פתח.
            </div>
            <div className="row">
              {(['door', 'window', 'gate'] as OpeningType[]).map((t) => (
                <button key={t} className={`btn small ${openingType === t ? 'active' : ''}`} onClick={() => setOpeningType(t)}>
                  {t === 'door' ? 'דלת' : t === 'window' ? 'חלון' : 'שער'}
                </button>
              ))}
            </div>
          </div>
        )}
        {tool === 'surface' && (
          <div className="card flat">
            <div className="muted" style={{ fontSize: 14, marginBottom: 8 }}>
              שתי לחיצות: פינה ופינה נגדית.
            </div>
            <div className="row">
              {(Object.keys(MATERIAL_TEXT) as SurfaceMaterial[]).map((m) => (
                <button key={m} className={`btn small ${material === m ? 'active' : ''}`} onClick={() => setMaterial(m)}>
                  {MATERIAL_TEXT[m]}
                </button>
              ))}
            </div>
          </div>
        )}
        {(tool === 'wall' || tool === 'gwall' || tool === 'fence') && (
          <div className="card flat muted" style={{ fontSize: 14 }}>
            שתי לחיצות: תחילה וסוף. נצמד לזוויות ישרות ולקצוות קיימים.
            {pending && (
              <button className="btn small" style={{ marginInlineStart: 8 }} onClick={() => setPending(null)}>
                ביטול נקודה
              </button>
            )}
          </div>
        )}

        {selected && hasBasis && <ElementEditor project={project} el={selected} elements={variant.elements} name={names.get(selected.id) ?? ''} onClose={() => select(null)} />}

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <div className="h-section">אלמנטים ({variant.elements.length})</div>
            {pendingCount > 0 && (
              <button className="btn small primary" onClick={approveAll}>
                אישור כל הקירות והפתחים ({pendingCount})
              </button>
            )}
          </div>
          {variant.elements.length === 0 ? (
            <div className="muted" style={{ fontSize: 14 }}>
              אין אלמנטים. מזהים אוטומטית במסך ההיתר, או משרטטים בכלים שמעל לקנבס.
            </div>
          ) : (
            <div className="el-list">
              {variant.elements.map((e) => (
                <button
                  key={e.id}
                  className={`el-item ${e.id === selId ? 'sel' : ''}`}
                  onClick={() => {
                    select(e.id)
                    if (tool !== 'select') setTool('select')
                  }}
                >
                  <span>{names.get(e.id)}</span>
                  <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    <Tag label={e.label} />
                    {!e.approved && <span className="lbl estimated">לבדיקה</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function scaleElement(e: Element, k: number): Element {
  switch (e.kind) {
    case 'wall':
      return { ...e, x1: e.x1 * k, y1: e.y1 * k, x2: e.x2 * k, y2: e.y2 * k, thickness: e.thickness * k }
    case 'fence':
      return { ...e, x1: e.x1 * k, y1: e.y1 * k, x2: e.x2 * k, y2: e.y2 * k }
    case 'surface':
      return { ...e, x: e.x * k, y: e.y * k, w: e.w * k, d: e.d * k }
    case 'opening':
      return { ...e, offset: e.offset * k, width: e.width * k }
  }
}

