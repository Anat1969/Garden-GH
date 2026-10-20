import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import { usePermitDoc } from '../lib/usePermit'
import { PT_TO_M_AT_1 } from '../lib/pdf'
import { renderRegion } from '../lib/permitReader'
import { canRedo, canUndo, redo, removeElement, setPlanScale, uid, undo, updateProject, updateVariant, upsertElement } from '../lib/store'
import { dimLabelText, segLen } from '../lib/dims'
import type { Element, Fence, GardenLine, GardenObject, Opening, OpeningType, Pt, Sketch, Surface, SurfaceMaterial, Wall } from '../lib/types'
import { LINES, MATERIALS, OBJECTS, type LineType, type ObjectType } from '../lib/garden'
import { NO_BASIS, numberedNames, fmtNum, polyLength, surfaceArea } from '../lib/bom'
import { KIND_TEXT, LABEL_TEXT } from '../lib/types'
import { bbox } from '../lib/geom'
import { boundsOf, elementPoints, handlePoints, setVertex, mergeSameMaterial, moveElement, rdp, rotateElement, scaleElement, setEdgeLength, snapMove, snapSet, snapTo, surfacePoly, surfaceWithEdge } from '../lib/elementGeom'
import { IconBtn } from '../components/EditIcons'
import { PLAN_FINISH, useFinish, type PlanFinish } from '../lib/finish'
import { PageIntro } from '../components/PageIntro'
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
  const [showDims, setShowDims] = useState(false)
  const [snapOn, setSnapOn] = useState(true)
  const [finish, setFinish] = useFinish<PlanFinish>('plan', 'texture')
  // גרירת ידית: קודקוד משטח או קו, קצה קיר, או פינת שינוי גודל של פריט
  const [vdrag, setVdrag] = useState<{ el: Element; idx: number; p: Pt } | null>(null)
  const clip = useRef<Element[]>([])
  const [snapHit, setSnapHit] = useState<Pt | null>(null)
  // עריכת מידה ישירות על התוכנית: תיבת קלט מעל תווית המידה
  const [dimEdit, setDimEdit] = useState<{ id: string; part: number | 'w' | 'd' | 'len'; value: string; sx: number; sy: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [moving, setMoving] = useState<{ els: Element[]; start: Pt; dx: number; dy: number } | null>(null)
  // בחירה מרובה כמו בתוכנות שרטוט: האלמנט הראשי בכתובת (el), והשאר כאן
  const [multi, setMulti] = useState<string[]>([])
  // מסגרת בחירה: משמאל לימין בוחרת רק מה שבפנים, מימין לשמאל גם מה שנחתך
  const [box, setBox] = useState<{ a: Pt; b: Pt; sx: number; ex: number; add: boolean } | null>(null)
  const spaceDown = useRef(false)
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
  const select = (id: string | null, keepMulti = false) => {
    const p = new URLSearchParams(params)
    if (id) p.set('el', id)
    else p.delete('el')
    setParams(p, { replace: true })
    if (!keepMulti) setMulti([])
  }
  // בחירת קבוצה: הראשון ראשי, השאר בבחירה המרובה
  const selectMany = (ids: string[]) => {
    const uniq = [...new Set(ids)]
    if (!uniq.length) {
      select(null)
      return
    }
    select(uniq[0], true)
    setMulti(uniq.slice(1))
  }
  const toggleInSelection = (id: string) => {
    const cur = [...(selId ? [selId] : []), ...multi.filter((x) => x !== selId)]
    selectMany(cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur])
  }

  const walls = variant.elements.filter((e): e is Wall => e.kind === 'wall')
  const names = useMemo(() => numberedNames(variant.elements), [variant.elements])
  const selected = variant.elements.find((e) => e.id === selId) ?? null
  const selIds = new Set([...(selId ? [selId] : []), ...multi])
  const selection = variant.elements.filter((e) => selIds.has(e.id))
  const isMulti = selection.length > 1

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

  const snaps = useMemo(() => snapSet(variant.elements), [variant.elements])
  const snapPoint = (p: Pt, from?: Pt | null) => {
    const tol = view.w / 60
    if (snapOn) {
      const hit = snapTo(p, snaps, tol)
      if (hit) return hit.p
    } else {
      for (const ep of endpoints) if (Math.hypot(ep.x - p.x, ep.y - p.y) < tol / 2) return { ...ep }
    }
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
    if (el.kind === 'surface' && snapOn && mergeInto(el)) return
    upsertElement(project.id, el)
    select(el.id)
  }
  // משטח חדש או שהוזז שנוגע במשטח מאותו חומר: מתאחדים למשטח אחד (אפשר לבטל)
  const mergeInto = (el: Surface) => {
    const all = [...variant.elements.filter((e) => e.id !== el.id), el]
    const m = mergeSameMaterial(all, el.id)
    if (!m) return false
    updateVariant(project.id, (v) => ({ ...v, elements: [...v.elements.filter((e) => e.id !== el.id && !m.removed.includes(e.id)), { ...m.merged, label: 'assumed' as const }] }))
    select(m.merged.id)
    toast(`חובר למשטח ${MATERIALS[el.material].text} סמוך. ביטול: Ctrl+Z`)
    return true
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
    // גלגלת (כפתור אמצעי) או רווח לחוץ: הזזת התצוגה, כמו בתוכנות שרטוט
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      e.preventDefault()
      drag.current = { sx: e.clientX, sy: e.clientY, v: view, moved: true }
      return
    }
    if (e.button !== 0) return
    if (hasBasis && (tool === 'free' || tool === 'pen')) {
      ;(e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId)
      setStrokePts([toWorld(e.clientX, e.clientY)])
      return
    }
    // כלי הבחירה: גרירה ברקע פותחת מסגרת בחירה. במגע: הזזת תצוגה
    if (tool === 'select' && hasBasis && e.pointerType !== 'touch') {
      ;(e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId)
      const w = toWorld(e.clientX, e.clientY)
      setBox({ a: w, b: w, sx: e.clientX, ex: e.clientX, add: e.shiftKey || e.ctrlKey || e.metaKey })
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
    if (vdrag) {
      const hit = snapOn ? snapTo(w, snapSet(variant.elements, vdrag.el.id), view.w / 70) : null
      setSnapHit(hit ? hit.p : null)
      setVdrag({ ...vdrag, p: hit ? hit.p : { x: snap(w.x), y: snap(w.y) } })
      return
    }
    if (box) {
      setBox({ ...box, b: w, ex: e.clientX })
      return
    }
    if (moving) {
      const raw = { dx: w.x - moving.start.x, dy: w.y - moving.start.y }
      if (snapOn) {
        const ids = new Set(moving.els.map((x) => x.id))
        const others = snapSet(variant.elements.filter((x) => !ids.has(x.id)))
        const sm = snapMove(moving.els[0], raw.dx, raw.dy, others, view.w / 70)
        setSnapHit(sm.at)
        setMoving({ ...moving, dx: sm.dx, dy: sm.dy })
      } else setMoving({ ...moving, ...raw })
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
    if (vdrag) {
      const changed = setVertex(vdrag.el, vdrag.idx, vdrag.p)
      upsertElement(project.id, { ...changed, label: 'assumed', source: changed.source.includes('נערך בגרירה') ? changed.source : `${changed.source} · נערך בגרירה` } as Element)
      setVdrag(null)
      setSnapHit(null)
      return
    }
    if (box) {
      const bx = box
      setBox(null)
      // לחיצה בלי גרירה: ניקוי הבחירה
      if (Math.abs(bx.ex - bx.sx) < 5 && Math.hypot(bx.b.x - bx.a.x, bx.b.y - bx.a.y) < view.w / 150) {
        if (!bx.add) select(null)
        return
      }
      const x0 = Math.min(bx.a.x, bx.b.x)
      const x1 = Math.max(bx.a.x, bx.b.x)
      const y0 = Math.min(bx.a.y, bx.b.y)
      const y1 = Math.max(bx.a.y, bx.b.y)
      const windowMode = bx.ex > bx.sx
      const inside = (p: Pt) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1
      const hits = variant.elements.filter((el) => {
        if (el.kind === 'opening') return false
        const pts = elementPoints(el)
        if (!pts.length) return false
        if (windowMode) return pts.every(inside)
        const b = boundsOf([el])!
        return pts.some(inside) || !(b.maxX < x0 || b.minX > x1 || b.maxY < y0 || b.minY > y1)
      })
      const ids = hits.map((h) => h.id)
      selectMany(bx.add ? [...(selId ? [selId] : []), ...multi, ...ids] : ids)
      if (ids.length) toast(`נבחרו ${new Set(bx.add ? [...selIds, ...ids] : ids).size} אלמנטים`)
      return
    }
    if (moving) {
      if (Math.hypot(moving.dx, moving.dy) > 0.02) {
        const moved = moving.els.map((x) => moveElement(x, r2(moving.dx), r2(moving.dy)))
        if (moved.length === 1) {
          const m = moved[0]
          if (!(m.kind === 'surface' && snapOn && mergeInto(m))) upsertElement(project.id, m)
        } else {
          const byId = new Map(moved.map((m) => [m.id, m]))
          updateVariant(project.id, (v) => ({ ...v, elements: v.elements.map((x) => byId.get(x.id) ?? x) }))
        }
      }
      setMoving(null)
      setSnapHit(null)
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
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'SELECT') return
      if (e.key === 'Escape') {
        resetDraft()
        setDimEdit(null)
      }
      if (e.key === 'Enter' && polyPts.length) finishPoly()
      if (e.key === ' ' && !['BUTTON', 'A'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault()
        spaceDown.current = true
      }
      if (e.key === 'Escape' && selection.length) select(null)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && tool === 'select') {
        e.preventDefault()
        selectMany(variant.elements.filter((x) => x.kind !== 'opening').map((x) => x.id))
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !polyPts.length) {
        e.preventDefault()
        deleteSelected()
      }
      // חיצים מזיזים את הנבחר: 5 ס"מ, ועם Shift 50 ס"מ
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      if (arrows[e.key] && selection.length) {
        e.preventDefault()
        const st = e.shiftKey ? 0.5 : 0.05
        const ids = new Set(selection.map((x) => x.id))
        updateVariant(project.id, (v) => ({ ...v, elements: v.elements.map((x) => (ids.has(x.id) && x.kind !== 'opening' ? moveElement(x, arrows[e.key][0] * st, arrows[e.key][1] * st) : x)) }), 'nudge')
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selected) {
        e.preventDefault()
        duplicateSelected()
      }
      if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'r' && selected) rotateSelected()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selection.length) {
        clip.current = selection.filter((x) => x.kind !== 'opening')
        toast(`הועתקו ${clip.current.length} אלמנטים`)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clip.current.length) {
        e.preventDefault()
        const copies = clip.current.map((x) => ({ ...moveElement(x, 1, 1), id: uid(), approved: false, label: 'assumed' as const }) as Element)
        clip.current = copies
        updateVariant(project.id, (v) => ({ ...v, elements: [...v.elements, ...copies] }))
        selectMany(copies.map((c) => c.id))
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(project.id)
        else undo(project.id)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo(project.id)
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceDown.current = false
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
  })

  // מרכוז התצוגה על אלמנט (בחירה מהרשימה או מהמודל)
  const focusOn = (el: Element) => {
    const b = boundsOf([el])
    if (!b) return
    const size = Math.max(8, (b.maxX - b.minX) * 3, (b.maxY - b.minY) * 3)
    const r = svgRef.current?.getBoundingClientRect()
    const ar = r && r.height ? r.width / r.height : 1.5
    setView({ x: (b.minX + b.maxX) / 2 - (size * ar) / 2, y: (b.minY + b.maxY) / 2 - size / 2, w: size * ar, h: size })
  }
  const focusParam = params.get('focus')
  useEffect(() => {
    if (focusParam && selected) {
      focusOn(selected)
      const p = new URLSearchParams(params)
      p.delete('focus')
      setParams(p, { replace: true })
    }
  }, [focusParam]) // eslint-disable-line react-hooks/exhaustive-deps
  const deleteSelected = () => {
    if (!selection.length) return
    if (selection.length === 1) removeElement(project.id, selection[0].id)
    else {
      const ids = new Set(selection.map((x) => x.id))
      updateVariant(project.id, (v) => ({ ...v, elements: v.elements.filter((x) => !ids.has(x.id) && !(x.kind === 'opening' && ids.has(x.wallId))) }))
    }
    select(null)
    toast(selection.length > 1 ? `נמחקו ${selection.length} אלמנטים. ביטול: Ctrl+Z` : 'האלמנט נמחק. ביטול: Ctrl+Z')
  }
  const duplicateSelected = () => {
    const src = selection.filter((x) => x.kind !== 'opening')
    if (!src.length) return
    const copies = src.map((x) => ({ ...moveElement(x, 0.5, 0.5), id: uid(), approved: false, label: 'assumed' as const, source: `העתק של ${names.get(x.id) ?? ''}` }) as Element)
    updateVariant(project.id, (v) => ({ ...v, elements: [...v.elements, ...copies] }))
    selectMany(copies.map((c) => c.id))
  }
  const rotateSelected = () => {
    if (!selection.length) return
    if (selection.length === 1) {
      upsertElement(project.id, rotateElement(selection[0], 90))
      return
    }
    const b = boundsOf(selection)!
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
    const byId = new Map(selection.map((x) => [x.id, rotateElement(x, 90, c)]))
    updateVariant(project.id, (v) => ({ ...v, elements: v.elements.map((x) => byId.get(x.id) ?? x) }))
  }
  const approveSelected = () => {
    const ids = new Set(selection.map((x) => x.id))
    const lab = approvedLabel(project)
    updateVariant(project.id, (v) => ({ ...v, elements: v.elements.map((x) => (ids.has(x.id) && !x.approved ? ({ ...x, approved: true, label: x.label === 'estimated' ? lab : x.label } as Element) : x)) }))
    toast(`אושרו ${ids.size} אלמנטים`)
  }
  const mergeSelected = () => {
    if (selected?.kind !== 'surface') return
    if (!mergeInto(selected)) toast('אין משטח נוגע מאותו חומר ובאותו מפלס')
  }

  // החלת מידה שהוקלדה על התוכנית
  const applyDim = () => {
    if (!dimEdit) return
    const v = Number(dimEdit.value)
    const el = variant.elements.find((e) => e.id === dimEdit.id)
    setDimEdit(null)
    if (!el || !(v > 0)) return
    const patch = (x: Element) => upsertElement(project.id, { ...x, label: 'assumed', source: x.source.includes('מידה הוקלדה') ? x.source : `${x.source} · מידה הוקלדה` } as Element)
    if (el.kind === 'surface') {
      if (typeof dimEdit.part === 'number') patch(surfaceWithEdge(el, dimEdit.part, v))
      else if (!el.poly) patch(dimEdit.part === 'w' ? { ...el, w: v } : { ...el, d: v })
    } else if (el.kind === 'object') {
      patch(dimEdit.part === 'w' ? { ...el, w: v } : { ...el, d: v })
    } else if (el.kind === 'wall' || el.kind === 'fence') {
      const L = Math.hypot(el.x2 - el.x1, el.y2 - el.y1) || 1
      patch({ ...el, x2: r2(el.x1 + ((el.x2 - el.x1) * v) / L), y2: r2(el.y1 + ((el.y2 - el.y1) * v) / L) })
    } else if (el.kind === 'line' && typeof dimEdit.part === 'number') {
      patch({ ...el, pts: setEdgeLength(el.pts, dimEdit.part, v, false).map((p) => ({ x: r2(p.x), y: r2(p.y) })) })
    }
  }
  const openDimEdit = (id: string, part: number | 'w' | 'd' | 'len', value: number, at: Pt) => {
    const svg = svgRef.current
    const box = boxRef.current
    if (!svg || !box) return
    const m = svg.getScreenCTM()
    if (!m) return
    const pt = svg.createSVGPoint()
    pt.x = at.x
    pt.y = at.y
    const sp = pt.matrixTransform(m)
    const b = box.getBoundingClientRect()
    setDimEdit({ id, part, value: value.toFixed(2), sx: sp.x - b.left, sy: sp.y - b.top })
  }

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
  const movingIds = new Set(moving?.els.map((x) => x.id) ?? [])
  const shown = variant.elements.map((e) => (moving && movingIds.has(e.id) ? moveElement(e, moving.dx, moving.dy) : vdrag && vdrag.el.id === e.id ? setVertex(e, vdrag.idx, vdrag.p) : e))
  // טקסטורות בשימוש בתוכנית ובטיוטה
  const usedPatterns = new Map<string, { m: SurfaceMaterial; c?: string }>()
  for (const e of shown) if (e.kind === 'surface') usedPatterns.set(patternId(e.material, e.color), { m: e.material, c: e.color })
  usedPatterns.set(patternId(material, color ?? undefined), { m: material, c: color ?? undefined })
  const startMove = (els: Element[], ev: React.PointerEvent) => {
    const list = els.filter((x) => x.kind !== 'opening')
    if (!list.length) return
    svgRef.current?.setPointerCapture?.(ev.pointerId)
    setMoving({ els: list, start: toWorld(ev.clientX, ev.clientY), dx: 0, dy: 0 })
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
                  ? 'לחיצה בוחרת, Shift+לחיצה מוסיף. גרירה ברקע: מסגרת בחירה (משמאל לימין: רק מה שבפנים, מימין לשמאל: גם מה שנחתך). רווח או גלגלת לחוצה: הזזת תצוגה.'
                  : ''

  const surfacesCount = variant.elements.filter((e) => e.kind === 'surface').length
  return (
    <div className="stack" style={{ gap: 12 }}>
      <PageIntro
        art="plan"
        compact
        title="כאן מתכננים: כל קו הוא כמות, וכל כמות היא עלות"
        points={[
          <>בוחרים כלי או פריט ב<b>ספריית הגינה</b>, ומשרטטים במטרים על גבי ההיתר.</>,
          <><b>עכבר:</b> גרירה מזיזה, ידיות בפינות משנות צורה, גלגלת מקרבת.</>,
          <><b>מקלדת:</b> חיצים מזיזים, Delete מוחק, Ctrl+D משכפל, R מסובב, Ctrl+Z מבטל.</>,
          <>לחיצה על <b>מידה</b> של האלמנט הנבחר פותחת הקלדה של מידה חדשה.</>,
        ]}
        legend
        insights={[
          { k: 'אלמנטים', v: variant.elements.length },
          { k: 'משטחים', v: surfacesCount },
          { k: 'ממתינים לאישור', v: pendingCount, tone: pendingCount ? 'warn' : 'good' },
        ]}
      />
      <GardenPalette
        group={group}
        setGroup={setGroup}
        state={{ tool, item, material, color, sketchColor, stroke: penStroke }}
        pick={(t, it) => setTool(t, it)}
        setMaterial={(m) => {
          setMaterial(m)
          setColor(null)
          if (tool === 'select' && selection.some((x) => x.kind === 'surface')) {
            const ids = new Set(selection.filter((x) => x.kind === 'surface').map((x) => x.id))
            updateVariant(project.id, (v) => ({ ...v, elements: v.elements.map((x) => (ids.has(x.id) && x.kind === 'surface' ? { ...x, material: m, color: undefined } : x)) }))
          }
        }}
        setColor={(c) => {
          setColor(c)
          if (tool === 'select' && selection.some((x) => x.kind === 'surface')) {
            const ids = new Set(selection.filter((x) => x.kind === 'surface').map((x) => x.id))
            updateVariant(project.id, (v) => ({ ...v, elements: v.elements.map((x) => (ids.has(x.id) && x.kind === 'surface' ? { ...x, color: c ?? undefined } : x)) }))
          }
        }}
        setSketchColor={setSketchColor}
        setStroke={setPenStroke}
        hasBasis={hasBasis}
      />
      <div className="editor">
        <div className="canvas-box" ref={boxRef} style={{ position: 'relative' }}>
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
            <span className="tool-group" role="group" aria-label="ביטול וחזרה">
              <IconBtn icon="undo" label="ביטול פעולה" iconOnly onClick={() => undo(project.id)} disabled={!canUndo(project)} />
              <IconBtn icon="redo" label="חזרה על פעולה" iconOnly onClick={() => redo(project.id)} disabled={!canRedo(project)} />
            </span>
            <span className="tool-group" role="group" aria-label="תצוגה">
              <IconBtn icon="zoomIn" label="קרוב" iconOnly onClick={() => zoom(1 / 1.3)} />
              <IconBtn icon="zoomOut" label="רחוק" iconOnly onClick={() => zoom(1.3)} />
              <IconBtn icon="fit" label="התאמה" iconOnly onClick={fit} />
            </span>
            <IconBtn icon="snap" label="הצמדה" pressed={snapOn} onClick={() => setSnapOn((v) => !v)} />
            <IconBtn icon="dims" label="הצגת מידות" pressed={showDims} onClick={() => setShowDims((v) => !v)} />
            <span className="tool-group" role="radiogroup" aria-label="רמת גימור">
              {PLAN_FINISH.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={finish === f.id} className={`btn small ${finish === f.id ? 'active' : ''}`} onClick={() => setFinish(f.id)} title={f.d}>
                  {f.t}
                </button>
              ))}
            </span>
          </div>
          {isMulti && hasBasis && tool === 'select' && (
            <div className="selbar" role="toolbar" aria-label="פעולות על הבחירה" data-testid="multi-bar">
              <b>נבחרו {selection.length} אלמנטים</b>
              <span className="muted" style={{ fontSize: 12 }}>
                גרירה מזיזה את כולם · Shift+לחיצה מוסיף או מסיר
              </span>
              <span className="spacer" />
              <IconBtn icon="approve" label="אישור כולם" onClick={approveSelected} />
              <IconBtn icon="duplicate" label="שכפול" onClick={duplicateSelected} />
              <IconBtn icon="rotate" label="סיבוב 90" onClick={rotateSelected} />
              <IconBtn icon="delete" label="מחיקת הבחירה" className="danger" onClick={deleteSelected} />
              <IconBtn icon="close" label="ביטול בחירה" className="ghost" onClick={() => select(null)} />
            </div>
          )}
          {selected && !isMulti && hasBasis && tool === 'select' && (
            <div className="selbar" role="toolbar" aria-label="פעולות על האלמנט הנבחר">
              <b>{names.get(selected.id)}</b>
              <span className="muted" style={{ fontSize: 12 }}>
                לחיצה על מידה על התוכנית משנה אותה
              </span>
              <span className="spacer" />
              {selected.kind !== 'opening' && <IconBtn icon="duplicate" label="שכפול" onClick={duplicateSelected} />}
              {selected.kind !== 'opening' && <IconBtn icon="rotate" label="סיבוב 90" onClick={rotateSelected} />}
              {selected.kind === 'surface' && <IconBtn icon="merge" label="חיבור משטחים" onClick={mergeSelected} />}
              <IconBtn icon="delete" label="מחיקת האלמנט" className="danger" onClick={deleteSelected} />
            </div>
          )}
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
                  const sel = selIds.has(e.id)
                  const onDown = (ev: React.PointerEvent) => {
                    if (tool !== 'select' || ev.button !== 0 || spaceDown.current) return
                    ev.stopPropagation()
                    drag.current = null
                    // Shift או Ctrl: הוספה או הסרה מהבחירה
                    if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
                      toggleInSelection(e.id)
                      return
                    }
                    // גרירת אלמנט מתוך בחירה מרובה מזיזה את כולה
                    if (sel && selection.length > 1) {
                      startMove(selection, ev)
                      return
                    }
                    select(e.id)
                    startMove([e], ev)
                  }
                  const common = { onPointerDown: onDown, style: { cursor: tool === 'select' ? 'move' : undefined } as React.CSSProperties }
                  return <PlanShape key={e.id} e={e} sel={sel} k={k} walls={walls} common={common} finish={finish} />
                })}
            {pending && hover && (tool === 'rect' ? (
              <rect x={Math.min(pending.x, hover.x)} y={Math.min(pending.y, hover.y)} width={Math.abs(hover.x - pending.x)} height={Math.abs(hover.y - pending.y)} fill={`url(#${patternId(material, color ?? undefined)})`} fillOpacity={0.7} stroke="#2f5d4a" strokeWidth={k} />
            ) : (
              <line x1={pending.x} y1={pending.y} x2={hover.x} y2={hover.y} stroke="#2f5d4a" strokeWidth={k * 3} strokeDasharray={`${k * 5} ${k * 3}`} />
            ))}
            {hasBasis && showDims && <PlanDims elements={shown.filter((e) => e.id !== selId)} k={k} />}
            {hasBasis && selected && !isMulti && <SelDims e={shown.find((x) => x.id === selected.id) ?? selected} k={k} onEdit={openDimEdit} />}
            {hasBasis && selected && !isMulti && tool === 'select' && !moving &&
              handlePoints(shown.find((x) => x.id === selected.id) ?? selected).map((h, i) => (
                <rect
                  key={i}
                  className="handle"
                  data-testid="handle"
                  x={h.x - k * 4.5}
                  y={h.y - k * 4.5}
                  width={k * 9}
                  height={k * 9}
                  fill="#fff"
                  stroke="#2f5d4a"
                  strokeWidth={k * 1.8}
                  onPointerDown={(ev) => {
                    ev.stopPropagation()
                    drag.current = null
                    svgRef.current?.setPointerCapture?.(ev.pointerId)
                    setVdrag({ el: selected, idx: i, p: h })
                  }}
                />
              ))}
            {box && (
              <rect
                data-testid="select-box"
                x={Math.min(box.a.x, box.b.x)}
                y={Math.min(box.a.y, box.b.y)}
                width={Math.abs(box.b.x - box.a.x)}
                height={Math.abs(box.b.y - box.a.y)}
                fill={box.ex > box.sx ? 'rgba(59,110,168,0.12)' : 'rgba(47,125,74,0.12)'}
                stroke={box.ex > box.sx ? '#3b6ea8' : '#2f7d4a'}
                strokeWidth={k * 1.4}
                strokeDasharray={box.ex > box.sx ? undefined : `${k * 6} ${k * 4}`}
                pointerEvents="none"
              />
            )}
            {snapHit && <circle cx={snapHit.x} cy={snapHit.y} r={k * 6} fill="none" stroke="#c0392b" strokeWidth={k * 1.6} />}
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
          {dimEdit && (
            <form
              className="dim-edit"
              style={{ left: dimEdit.sx, top: dimEdit.sy }}
              onSubmit={(e) => {
                e.preventDefault()
                applyDim()
              }}
            >
              <input
                ref={(el) => {
                  if (el && document.activeElement !== el && !el.dataset.f) {
                    el.dataset.f = '1'
                    setTimeout(() => {
                      el.focus()
                      el.select()
                    }, 0)
                  }
                }}
                className="input num"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={dimEdit.value}
                onChange={(e) => setDimEdit({ ...dimEdit, value: e.target.value })}
                onKeyDown={(e) => e.key === 'Escape' && setDimEdit(null)}
                aria-label="מידה חדשה במטרים"
              />
              <span>מ'</span>
              <button type="submit" className="btn small primary">
                החלה
              </button>
              <button type="button" className="btn small ghost" onClick={() => setDimEdit(null)}>
                ביטול
              </button>
            </form>
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

          {isMulti && hasBasis && (
            <div className="card" data-testid="multi-editor">
              <div className="eyebrow">בחירה מרובה</div>
              <div className="h-section">{selection.length} אלמנטים</div>
              <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                {Object.entries(selection.reduce<Record<string, number>>((a, x) => ({ ...a, [KIND_TEXT[x.kind]]: (a[KIND_TEXT[x.kind]] ?? 0) + 1 }), {}))
                  .map(([k2, n]) => `${n} ${k2}`)
                  .join(' · ')}
              </div>
              <ol className="steps-list" style={{ marginTop: 8 }}>
                <li>חומר מהספרייה חל על כל המשטחים שנבחרו.</li>
                <li>חיצים מזיזים את כולם, Delete מוחק, Ctrl+D משכפל, R מסובב סביב המרכז המשותף.</li>
              </ol>
            </div>
          )}
          {selected && !isMulti && hasBasis && <ElementEditor project={project} el={selected} elements={variant.elements} name={names.get(selected.id) ?? ''} onClose={() => select(null)} />}

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
                    className={`el-item ${selIds.has(e.id) ? 'sel' : ''}`}
                    onClick={(ev) => {
                      if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
                        toggleInSelection(e.id)
                        return
                      }
                      select(e.id)
                      focusOn(e)
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

// מידות של האלמנט הנבחר: כל צלע, רוחב ועומק. לחיצה על תווית פותחת הקלדה של מידה חדשה
function SelDims({ e, k, onEdit }: { e: Element; k: number; onEdit: (id: string, part: number | 'w' | 'd' | 'len', value: number, at: Pt) => void }) {
  const fs = k * 12
  const tag = (x: number, y: number, text: string, onClick: () => void, key: string) => (
    <g
      key={key}
      className="dim-tag"
      // לחיצה פותחת תיבת הקלדה. מונעים את פעולת ברירת המחדל כדי שהתיבה לא תאבד פוקוס מיד
      onPointerDown={(ev) => {
        ev.stopPropagation()
        ev.preventDefault()
      }}
      onClick={(ev) => {
        ev.stopPropagation()
        onClick()
      }}
      data-testid="sel-dim"
    >
      <rect x={x - fs * 2.6} y={y - fs * 0.75} width={fs * 5.2} height={fs * 1.5} rx={fs * 0.4} fill="#1d2120" opacity={0.86} />
      <text x={x} y={y} fontSize={fs} textAnchor="middle" dominantBaseline="central" fill="#fff" style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
        {text}
      </text>
    </g>
  )
  // תווית מחוץ לצלע: הסטה בניצב לכיוון מרכז הצורה
  const edgeTags = (pts: Pt[], closed: boolean) => {
    const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 })
    const n = closed ? pts.length : pts.length - 1
    const out = []
    for (let i = 0; i < n; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      if (L < 0.05) continue
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      let nx = -(b.y - a.y) / L
      let ny = (b.x - a.x) / L
      if ((m.x + nx - c.x) ** 2 + (m.y + ny - c.y) ** 2 < (m.x - c.x) ** 2 + (m.y - c.y) ** 2) {
        nx = -nx
        ny = -ny
      }
      const at = closed ? { x: m.x + nx * fs * 1.4, y: m.y + ny * fs * 1.4 } : { x: m.x + nx * fs * 1.2, y: m.y + ny * fs * 1.2 }
      out.push(tag(at.x, at.y, `${L.toFixed(2)}`, () => onEdit(e.id, i, L, at), `e${i}`))
    }
    return out
  }
  switch (e.kind) {
    case 'surface':
      return <g data-testid="sel-dims">{edgeTags(surfacePoly(e), true)}</g>
    case 'line':
      return <g data-testid="sel-dims">{edgeTags(e.pts, false)}</g>
    case 'wall':
    case 'fence': {
      const L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1)
      const at = { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 - fs * 1.4 }
      return <g data-testid="sel-dims">{tag(at.x, at.y, L.toFixed(2), () => onEdit(e.id, 'len', L, at), 'len')}</g>
    }
    case 'object': {
      const w = { x: e.x, y: e.y - e.d / 2 - fs * 1.3 }
      const d = { x: e.x + e.w / 2 + fs * 3, y: e.y }
      return (
        <g data-testid="sel-dims">
          {tag(w.x, w.y, e.w.toFixed(2), () => onEdit(e.id, 'w', e.w, w), 'w')}
          {tag(d.x, d.y, e.d.toFixed(2), () => onEdit(e.id, 'd', e.d, d), 'd')}
        </g>
      )
    }
    default:
      return null
  }
}

// סדר ציור: משטחים מתחת, אחריהם קווים, קירות ופריטים, ושרטוט חופשי מעל
const order = (e: Element) => (e.kind === 'surface' ? 0 : e.kind === 'line' ? 1 : e.kind === 'fence' || e.kind === 'wall' ? 2 : e.kind === 'opening' ? 3 : e.kind === 'object' ? 4 : 5)

function PlanShape({ e, sel, k, walls, common, finish }: { e: Element; sel: boolean; k: number; walls: Wall[]; common: { onPointerDown: (ev: React.PointerEvent) => void; style: React.CSSProperties }; finish: PlanFinish }) {
  const selStroke = '#1d2120'
  const line = finish === 'line'
  switch (e.kind) {
    case 'surface': {
      const fill = line ? '#ffffff' : finish === 'color' ? e.color || MATERIALS[e.material].color : `url(#${patternId(e.material, e.color)})`
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
      const c = line ? '#1d2120' : e.color ?? def.color
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
      const c = line ? '#6d706d' : e.color ?? def.color
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

// תוויות מידה על התוכנית: אורך קירות, גדרות ואלמנטים קוויים, שטח משטחים, מידות פריטים. מוצגות רק לפי בקשה
function PlanDims({ elements, k }: { elements: Element[]; k: number }) {
  const fs = k * 11
  const label = (key: string, x: number, y: number, text: string, color = '#1d2120') => (
    <g key={key} pointerEvents="none">
      <text x={x} y={y} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill={color} stroke="#fff" strokeWidth={k * 3.2} paintOrder="stroke" style={{ fontFamily: 'IBM Plex Sans Hebrew, sans-serif' }}>
        {text}
      </text>
    </g>
  )
  return (
    <g data-testid="plan-dims">
      {elements.map((e) => {
        const tag = LABEL_TEXT[e.label]
        if (e.kind === 'wall' || e.kind === 'fence') {
          const L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1)
          if (L < 0.5) return null
          return label(e.id, (e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2 - fs, `${fmtNum(L)}${e.kind === 'wall' ? ` × ${fmtNum(e.thickness)}` : ''} מ' · ${tag}`)
        }
        if (e.kind === 'surface') {
          const c = e.poly ? e.poly.reduce((a, p) => ({ x: a.x + p.x / e.poly!.length, y: a.y + p.y / e.poly!.length }), { x: 0, y: 0 }) : { x: e.x + e.w / 2, y: e.y + e.d / 2 }
          return (
            <g key={e.id}>
              {label(`${e.id}a`, c.x, c.y - fs * 0.6, `${fmtNum(surfaceArea(e))} מ"ר · ${tag}`, '#2f5d4a')}
              {label(`${e.id}b`, c.x, c.y + fs * 0.7, `${fmtNum(e.w)} × ${fmtNum(e.d)} מ'`, '#48546b')}
            </g>
          )
        }
        if (e.kind === 'line') {
          const m = e.pts[Math.floor(e.pts.length / 2)]
          return m ? label(e.id, m.x, m.y - fs, `${fmtNum(polyLength(e.pts))} × ${fmtNum(e.width)} מ' · ${tag}`, '#2f5d4a') : null
        }
        if (e.kind === 'object') return label(e.id, e.x, e.y + e.d / 2 + fs, `${fmtNum(e.w)}×${fmtNum(e.d)} · ${tag}`, '#48546b')
        return null
      })}
    </g>
  )
}
