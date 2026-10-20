import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import { usePermitDoc } from '../lib/usePermit'
import { PT_TO_M_AT_1 } from '../lib/pdf'
import { renderRegion } from '../lib/permitReader'
import { setPlanScale, uid, updateProject, updateVariant, upsertElement } from '../lib/store'
import { dimLabelText, segLen } from '../lib/dims'
import type { Element, Fence, GardenLine, GardenObject, Opening, OpeningType, Pt, Sketch, Surface, SurfaceMaterial, Wall } from '../lib/types'
import { LINES, MATERIALS, OBJECTS, type LineType, type ObjectType } from '../lib/garden'
import { NO_BASIS, numberedNames } from '../lib/bom'
import { bbox } from '../lib/geom'
import { boundsOf, moveElement, rdp, scaleElement } from '../lib/elementGeom'
import { textureUrl } from '../lib/textures'
import { ElementEditor, approvedLabel } from '../components/ElementEditor'
import { GardenPalette, type Group, type Tool } from '../components/GardenPalette'
import { GardenIcon } from '../components/GardenIcons'
import { Empty, Tag, toast } from '../components/ui'

const patternId = (m: SurfaceMaterial, c?: string) => `tex-${m}-${(c ?? 'x').replace('#', '')}`
const GROUP_OF: Partial<Record<Tool, Group>> = { wall: 'house', gwall: 'house', fence: 'house', opening: 'house', line: 'lines' }


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
  const rawTool = params.get('tool')
  const tool: Tool = rawTool === 'surface' ? 'rect' : ((rawTool as Tool) || (hasBasis ? 'select' : 'calibrate'))
  const item = params.get('item')
  const selId = params.get('el')
  const [bg, setBg] = useState<string | null>(null)
  const [pending, setPending] = useState<Pt | null>(null)
  const [polyPts, setPolyPts] = useState<Pt[]>([])
  const [stroke, setStrokePts] = useState<Pt[] | null>(null)
  const [hover, setHover] = useState<Pt | null>(null)
  const [calib, setCalib] = useState<{ a: Pt; b: Pt } | null>(null)
  const [calibDist, setCalibDist] = useState('')
  const [openingType, setOpeningType] = useState<OpeningType>('door')
  const [material, setMaterial] = useState<SurfaceMaterial>('paving')
  const [color, setColor] = useState<string | null>(null)
  const [sketchColor, setSketchColor] = useState('#2f5d4a')
  const [penStroke, setPenStroke] = useState(0.08)
  const [group, setGroup] = useState<Group>(GROUP_OF[tool] ?? (tool === 'object' && item ? (OBJECTS[item as ObjectType]?.group ?? 'plants') : 'tools'))
  const [moving, setMoving] = useState<{ el: Element; start: Pt; dx: number; dy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ sx: number; sy: number; v: View; moved: boolean } | null>(null)

  const page = permit?.pages.find((p) => p.index === permit.planPage)
  // אזור העבודה: השרטוט שנבחר בגיליון, או העמוד כולו
  const region = page ? permit?.region ?? { x: 0, y: 0, w: page.widthPt, h: page.heightPt } : null
  const regX = region ? region.x * displayMpp : 0
  const regY = region ? region.y * displayMpp : 0
  const pageW = region ? region.w * displayMpp : 40
  const pageH = region ? region.h * displayMpp : 30
  const showBg = Boolean(permit && page && !manualOnly)

  const [view, setView] = useState<View>({ x: regX, y: regY, w: pageW, h: pageH })
  const fitKey = `${regX.toFixed(2)}:${regY.toFixed(2)}:${pageW.toFixed(2)}:${pageH.toFixed(2)}`
  const fit = () => {
    const b = hasBasis ? boundsOf(variant.elements) : null
    if (b) {
      const pad = Math.max(4, Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.45)
      setView({ x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + pad * 2, h: b.maxY - b.minY + pad * 2 })
      return
    }
    setView({ x: regX, y: regY, w: pageW, h: pageH })
  }
  useEffect(fit, [fitKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!doc || !permit || manualOnly) return
    let alive = true
    if (!region) return
    renderRegion(doc, permit.planPage, region, 2600)
      .then(({ canvas }) => alive && setBg(canvas.toDataURL('image/jpeg', 0.85)))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [doc, permit?.planPage, manualOnly, region?.x, region?.y, region?.w, region?.h])

  const resetDraft = () => {
    setPending(null)
    setPolyPts([])
    setStrokePts(null)
    setCalib(null)
  }
  const setTool = (t: Tool, it?: string) => {
    const p = new URLSearchParams(params)
    p.set('tool', t)
    if (it) p.set('item', it)
    else p.delete('item')
    setParams(p, { replace: true })
    resetDraft()
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

  const snapPoint = (p: Pt, from?: Pt | null) => {
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

  const src = (what: string) => `שרטוט ידני (${what})`
  const add = (el: Element) => {
    upsertElement(project.id, el)
    select(el.id)
  }

  const makeSurface = (poly: Pt[] | null, rect: { x: number; y: number; w: number; d: number } | null, how: string) => {
    const bb = poly ? bbox(poly) : null
    const el: Surface = {
      id: uid(),
      kind: 'surface',
      material,
      color: color ?? undefined,
      poly: poly ? poly.map((p) => ({ x: r2(p.x), y: r2(p.y) })) : undefined,
      x: bb ? r2(bb.x) : rect!.x,
      y: bb ? r2(bb.y) : rect!.y,
      w: bb ? r2(bb.w) : rect!.w,
      d: bb ? r2(bb.h) : rect!.d,
      level: 0,
      label: 'assumed',
      source: src(`${MATERIALS[material].text}, ${how}`),
      approved: false,
    }
    add(el)
  }

  const finishPoly = () => {
    if (tool === 'poly') {
      if (polyPts.length < 3) {
        toast('משטח מצולע צריך לפחות שלוש נקודות')
        return
      }
      makeSurface(polyPts, null, 'מצולע')
    } else if (tool === 'line' && item) {
      if (polyPts.length < 2) {
        toast('קו צריך לפחות שתי נקודות')
        return
      }
      const def = LINES[item as LineType]
      const el: GardenLine = {
        id: uid(),
        kind: 'line',
        type: item as LineType,
        pts: polyPts.map((p) => ({ x: r2(p.x), y: r2(p.y) })),
        width: def.width,
        height: def.height,
        level: 0,
        label: 'assumed',
        source: src(def.text),
        approved: false,
      }
      add(el)
    }
    setPolyPts([])
  }

  const finishStroke = (pts: Pt[]) => {
    const simple = rdp(pts, view.w / 350)
    if (tool === 'free') {
      if (simple.length < 3) return
      makeSurface(simple, null, 'שרטוט חופשי')
    } else if (tool === 'pen') {
      if (simple.length < 2) return
      const first = simple[0]
      const last = simple[simple.length - 1]
      const closed = simple.length > 3 && Math.hypot(first.x - last.x, first.y - last.y) < view.w / 40
      const el: Sketch = {
        id: uid(),
        kind: 'sketch',
        pts: simple.map((p) => ({ x: r2(p.x), y: r2(p.y) })),
        color: sketchColor,
        stroke: penStroke,
        closed,
        label: 'assumed',
        source: src('קו חופשי'),
        approved: true,
      }
      add(el)
    }
  }

  const clickWorld = (raw: Pt) => {
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
    if (tool === 'free' || tool === 'pen') return
    if (tool === 'object' && item) {
      const def = OBJECTS[item as ObjectType]
      const p = { x: snap(raw.x), y: snap(raw.y) }
      const el: GardenObject = {
        id: uid(),
        kind: 'object',
        type: item as ObjectType,
        x: p.x,
        y: p.y,
        w: def.w,
        d: def.d,
        h: def.h,
        rot: 0,
        level: 0,
        label: 'assumed',
        source: src(def.text),
        approved: false,
      }
      add(el)
      return
    }
    if (tool === 'poly' || tool === 'line') {
      const p = snapPoint(raw, polyPts[polyPts.length - 1])
      if (tool === 'poly' && polyPts.length >= 3 && Math.hypot(p.x - polyPts[0].x, p.y - polyPts[0].y) < view.w / 50) {
        finishPoly()
        return
      }
      setPolyPts((ps) => [...ps, p])
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
      const width = openingType === 'door' ? 0.9 : 1.2
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
      add(o)
      return
    }
    const p = snapPoint(raw, pending)
    if (!pending) {
      setPending(p)
      return
    }
    if (Math.hypot(p.x - pending.x, p.y - pending.y) < 0.1) return
    if (tool === 'wall' || tool === 'gwall') {
      add({
        id: uid(),
        kind: 'wall',
        scope: tool === 'wall' ? 'house' : 'garden',
        x1: pending.x, y1: pending.y, x2: p.x, y2: p.y,
        thickness: tool === 'wall' ? 0.25 : 0.2,
        height: tool === 'wall' ? 3 : 0.6,
        label: 'assumed',
        source: src(tool === 'wall' ? 'קיר בית' : 'קיר גינה'),
        approved: false,
      } satisfies Wall)
    } else if (tool === 'fence') {
      add({ id: uid(), kind: 'fence', x1: pending.x, y1: pending.y, x2: p.x, y2: p.y, height: 1.8, boundary: false, label: 'assumed', source: src('גדר'), approved: false } satisfies Fence)
    } else if (tool === 'rect') {
      makeSurface(null, { x: Math.min(pending.x, p.x), y: Math.min(pending.y, p.y), w: Math.abs(p.x - pending.x) || 1, d: Math.abs(p.y - pending.y) || 1 }, 'מלבן')
    }
    setPending(null)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (hasBasis && (tool === 'free' || tool === 'pen')) {
      ;(e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId)
      setStrokePts([toWorld(e.clientX, e.clientY)])
      return
    }
    drag.current = { sx: e.clientX, sy: e.clientY, v: view, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const w = toWorld(e.clientX, e.clientY)
    if (stroke) {
      const last = stroke[stroke.length - 1]
      if (Math.hypot(w.x - last.x, w.y - last.y) > view.w / 500) setStrokePts([...stroke, w])
      return
    }
    if (moving) {
      setMoving({ ...moving, dx: w.x - moving.start.x, dy: w.y - moving.start.y })
      return
    }
    setHover(pending ? snapPoint(w, pending) : polyPts.length ? snapPoint(w, polyPts[polyPts.length - 1]) : w)
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
    if (stroke) {
      const pts = stroke
      setStrokePts(null)
      finishStroke(pts)
      return
    }
    if (moving) {
      if (Math.hypot(moving.dx, moving.dy) > 0.02) upsertElement(project.id, moveElement(moving.el, r2(moving.dx), r2(moving.dy)))
      setMoving(null)
      return
    }
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'Escape') resetDraft()
      if (e.key === 'Enter' && polyPts.length) finishPoly()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
      variants: p.variants.map((v) => ({ ...v, elements: v.elements.map((e) => scaleElement(e, k)) })),
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
      elements: v.elements.map((e) => ((e.kind === 'wall' || e.kind === 'opening') && !e.approved ? { ...e, approved: true, label: e.label === 'estimated' ? lab : e.label } : e)),
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
  const k = view.w / 900
  const shown = variant.elements.map((e) => (moving && moving.el.id === e.id ? moveElement(e, moving.dx, moving.dy) : e))
  // טקסטורות בשימוש בתוכנית ובטיוטה
  const usedPatterns = new Map<string, { m: SurfaceMaterial; c?: string }>()
  for (const e of shown) if (e.kind === 'surface') usedPatterns.set(patternId(e.material, e.color), { m: e.material, c: e.color })
  usedPatterns.set(patternId(material, color ?? undefined), { m: material, c: color ?? undefined })
  const startMove = (e: Element, ev: React.PointerEvent) => {
    if (e.kind === 'opening') return
    svgRef.current?.setPointerCapture?.(ev.pointerId)
    setMoving({ el: e, start: toWorld(ev.clientX, ev.clientY), dx: 0, dy: 0 })
  }
  const hint =
    tool === 'rect' || tool === 'wall' || tool === 'gwall' || tool === 'fence'
      ? 'שתי לחיצות: נקודה ראשונה ונקודה שנייה. נצמד לזוויות ישרות ולקצוות קיימים.'
      : tool === 'poly'
        ? 'לחיצה לכל קודקוד. סוגרים בלחיצה על הנקודה הראשונה, ב-Enter או ב"סיום".'
        : tool === 'line'
          ? 'לחיצה לכל נקודה בקו. מסיימים ב-Enter או ב"סיום".'
          : tool === 'free'
            ? 'גוררים כדי לצייר את קו המתאר של המשטח.'
            : tool === 'pen'
              ? 'גוררים כדי לצייר. קו שנסגר על עצמו נצבע במילוי שקוף.'
              : tool === 'object'
                ? 'לחיצה על התוכנית מניחה את הפריט. אחר כך אפשר לגרור אותו בכלי הבחירה.'
                : tool === 'select'
                  ? 'לחיצה בוחרת אלמנט, גרירה מזיזה אותו. גרירה ברקע מזיזה את התצוגה.'
                  : ''

  return (
    <div className="stack" style={{ gap: 12 }}>
      <GardenPalette
        group={group}
        setGroup={setGroup}
        state={{ tool, item, material, color, sketchColor, stroke: penStroke }}
        pick={(t, it) => setTool(t, it)}
        setMaterial={(m) => {
          setMaterial(m)
          setColor(null)
          if (tool === 'select' && selected?.kind === 'surface') upsertElement(project.id, { ...selected, material: m, color: undefined })
        }}
        setColor={(c) => {
          setColor(c)
          if (tool === 'select' && selected?.kind === 'surface') upsertElement(project.id, { ...selected, color: c ?? undefined })
        }}
        setSketchColor={setSketchColor}
        setStroke={setPenStroke}
        hasBasis={hasBasis}
      />
      <div className="editor">
        <div className="canvas-box">
          <div className="toolbar" role="toolbar" aria-label="תצוגה">
            <span className="muted hint" style={{ fontSize: 13, alignSelf: 'center' }}>
              {hint}
            </span>
            <span className="spacer" />
            {polyPts.length > 0 && (
              <>
                <button className="btn small primary" onClick={finishPoly}>
                  סיום
                </button>
                <button className="btn small" onClick={() => setPolyPts([])}>
                  ביטול
                </button>
              </>
            )}
            {pending && (
              <button className="btn small" onClick={() => setPending(null)}>
                ביטול נקודה
              </button>
            )}
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
            onDoubleClick={() => polyPts.length && finishPoly()}
            onPointerLeave={() => {
              if (!stroke && !moving) drag.current = null
              setHover(null)
            }}
            data-testid="plan-canvas"
            role="application"
            aria-label="קנבס תוכנית"
            style={{ cursor: tool === 'select' ? 'grab' : 'crosshair' }}
          >
            <defs>
              {[...usedPatterns.entries()].map(([id, { m, c }]) => (
                <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={MATERIALS[m].tile} height={MATERIALS[m].tile}>
                  <image href={textureUrl(m, c, 128)} width={MATERIALS[m].tile} height={MATERIALS[m].tile} preserveAspectRatio="none" />
                </pattern>
              ))}
            </defs>
            {showBg && bg && <image href={bg} x={regX} y={regY} width={pageW} height={pageH} opacity={0.55} preserveAspectRatio="none" />}
            {showBg && <rect x={regX} y={regY} width={pageW} height={pageH} fill="none" stroke="#c2c8c4" strokeWidth={k} />}
            {hasBasis &&
              [...shown]
                .sort((a, b) => order(a) - order(b))
                .map((e) => {
                  const sel = e.id === selId
                  const onDown = (ev: React.PointerEvent) => {
                    if (tool !== 'select') return
                    ev.stopPropagation()
                    drag.current = null
                    select(e.id)
                    startMove(e, ev)
                  }
                  const common = { onPointerDown: onDown, style: { cursor: tool === 'select' ? 'move' : undefined } as React.CSSProperties }
                  return <PlanShape key={e.id} e={e} sel={sel} k={k} walls={walls} common={common} />
                })}
            {pending && hover && (tool === 'rect' ? (
              <rect x={Math.min(pending.x, hover.x)} y={Math.min(pending.y, hover.y)} width={Math.abs(hover.x - pending.x)} height={Math.abs(hover.y - pending.y)} fill={`url(#${patternId(material, color ?? undefined)})`} fillOpacity={0.7} stroke="#2f5d4a" strokeWidth={k} />
            ) : (
              <line x1={pending.x} y1={pending.y} x2={hover.x} y2={hover.y} stroke="#2f5d4a" strokeWidth={k * 3} strokeDasharray={`${k * 5} ${k * 3}`} />
            ))}
            {pending && <circle cx={pending.x} cy={pending.y} r={k * 5} fill="#2f5d4a" />}
            {polyPts.length > 0 && (
              <g>
                {tool === 'poly' && polyPts.length > 1 && (
                  <polygon points={[...polyPts, ...(hover ? [hover] : [])].map((p) => `${p.x},${p.y}`).join(' ')} fill={`url(#${patternId(material, color ?? undefined)})`} fillOpacity={0.6} stroke="none" />
                )}
                <polyline points={[...polyPts, ...(hover ? [hover] : [])].map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#2f5d4a" strokeWidth={k * 2.5} strokeDasharray={`${k * 6} ${k * 3}`} />
                {polyPts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={k * (i === 0 ? 6 : 4)} fill={i === 0 ? '#fff' : '#2f5d4a'} stroke="#2f5d4a" strokeWidth={k * 1.5} />
                ))}
              </g>
            )}
            {stroke && stroke.length > 1 && (
              <polyline
                points={stroke.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={tool === 'free' ? `url(#${patternId(material, color ?? undefined)})` : 'none'}
                fillOpacity={0.6}
                stroke={tool === 'pen' ? sketchColor : '#2f5d4a'}
                strokeWidth={tool === 'pen' ? Math.max(penStroke, k * 1.5) : k * 2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {calib && (
              <g>
                <line x1={calib.a.x} y1={calib.a.y} x2={calib.b.x} y2={calib.b.y} stroke="#9b2c2c" strokeWidth={k * 2} />
                <circle cx={calib.a.x} cy={calib.a.y} r={k * 5} fill="#9b2c2c" />
                <circle cx={calib.b.x} cy={calib.b.y} r={k * 5} fill="#9b2c2c" />
              </g>
            )}
          </svg>
          {hover && hasBasis && (pending || polyPts.length > 0) && (
            <div className="mono" style={{ position: 'absolute', bottom: 8, insetInlineEnd: 8, background: 'rgba(255,255,255,.9)', padding: '2px 8px', borderRadius: 8, fontSize: 12 }}>
              {pending && tool === 'rect'
                ? `${Math.abs(hover.x - pending.x).toFixed(2)} x ${Math.abs(hover.y - pending.y).toFixed(2)} מ'`
                : pending
                  ? `${Math.hypot(hover.x - pending.x, hover.y - pending.y).toFixed(2)} מ'`
                  : `${Math.hypot(hover.x - polyPts[polyPts.length - 1].x, hover.y - polyPts[polyPts.length - 1].y).toFixed(2)} מ'`}{' '}
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
                אין אלמנטים. מזהים אוטומטית במסך ההיתר, או בוחרים כלי או פריט בספריית הגינה.
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
                      {!e.approved && e.kind !== 'sketch' && <span className="lbl estimated">לבדיקה</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

const r2 = (v: number) => Math.round(v * 100) / 100

// סדר ציור: משטחים מתחת, אחריהם קווים, קירות ופריטים, ושרטוט חופשי מעל
const order = (e: Element) => (e.kind === 'surface' ? 0 : e.kind === 'line' ? 1 : e.kind === 'fence' || e.kind === 'wall' ? 2 : e.kind === 'opening' ? 3 : e.kind === 'object' ? 4 : 5)

function PlanShape({ e, sel, k, walls, common }: { e: Element; sel: boolean; k: number; walls: Wall[]; common: { onPointerDown: (ev: React.PointerEvent) => void; style: React.CSSProperties } }) {
  const selStroke = '#1d2120'
  switch (e.kind) {
    case 'surface': {
      const fill = `url(#${patternId(e.material, e.color)})`
      return e.poly ? (
        <polygon points={e.poly.map((v) => `${v.x},${v.y}`).join(' ')} fill={fill} fillOpacity={0.85} stroke={sel ? selStroke : '#6d6a60'} strokeWidth={k * (sel ? 3 : 1)} {...common} />
      ) : (
        <rect x={e.x} y={e.y} width={e.w} height={e.d} fill={fill} fillOpacity={0.85} stroke={sel ? selStroke : '#6d6a60'} strokeWidth={k * (sel ? 3 : 1)} {...common} />
      )
    }
    case 'fence':
      return <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={sel ? selStroke : '#5b4330'} strokeWidth={Math.max(0.08, k * 3)} strokeDasharray={`${k * 8} ${k * 4}`} {...common} />
    case 'wall':
      return (
        <g {...common}>
          <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={sel ? '#2f5d4a' : e.scope === 'garden' ? '#8a6a48' : '#3d4442'} strokeWidth={Math.max(e.thickness, k * 2)} strokeLinecap="butt" opacity={0.9} />
          {!e.approved && <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#e0a100" strokeWidth={k * 2} strokeDasharray={`${k * 6} ${k * 4}`} />}
        </g>
      )
    case 'opening': {
      const w = walls.find((x) => x.id === e.wallId)
      if (!w) return null
      const s = openingSegment(e, w)
      return <line {...s} stroke={sel ? '#2f5d4a' : e.type === 'door' ? '#3b6ea8' : e.type === 'gate' ? '#7a4fa0' : '#3aa0b8'} strokeWidth={Math.max(w.thickness * 1.2, k * 3)} opacity={e.approved ? 1 : 0.75} {...common} />
    }
    case 'object': {
      const def = OBJECTS[e.type]
      const c = e.color ?? def.color
      return (
        <g transform={`translate(${e.x} ${e.y}) rotate(${e.rot})`} {...common}>
          {def.round ? (
            <ellipse rx={e.w / 2} ry={e.d / 2} fill={c} fillOpacity={0.35} stroke={sel ? selStroke : c} strokeWidth={k * (sel ? 3 : 1.5)} />
          ) : (
            <rect x={-e.w / 2} y={-e.d / 2} width={e.w} height={e.d} fill={c} fillOpacity={0.3} stroke={sel ? selStroke : c} strokeWidth={k * (sel ? 3 : 1.5)} rx={Math.min(e.w, e.d) * 0.06} />
          )}
          <svg x={-e.w / 2} y={-e.d / 2} width={e.w} height={e.d} viewBox="0 0 24 24" style={{ color: shadeDark(c), overflow: 'visible' }} preserveAspectRatio="none">
            <GardenIcon id={e.type} />
          </svg>
        </g>
      )
    }
    case 'line': {
      const def = LINES[e.type]
      const c = e.color ?? def.color
      const pts = e.pts.map((p) => `${p.x},${p.y}`).join(' ')
      const w = Math.max(e.width, k * 2)
      const dash = e.type === 'irrigation' ? `${k * 6} ${k * 4}` : e.type === 'light_strip' ? `${k * 2} ${k * 5}` : undefined
      return (
        <g {...common}>
          <polyline points={pts} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} opacity={e.type === 'path' ? 0.75 : 0.95} />
          {e.type === 'hedge' && <polyline points={pts} fill="none" stroke={shadeDark(c)} strokeWidth={w * 0.35} strokeDasharray={`${w * 0.4} ${w * 0.5}`} strokeLinecap="round" />}
          {sel && <polyline points={pts} fill="none" stroke={selStroke} strokeWidth={k * 1.5} strokeDasharray={`${k * 4} ${k * 3}`} />}
        </g>
      )
    }
    case 'sketch': {
      const pts = e.pts.map((p) => `${p.x},${p.y}`).join(' ')
      return e.closed ? (
        <polygon points={pts} fill={e.color} fillOpacity={0.15} stroke={e.color} strokeWidth={Math.max(e.stroke, k)} strokeLinejoin="round" {...common} opacity={sel ? 1 : 0.9} />
      ) : (
        <polyline points={pts} fill="none" stroke={e.color} strokeWidth={Math.max(e.stroke, k)} strokeLinecap="round" strokeLinejoin="round" {...common} opacity={sel ? 1 : 0.9} />
      )
    }
  }
}

function shadeDark(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const f = 0.55
  return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`
}
