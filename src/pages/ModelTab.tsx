import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls as OrbitImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import { Link, useSearchParams } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import type { Element, Fence, Opening, Project, Surface, Wall } from '../lib/types'
import { MATERIAL_COLOR, MATERIAL_TEXT } from '../lib/types'
import { LINES, MATERIALS, OBJECTS } from '../lib/garden'
import { boundsOf } from '../lib/elementGeom'
import { textureUrl } from '../lib/textures'
import { GardenLineMesh, GardenObjectMesh, SketchMesh, SurfMat, useSurfaceTexture } from '../components/garden3d'
import { MODEL_FINISH, ModelFinishCtx, useFinish, useModelFinish, type ModelFinish } from '../lib/finish'
import { ElementEditor } from '../components/ElementEditor'
import { hasBasis, numberedNames, surfaceArea, fmtNum, polyLength } from '../lib/bom'
import { BuildingMass, HouseMat, Label3D, NorthArrow, PolySurface, SitePlinth, StairSurface, Tree, unitFootprints } from '../components/model3d'
import { baseAbs } from '../lib/structureToElements'
import { LABEL_TEXT } from '../lib/types'
import { pointInPoly } from '../lib/geom'
import { Tag } from '../components/ui'
import { IconBtn } from '../components/EditIcons'
import { buildHouse, type BuildResult } from '../lib/buildHouse'
import { PageIntro } from '../components/PageIntro'
import { ClimateInsights, ClimatePanel, useClimateData, useClimateState, dirText, type ClimateData, type ClimateLayer } from '../components/ClimatePanel'
import { HeatLayer, SeatSpots, SunLight, SunPath, WindArrow, WindParticles, sunVector } from '../components/climate3d'
import { Atmosphere, GrassField, NatureGround, PostFX, RealSurfMat, StoneWallMat } from '../components/realism3d'
import { fmtHour } from '../lib/sun'
import { saveDocBlob } from '../lib/idb'
import { modelImageKey } from '../components/PrintVisuals'
import * as THREE from 'three'

// שומר תמונה של המודל לצירוף להדפסה ולגיליון, כמה שניות אחרי שהתצוגה נרגעת
function AutoSnapshot({ projectId, version, enabled }: { projectId: string; version: string; enabled: boolean }) {
  const { gl } = useThree()
  useEffect(() => {
    if (!enabled) return
    const t = setTimeout(() => {
      try {
        gl.domElement.toBlob((b) => b && void saveDocBlob(`img:${modelImageKey(projectId)}`, b), 'image/jpeg', 0.88)
      } catch {
        /* בלי תמונה */
      }
    }, 3500)
    return () => clearTimeout(t)
  }, [gl, projectId, version, enabled])
  return null
}

export type ViewPreset = 'bird' | 'top' | 'eye'
export const VIEW_PRESETS: { id: ViewPreset; t: string; d: string }[] = [
  { id: 'bird', t: 'מבט ציפור', d: 'מבט אלכסוני על הבית והגינה' },
  { id: 'top', t: 'מבט על', d: 'התוכנית מלמעלה, עם המידות' },
  { id: 'eye', t: 'גובה עיניים', d: 'כמו מי שעומד בגינה' },
]

function Controls({ target, dist, focus, view }: { target: [number, number, number]; dist: number; focus: { at: [number, number, number]; key: number } | null; view: { id: ViewPreset; key: number } }) {
  const { camera, gl, invalidate } = useThree()
  const ref = useRef<OrbitImpl | null>(null)
  // מבטים מוכנים: מבט על לתוכנית עם מידות, מבט ציפור, וגובה עיניים מהגינה
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.target.set(target[0], 0, target[2])
    if (view.id === 'top') camera.position.set(target[0], dist * 1.25, target[2] + 0.01)
    else if (view.id === 'eye') camera.position.set(target[0] + dist * 0.15, 1.65, target[2] + dist * 0.55)
    else camera.position.set(target[0] + dist * 0.7, dist * 0.75, target[2] + dist * 0.9)
    if (view.id === 'eye') c.target.set(target[0], 1.2, target[2])
    c.update()
    invalidate()
  }, [view.key]) // eslint-disable-line react-hooks/exhaustive-deps
  // מיקוד על אלמנט שנבחר מהרשימה: המצלמה מתקרבת אליו ושומרת על כיוון המבט
  useEffect(() => {
    const c = ref.current
    if (!c || !focus) return
    const dir = camera.position.clone().sub(c.target).normalize()
    if (dir.y < 0.45) dir.setY(0.45).normalize()
    const d = Math.max(18, dist * 0.8)
    c.target.set(...focus.at)
    camera.position.set(focus.at[0] + dir.x * d, focus.at[1] + dir.y * d, focus.at[2] + dir.z * d)
    c.update()
    invalidate()
  }, [focus?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = new OrbitImpl(camera, gl.domElement)
    c.enableDamping = true
    c.maxPolarAngle = Math.PI / 2.02
    c.target.set(...target)
    camera.position.set(target[0] + dist * 0.7, dist * 0.75, target[2] + dist * 0.9)
    c.update()
    ref.current = c
    // מצייר רק כשהמצלמה זזה (כולל ההאטה של הסיבוב)
    const onChange = () => invalidate()
    c.addEventListener('change', onChange)
    invalidate()
    let raf = 0
    const loop = () => {
      c.update()
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      c.removeEventListener('change', onChange)
      c.dispose()
    }
  }, [camera, gl, target[0], target[2], dist]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

interface Piece {
  s: number
  e: number
  y0: number
  y1: number
}

function wallPieces(w: Wall, openings: Opening[]): Piece[] {
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1)
  // הארכה בחצי עובי בכל קצה: הפינות נסגרות והקירות נראים כמקשה אחת
  const ext = w.thickness / 2
  const ops = openings.filter((o) => o.wallId === w.id).sort((a, b) => a.offset - b.offset)
  const out: Piece[] = []
  let cur = 0
  for (const o of ops) {
    const s = Math.max(cur, Math.min(L, o.offset))
    const e = Math.max(s, Math.min(L, o.offset + o.width))
    if (s > cur) out.push({ s: cur, e: s, y0: 0, y1: w.height })
    if (o.sill > 0) out.push({ s, e, y0: 0, y1: Math.min(o.sill, w.height) })
    const top = o.sill + o.height
    if (top < w.height) out.push({ s, e, y0: top, y1: w.height })
    cur = e
  }
  if (cur < L) out.push({ s: cur, e: L, y0: 0, y1: w.height })
  return out.map((p) => ({ ...p, s: p.s <= 0.001 && p.y0 === 0 ? -ext : p.s, e: p.e >= L - 0.001 && p.y0 === 0 ? L + ext : p.e }))
}

// קירות כמעט זהים (מבנייה כפולה) מוצגים פעם אחת
function dedupeWalls(walls: Wall[]): Wall[] {
  const out: Wall[] = []
  const near = (a: number, b: number) => Math.abs(a - b) < 0.12
  for (const w of walls) {
    const dup = out.some((o) => (near(o.x1, w.x1) && near(o.y1, w.y1) && near(o.x2, w.x2) && near(o.y2, w.y2)) || (near(o.x1, w.x2) && near(o.y1, w.y2) && near(o.x2, w.x1) && near(o.y2, w.y1)))
    if (!dup) out.push(w)
  }
  return out
}

const pick = (id: string, onSelect: (id: string) => void) => (ev: ThreeEvent<MouseEvent>) => {
  ev.stopPropagation()
  onSelect(id)
}

// הבית: מסה אחידה, חלקה ושקופה למחצה, בלי חומרים. תפקידו להראות פתחים, כניסות ופרופורציות.
// קירות הגינה נשארים בחומר שלהם. הבחירה והעריכה עובדות כרגיל.
const ENTRY = '#c0673a' // דלתות וכניסות מודגשות

function WallMesh({ w, openings, selected, onSelect }: { w: Wall; openings: Opening[]; selected: string | null; onSelect: (id: string) => void }) {
  const ang = Math.atan2(w.y2 - w.y1, w.x2 - w.x1)
  const sel = selected === w.id
  const finish = useModelFinish()
  const house = w.scope === 'house'
  const color = finish === 'massing' ? '#cfd0cc' : '#a99c86'
  const real = finish === 'detailed'
  return (
    <group position={[w.x1, 0, w.y1]} rotation={[0, -ang, 0]}>
      {wallPieces(w, openings).map((p, i) => (
        <mesh key={i} position={[(p.s + p.e) / 2, (p.y0 + p.y1) / 2, 0]} castShadow receiveShadow={!house} onClick={pick(w.id, onSelect)}>
          <boxGeometry args={[Math.max(0.001, p.e - p.s), Math.max(0.001, p.y1 - p.y0), Math.max(0.05, w.thickness)]} />
          {house ? (
            <HouseMat sel={sel} />
          ) : real && !sel ? (
            <StoneWallMat L={p.e - p.s} H={p.y1 - p.y0} />
          ) : (
            <meshStandardMaterial color={sel ? '#2f5d4a' : color} emissive={sel ? '#2f5d4a' : '#000000'} emissiveIntensity={sel ? 0.3 : 0} roughness={0.9} />
          )}
        </mesh>
      ))}
      {openings
        .filter((o) => o.wallId === w.id)
        .map((o) => {
          const isSel = selected === o.id
          const entry = o.type !== 'window'
          return (
            <group key={o.id} position={[o.offset + o.width / 2, o.sill + o.height / 2, 0]} onClick={pick(o.id, onSelect)}>
              <mesh>
                <boxGeometry args={[o.width, o.height, Math.max(0.05, w.thickness * 0.4)]} />
                <meshStandardMaterial color={isSel ? '#2f5d4a' : entry ? ENTRY : '#a9c6d3'} transparent opacity={entry ? 0.85 : 0.55} roughness={0.3} />
              </mesh>
              {/* סף כניסה: פס על הקרקע מול דלת, כדי שיראו מאיפה נכנסים ויוצאים */}
              {entry && o.sill < 0.1 && (
                <mesh position={[0, -o.height / 2 + 0.01, w.thickness / 2 + 0.45]} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[o.width, 0.9]} />
                  <meshBasicMaterial color={ENTRY} transparent opacity={0.35} depthWrite={false} />
                </mesh>
              )}
            </group>
          )
        })}
    </group>
  )
}

function SurfaceMesh({ s, selected, onSelect }: { s: Surface; selected: boolean; onSelect: (id: string) => void }) {
  const h = MATERIALS[s.material].height
  const tile = MATERIALS[s.material].tile
  const tex = useSurfaceTexture(s.material, s.color, [s.w / tile, s.d / tile])
  return (
    <mesh position={[s.x + s.w / 2, s.level + h / 2, s.y + s.d / 2]} receiveShadow castShadow onClick={pick(s.id, onSelect)}>
      <boxGeometry args={[s.w, h, s.d]} />
      <SurfMat material={s.material} color={s.color} selected={selected} tex={tex} />
    </mesh>
  )
}

function FenceMesh({ f, selected, onSelect }: { f: Fence; selected: boolean; onSelect: (id: string) => void }) {
  const real = useModelFinish() === 'detailed'
  const L = Math.hypot(f.x2 - f.x1, f.y2 - f.y1)
  const ang = Math.atan2(f.y2 - f.y1, f.x2 - f.x1)
  return (
    <group position={[f.x1, 0, f.y1]} rotation={[0, -ang, 0]}>
      <mesh position={[L / 2, f.height / 2, 0]} castShadow receiveShadow onClick={pick(f.id, onSelect)}>
        <boxGeometry args={[L, f.height, 0.05]} />
        {real && !selected ? <RealSurfMat material="deck" color="#7d5c3e" repeat={[Math.max(0.3, L / 1.2), Math.max(0.3, f.height / 1.2)]} /> : <meshStandardMaterial color={selected ? '#2f5d4a' : '#6b4f36'} roughness={0.9} />}
      </mesh>
    </group>
  )
}

function Scene({ project, elements: rawElements, selected, onSelect, showDims, focusKey, climate, layer, season, view }: { project: Project; elements: Element[]; selected: string | null; onSelect: (id: string | null) => void; showDims: boolean; focusKey: number; climate: ClimateData; layer: ClimateLayer; season: import('../lib/sun').Season; view: { id: ViewPreset; key: number } }) {
  const finish = useModelFinish()
  const real = finish === 'detailed'
  const elements = useMemo(() => {
    const walls = dedupeWalls(rawElements.filter((e): e is Wall => e.kind === 'wall'))
    const ids = new Set(walls.map((w) => w.id))
    return rawElements.filter((e) => e.kind !== 'wall' || ids.has(e.id))
  }, [rawElements])
  const focus = useMemo(() => {
    const el = elements.find((e) => e.id === selected)
    const b = el ? boundsOf([el]) : null
    return b && focusKey ? { at: [(b.minX + b.maxX) / 2, 0.5, (b.minY + b.maxY) / 2] as [number, number, number], key: focusKey } : null
  }, [focusKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const bounds = useMemo(() => {
    let minL = 0
    for (const e of elements) if (e.kind === 'surface' || e.kind === 'object' || e.kind === 'line') minL = Math.min(minL, e.level)
    const b = boundsOf(elements)
    if (!b) return { cx: 0, cy: 0, size: 20, minX: -10, minY: -10, minL: 0, siteL: 0 }
    const { minX, minY, maxX, maxY } = b
    // מדרגות שיורדות מתחת לגינה (אל הרחוב): הקרקע יורדת למפלס התחתון, והמגרש מוצג כגוש
    let siteL = minL
    for (const e of elements) if (e.kind === 'surface' && e.stairs) siteL = Math.min(siteL, e.stairs.bottom)
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, size: Math.max(8, maxX - minX, maxY - minY), minX, minY, minL, siteL }
  }, [elements])
  const plinth = useMemo(() => {
    if (bounds.siteL > bounds.minL - 0.3) return null
    const st0 = project.permit?.structure
    const k = project.permit?.scale.metersPerPt
    const b = boundsOf(elements)
    const plot = st0?.plot?.length && k ? st0.plot.map((v) => ({ x: v.x * k, y: v.y * k })) : b ? [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }] : null
    if (!plot) return null
    const cuts = elements.filter((e): e is Surface => e.kind === 'surface' && Boolean(e.stairs) && Boolean(e.poly)).map((e) => e.poly!)
    return { plot, cuts }
  }, [bounds, elements, project.permit])
  const groundY = (plinth ? bounds.siteL : bounds.minL) - 0.06
  // הגינה במרכז הבמה: המצלמה מכוונת למרכז המשטחים והפריטים, לא למרכז הבית
  const gardenC = useMemo(() => {
    const g = boundsOf(elements.filter((e) => e.kind === 'surface' || e.kind === 'object' || e.kind === 'line'))
    return g ? { x: (g.minX + g.maxX) / 2, y: (g.minY + g.maxY) / 2 } : { x: bounds.cx, y: bounds.cy }
  }, [elements, bounds])
  const openings = elements.filter((e): e is Opening => e.kind === 'opening')
  // כשנבחר קיר או פתח בקומת הקרקע, הקומות העליונות והגג מוסתרים כדי שיראו אותו
  const selEl = elements.find((e) => e.id === selected)
  const groundSel = Boolean(selEl && ((selEl.kind === 'wall' && selEl.scope === 'house') || selEl.kind === 'opening'))
  const footprints = useMemo(() => unitFootprints(project), [project])
  const st = project.permit?.structure
  const mpp = project.permit?.scale.metersPerPt ?? 0
  const base = baseAbs(project)
  const surfaces = elements.filter((e): e is Surface => e.kind === 'surface')
  const levelAt = (x: number, y: number) => surfaces.find((sf) => sf.poly && pointInPoly({ x, y }, sf.poly))?.level ?? 0
  // אור השמש האמיתי: בשכבת שמש ונוחות, ובגימור מפורט (שעה ועונה מהלוח)
  const sunLit = real || layer === 'sun' || layer === 'comfort'
  const center = { x: bounds.cx, y: bounds.cy }
  const north = climate.site.north
  const sunDir = useMemo(() => sunVector(climate.sun.az, Math.max(1, climate.sun.el), north), [climate.sun.az, climate.sun.el, north])
  const g = climate.grid
  return (
    <>
      {sunLit ? (
        <>
          <hemisphereLight args={['#dfeaf5', '#b9b39f', real ? 0.35 : 0.55]} />
          <SunLight center={center} size={bounds.size} az={climate.sun.az} el={climate.sun.el} north={north} intensity={real ? 2.6 : 2} />
        </>
      ) : (
        <>
          <hemisphereLight args={['#ffffff', '#b8c4bb', 0.7]} />
          <directionalLight position={[bounds.cx + bounds.size, bounds.size * 1.4, bounds.cy + bounds.size * 0.6]} intensity={1.6} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-bounds.size} shadow-camera-right={bounds.size} shadow-camera-top={bounds.size} shadow-camera-bottom={-bounds.size} />
        </>
      )}
      {real && <Atmosphere center={center} size={bounds.size} sunDir={sunDir} />}
      {real ? (
        <NatureGround center={center} size={bounds.size} y={groundY} onClick={() => onSelect(null)} />
      ) : (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.cx, groundY, bounds.cy]} receiveShadow onClick={() => onSelect(null)}>
            <planeGeometry args={[bounds.size * 4, bounds.size * 4]} />
            <meshStandardMaterial color="#dfe3dc" roughness={1} />
          </mesh>
          <gridHelper args={[bounds.size * 4, Math.round(bounds.size * 4), '#c5ccc6', '#d6dbd6']} position={[bounds.cx, groundY + 0.01, bounds.cy]} />
        </>
      )}
      {plinth && <SitePlinth plot={plinth.plot} cuts={plinth.cuts} top={bounds.minL - 0.06} bottom={groundY} onClick={() => onSelect(null)} />}
      {real && <GrassField surfaces={surfaces} />}
      {real && layer === 'none' && !showDims && <PostFX />}
      {g && climate.values && <HeatLayer g={g} values={climate.values} ramp={climate.ramp} max={climate.max} opacity={layer === 'sun' ? 0.72 : 0.78} />}
      {layer === 'sun' && <SunPath center={center} size={bounds.size} lat={climate.site.city.lat} lon={climate.site.city.lon} north={north} season={season} az={climate.sun.az} el={climate.sun.el} />}
      {g && layer === 'wind' && climate.windSpeed && <WindParticles g={g} speed={climate.windSpeed} dir={climate.wind.dir} north={north} />}
      {(layer === 'wind' || layer === 'comfort') && <WindArrow center={center} size={bounds.size} dir={climate.wind.dir} north={north} text={`רוח מ${dirText(climate.wind.dir)}`} />}
      {layer === 'comfort' && <SeatSpots spots={climate.spots} label={season === 'winter' ? 'ישיבה בחורף' : season === 'summer' ? 'ישיבה בקיץ' : 'ישיבה'} size={bounds.size} />}
      {elements.map((e) =>
        e.kind === 'wall' ? (
          <WallMesh key={e.id} w={e} openings={openings} selected={selected} onSelect={onSelect} />
        ) : e.kind === 'surface' ? (
          e.stairs ? <StairSurface key={e.id} s={e} selected={selected === e.id} onSelect={onSelect} /> : e.poly ? <PolySurface key={e.id} s={e} selected={selected === e.id} onSelect={onSelect} /> : <SurfaceMesh key={e.id} s={e} selected={selected === e.id} onSelect={onSelect} />
        ) : e.kind === 'fence' ? (
          <FenceMesh key={e.id} f={e} selected={selected === e.id} onSelect={onSelect} />
        ) : e.kind === 'object' ? (
          <GardenObjectMesh key={e.id} o={e} selected={selected === e.id} onSelect={onSelect} />
        ) : e.kind === 'line' ? (
          <GardenLineMesh key={e.id} l={e} selected={selected === e.id} onSelect={onSelect} />
        ) : e.kind === 'sketch' ? (
          <SketchMesh key={e.id} s={e} selected={selected === e.id} onSelect={onSelect} />
        ) : null,
      )}
      {project.building && footprints.length > 0 && !groundSel && <BuildingMass footprints={footprints} b={project.building} />}
      {st && mpp > 0 && st.trees.map((t, i) => <Tree key={i} at={{ x: t.at.x * mpp, y: t.at.y * mpp }} r={t.r * mpp} kind={t.kind} level={levelAt(t.at.x * mpp, t.at.y * mpp)} />)}
      {showDims && <DimLabels elements={elements} k={Math.max(0.38, bounds.size * 0.022)} compact={view.id === 'top'} />}
      {showDims && view.id !== 'top' && st && mpp > 0 &&
        st.levels.slice(0, 60).map((l, i) => {
          const x = l.at.x * mpp
          const y = l.at.y * mpp
          const rel = l.rel ?? (l.abs !== null && base !== null ? l.abs - base : null)
          const txt = `${l.abs !== null ? l.abs.toFixed(2) : ''}${rel !== null ? ` (${rel >= 0 ? '+' : ''}${rel.toFixed(2)})` : ''}`
          return txt ? <Label3D key={`lv${i}`} text={txt} position={[x, levelAt(x, y) + 0.8, y]} size={Math.max(0.36, bounds.size * 0.022)} color="#48546b" /> : null
        })}
      <NorthArrow deg={project.north || 0} at={{ x: bounds.minX - 2, y: bounds.minY - 2 }} size={Math.max(1.2, bounds.size * 0.05)} />
      <Controls target={[gardenC.x, 0, gardenC.y]} dist={bounds.size * 1.1} focus={focus} view={view} />
    </>
  )
}

// תוויות מידה: אורך, רוחב, שטח וגובה. במבט על: תוויות קצרות כמו בשרטוט, בלי תגיות ובלי חפיפה
function DimLabels({ elements, k, compact }: { elements: Element[]; k: number; compact?: boolean }) {
  const tag = (l: Element['label']) => (compact ? '' : ` · ${LABEL_TEXT[l]}`)
  const placed: { x: number; y: number }[] = []
  // בלי חפיפה: תווית שקרובה מדי לתווית קודמת לא מוצגת
  const free = (x: number, y: number) => {
    if (placed.some((p) => Math.abs(p.x - x) < k * 7 && Math.abs(p.y - y) < k * 2.2)) return false
    placed.push({ x, y })
    return true
  }
  const ordered = [...elements].sort((a, b) => (b.kind === 'surface' ? surfaceArea(b as Surface) : 0) - (a.kind === 'surface' ? surfaceArea(a as Surface) : 0))
  return (
    <>
      {ordered.map((e) => {
        if (e.kind === 'wall' || e.kind === 'fence') {
          const L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1)
          if (L < (compact ? 3.5 : 2.5) || (e.kind === 'wall' && e.scope === 'house' && !e.approved && L < 4)) return null
          const x = (e.x1 + e.x2) / 2
          const y = (e.y1 + e.y2) / 2
          if (compact && !free(x, y)) return null
          return <Label3D key={e.id} text={`${fmtNum(L)} מ' · גובה ${fmtNum(e.height)}${tag(e.label)}`} position={[x, e.height + k, y]} size={k} />
        }
        if (e.kind === 'surface') {
          const A = surfaceArea(e)
          if (compact && A < 4) return null
          const c = e.poly ? centroid(e.poly) : { x: e.x + e.w / 2, y: e.y + e.d / 2 }
          if (compact && !free(c.x, c.y)) return null
          const lvl = `${e.level >= 0 ? '+' : ''}${e.level.toFixed(2)}`
          return <Label3D key={e.id} text={compact ? `${fmtNum(A)} מ"ר · ${fmtNum(e.w)}×${fmtNum(e.d)} · ${lvl}` : `${fmtNum(A)} מ"ר · ${fmtNum(e.w)}×${fmtNum(e.d)} מ' · ${lvl}${tag(e.label)}`} position={[c.x, e.level + k * 1.5, c.y]} size={k * 1.1} color="#2f5d4a" />
        }
        if (e.kind === 'object') {
          if (Math.max(e.w, e.d) < 1.5) return null
          if (compact && !free(e.x, e.y)) return null
          return <Label3D key={e.id} text={`${OBJECTS[e.type].text} ${fmtNum(e.w)}×${fmtNum(e.d)} · גובה ${fmtNum(e.h)}${tag(e.label)}`} position={[e.x, e.level + e.h + k, e.y]} size={k} color="#2f5d4a" />
        }
        if (e.kind === 'line') {
          const L = polyLength(e.pts)
          if (L < 2) return null
          const m = e.pts[Math.floor(e.pts.length / 2)]
          if (compact && !free(m.x, m.y)) return null
          return <Label3D key={e.id} text={`${LINES[e.type].text} ${fmtNum(L)} מ'${e.type === 'path' ? ` × ${fmtNum(e.width)}` : ` · גובה ${fmtNum(e.height)}`}${tag(e.label)}`} position={[m.x, e.level + e.height + k, m.y]} size={k} color="#2f5d4a" />
        }
        return null
      })}
    </>
  )
}

function centroid(p: { x: number; y: number }[]) {
  let x = 0
  let y = 0
  p.forEach((v) => {
    x += v.x
    y += v.y
  })
  return { x: x / p.length, y: y / p.length }
}

// בניית הבית מההיתר ישירות ממסך המודל, עם הסבר ברור כשמשהו חסר
function BuildHousePanel({ projectId, title, empty }: { projectId: string; title: string; empty?: boolean }) {
  const [res, setRes] = useState<BuildResult | null>(null)
  return (
    <div className="card build-house" data-testid="build-house">
      <div className="h-section" style={{ marginBottom: 4 }}>
        {title}
      </div>
      <ol className="steps-list">
        <li>
          <b>בניית הבית מההיתר</b> בונה בתלת-ממד את הקירות, הפתחים, גבול המגרש ואזורי הגינה מקריאת ההיתר.
        </li>
        <li>כשחסר קנה מידה, הוא נקבע מהמידות שכתובות בהיתר.</li>
        {empty && <li>אפשר גם לשרטט קירות ומשטחים ידנית בתוכנית.</li>}
      </ol>
      <div className="row" style={{ marginTop: 10 }}>
        <IconBtn icon="build" label="בניית הבית מההיתר" className="primary" onClick={() => setRes(buildHouse(projectId))} testId="build-house-btn" />
        {empty && (
          <Link className="btn" to="../plan">
            לשרטוט ידני בתוכנית
          </Link>
        )}
      </div>
      {res && (
        <div className={`notice ${res.ok ? 'info' : 'danger'}`} style={{ marginTop: 10 }} data-testid="build-house-result">
          <ol className="steps-list">
            {res.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
          {!res.ok && res.next && (
            <Link className="btn small primary" to={`../${res.next.to}`} style={{ marginTop: 8 }}>
              {res.next.t}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

export default function ModelTab() {
  const { project, variant } = useProject()
  const [params, setParams] = useSearchParams()
  const selId = params.get('el')
  const names = useMemo(() => numberedNames(variant.elements), [variant.elements])
  const selected = variant.elements.find((e) => e.id === selId) ?? null
  const [showDims, setShowDims] = useState(false)
  const [finish, setFinish] = useFinish<ModelFinish>('model', 'detailed')
  const [focusKey, setFocusKey] = useState(0)
  const [view, setView] = useState<{ id: ViewPreset; key: number }>({ id: 'bird', key: 0 })
  const pickView = (id: ViewPreset) => {
    setView((v) => ({ id, key: v.key + 1 }))
    if (id === 'top') setShowDims(true)
  }
  const climateState = useClimateState()
  const climate = useClimateData(project, variant.elements, climateState.st)
  const glRef = useRef<THREE.WebGLRenderer | null>(null)
  const snapshot = () => {
    const gl = glRef.current
    if (!gl) return
    const name = `${(project.name || 'הדמיה').replace(/[\\/:*?"<>|]/g, ' ')} ${fmtHour(climateState.st.hour).replace(':', '')}.png`
    gl.domElement.toBlob((b) => {
      if (!b) return
      const url = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    }, 'image/png')
  }
  const select = (id: string | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('el', id)
    else p.delete('el')
    setParams(p, { replace: true })
  }

  const houseWalls = variant.elements.filter((e) => e.kind === 'wall' && e.scope === 'house').length
  if (!hasBasis(project) || !variant.elements.length) {
    return <BuildHousePanel projectId={project.id} empty title={!hasBasis(project) ? 'המודל עוד לא נבנה: חסר קנה מידה' : 'אין עדיין אלמנטים למודל'} />
  }

  const unapproved = variant.elements.filter((e) => !e.approved).length

  return (
    <div className="stack" style={{ gap: 12 }}>
    {houseWalls === 0 && <BuildHousePanel projectId={project.id} title="הבית עוד לא נבנה במודל" />}
    <PageIntro
      art="model"
      compact
      title="הבית והגינה בנפח, לפני שמזמינים חומר"
      points={[
          <>המודל נבנה מאותם אלמנטים של התוכנית: <b>גבהים, מפלסים וחומרים</b>.</>,
          <>בודקים כאן <b>פרופורציות</b>, <b>שמש וצל בחורף ובקיץ</b>, <b>רוח</b> ו<b>מקומות נוחים לישיבה</b>.</>,
          <>ב<b>גימור מפורט</b> רואים את החומרים כמו בהדמיה: אור שמש אמיתי, שמיים, דשא, טיח, רעפים וזכוכית.</>,
          <>לחיצה על אלמנט, במודל או ברשימה, בוחרת אותו ומתמקדת בו.</>,
        ]}
      legend
      insights={[
        { k: 'אלמנטים במודל', v: variant.elements.length },
        { k: 'לא אושרו', v: unapproved, tone: unapproved ? 'warn' : 'good' },
      ]}
    />
    <ClimatePanel project={project} data={climate} state={climateState} />
    <div className="editor">
      <div className="model-box" data-testid="model-canvas">
        <Canvas frameloop="demand" shadows="soft" dpr={[1, 2]} camera={{ fov: 40, near: 0.1, far: 2000 }} gl={{ preserveDrawingBuffer: true, antialias: true }} onCreated={({ gl }) => (glRef.current = gl)} onPointerMissed={() => select(null)}>
          <ModelFinishCtx.Provider value={finish}>
            <Scene project={project} elements={variant.elements} selected={selId} onSelect={select} showDims={showDims} focusKey={focusKey} climate={climate} layer={climateState.st.layer} season={climateState.st.season} view={view} />
            <AutoSnapshot projectId={project.id} version={`${variant.id}:${variant.elements.length}:${finish}:${project.updatedAt}`} enabled={climateState.st.layer === 'none' && !selId && !showDims} />
          </ModelFinishCtx.Provider>
        </Canvas>
        <div className="model-tools">
          <IconBtn icon="dims" label="הצגת מידות" pressed={showDims} onClick={() => setShowDims((v) => !v)} />
          <IconBtn icon="camera" label="שמירת תמונה" onClick={snapshot} testId="model-snapshot" />
          <span className="tool-group" role="radiogroup" aria-label="מבט">
            {VIEW_PRESETS.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={view.id === v.id} className={`btn small ${view.id === v.id ? 'active' : ''}`} onClick={() => pickView(v.id)} title={v.d}>
                {v.t}
              </button>
            ))}
          </span>
          <span className="tool-group" role="radiogroup" aria-label="רמת גימור">
            {MODEL_FINISH.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={finish === f.id} className={`btn small ${finish === f.id ? 'active' : ''}`} onClick={() => setFinish(f.id)} title={f.d}>
                {f.t}
              </button>
            ))}
          </span>
        </div>
        <div className="model-legend">
          <span className="swatch">
            <i style={{ background: '#bdbfbb', border: '1px solid #999' }} />
            קיר בית
          </span>
          {(Object.keys(MATERIAL_TEXT) as (keyof typeof MATERIAL_TEXT)[]).filter((m) => variant.elements.some((e) => e.kind === 'surface' && e.material === m)).map((m) => (
            <span key={m} className="swatch">
              <i style={{ background: MATERIAL_COLOR[m], backgroundImage: `url(${textureUrl(m, undefined, 64)})`, backgroundSize: 'cover' }} />
              {MATERIAL_TEXT[m]}
            </span>
          ))}
        </div>
      </div>
      <aside className="side">
        {unapproved > 0 && (
          <div className="notice">
            {unapproved} אלמנטים עוד לא אושרו. המידות שלהם <Tag label="estimated" /> או <Tag label="assumed" />.
          </div>
        )}
        <ClimateInsights data={climate} st={climateState.st} project={project} elements={variant.elements} />
        {selected ? (
          <>
            <Link className="btn small" to={`../plan?el=${selected.id}&focus=1`}>
              הצגה בתוכנית
            </Link>
            <ElementEditor project={project} el={selected} elements={variant.elements} name={names.get(selected.id) ?? ''} onClose={() => select(null)} />
          </>
        ) : climateState.st.layer !== 'none' ? null : (
          <div className="card flat muted" style={{ fontSize: 14 }}>
            לוחצים על אלמנט במודל כדי לערוך אותו. גוררים לסיבוב, גלגלת או צביטה לזום.
          </div>
        )}
        <div className="card flat">
          <div className="h-section" style={{ marginBottom: 6 }}>
            אלמנטים
          </div>
          <div className="el-list">
            {variant.elements.map((e) => (
              <button
                key={e.id}
                className={`el-item ${e.id === selId ? 'sel' : ''}`}
                onClick={() => {
                  select(e.id)
                  setFocusKey((k) => k + 1)
                }}
              >
                <span>{names.get(e.id)}</span>
                <Tag label={e.label} />
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
    </div>
  )
}
