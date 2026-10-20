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
import { GardenLineMesh, GardenObjectMesh, SketchMesh, useSurfaceTexture } from '../components/garden3d'
import { ElementEditor } from '../components/ElementEditor'
import { NO_BASIS, hasBasis, numberedNames, surfaceArea, fmtNum, polyLength } from '../lib/bom'
import { BuildingMass, Label3D, NorthArrow, PolySurface, Tree, unitFootprints } from '../components/model3d'
import { baseAbs } from '../lib/structureToElements'
import { LABEL_TEXT } from '../lib/types'
import { pointInPoly } from '../lib/geom'
import { Empty, Tag } from '../components/ui'
import { PageIntro } from '../components/PageIntro'

function Controls({ target, dist }: { target: [number, number, number]; dist: number }) {
  const { camera, gl } = useThree()
  const ref = useRef<OrbitImpl | null>(null)
  useEffect(() => {
    const c = new OrbitImpl(camera, gl.domElement)
    c.enableDamping = true
    c.maxPolarAngle = Math.PI / 2.05
    c.target.set(...target)
    camera.position.set(target[0] + dist * 0.7, dist * 0.75, target[2] + dist * 0.9)
    c.update()
    ref.current = c
    let raf = 0
    const loop = () => {
      c.update()
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
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
  return out
}

const pick = (id: string, onSelect: (id: string) => void) => (ev: ThreeEvent<MouseEvent>) => {
  ev.stopPropagation()
  onSelect(id)
}

function WallMesh({ w, openings, selected, onSelect }: { w: Wall; openings: Opening[]; selected: string | null; onSelect: (id: string) => void }) {
  const ang = Math.atan2(w.y2 - w.y1, w.x2 - w.x1)
  const sel = selected === w.id
  const color = w.scope === 'garden' ? '#b9a07e' : '#eceae4'
  return (
    <group position={[w.x1, 0, w.y1]} rotation={[0, -ang, 0]}>
      {wallPieces(w, openings).map((p, i) => (
        <mesh key={i} position={[(p.s + p.e) / 2, (p.y0 + p.y1) / 2, 0]} castShadow receiveShadow onClick={pick(w.id, onSelect)}>
          <boxGeometry args={[Math.max(0.001, p.e - p.s), Math.max(0.001, p.y1 - p.y0), Math.max(0.05, w.thickness)]} />
          <meshStandardMaterial color={sel ? '#7fb39b' : w.approved ? color : '#f1d9a0'} roughness={0.85} />
        </mesh>
      ))}
      {openings
        .filter((o) => o.wallId === w.id)
        .map((o) => (
          <mesh key={o.id} position={[o.offset + o.width / 2, o.sill + o.height / 2, 0]} onClick={pick(o.id, onSelect)}>
            <boxGeometry args={[o.width, o.height, o.type === 'window' ? 0.03 : 0.05]} />
            <meshStandardMaterial
              color={selected === o.id ? '#2f5d4a' : o.type === 'window' ? '#9fd0e0' : o.type === 'gate' ? '#6d5a86' : '#7a5a3a'}
              transparent={o.type === 'window'}
              opacity={o.type === 'window' ? 0.45 : 1}
              roughness={0.3}
            />
          </mesh>
        ))}
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
      {selected ? <meshStandardMaterial color="#2f5d4a" roughness={0.95} /> : <meshStandardMaterial map={tex} roughness={s.material === 'water' ? 0.15 : 0.95} />}
    </mesh>
  )
}

function FenceMesh({ f, selected, onSelect }: { f: Fence; selected: boolean; onSelect: (id: string) => void }) {
  const L = Math.hypot(f.x2 - f.x1, f.y2 - f.y1)
  const ang = Math.atan2(f.y2 - f.y1, f.x2 - f.x1)
  return (
    <group position={[f.x1, 0, f.y1]} rotation={[0, -ang, 0]}>
      <mesh position={[L / 2, f.height / 2, 0]} castShadow onClick={pick(f.id, onSelect)}>
        <boxGeometry args={[L, f.height, 0.05]} />
        <meshStandardMaterial color={selected ? '#2f5d4a' : '#6b4f36'} roughness={0.9} />
      </mesh>
    </group>
  )
}

function Scene({ project, elements, selected, onSelect, showDims }: { project: Project; elements: Element[]; selected: string | null; onSelect: (id: string | null) => void; showDims: boolean }) {
  const bounds = useMemo(() => {
    let minL = 0
    for (const e of elements) if (e.kind === 'surface' || e.kind === 'object' || e.kind === 'line') minL = Math.min(minL, e.level)
    const b = boundsOf(elements)
    if (!b) return { cx: 0, cy: 0, size: 20, minX: -10, minY: -10, minL: 0 }
    const { minX, minY, maxX, maxY } = b
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, size: Math.max(8, maxX - minX, maxY - minY), minX, minY, minL }
  }, [elements])
  const openings = elements.filter((e): e is Opening => e.kind === 'opening')
  const footprints = useMemo(() => unitFootprints(project), [project])
  const st = project.permit?.structure
  const mpp = project.permit?.scale.metersPerPt ?? 0
  const base = baseAbs(project)
  const surfaces = elements.filter((e): e is Surface => e.kind === 'surface')
  const levelAt = (x: number, y: number) => surfaces.find((sf) => sf.poly && pointInPoly({ x, y }, sf.poly))?.level ?? 0
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b8c4bb', 0.7]} />
      <directionalLight position={[bounds.cx + bounds.size, bounds.size * 1.4, bounds.cy + bounds.size * 0.6]} intensity={1.6} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-bounds.size} shadow-camera-right={bounds.size} shadow-camera-top={bounds.size} shadow-camera-bottom={-bounds.size} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.cx, bounds.minL - 0.06, bounds.cy]} receiveShadow onClick={() => onSelect(null)}>
        <planeGeometry args={[bounds.size * 4, bounds.size * 4]} />
        <meshStandardMaterial color="#dfe3dc" roughness={1} />
      </mesh>
      <gridHelper args={[bounds.size * 4, Math.round(bounds.size * 4), '#c5ccc6', '#d6dbd6']} position={[bounds.cx, bounds.minL - 0.05, bounds.cy]} />
      {elements.map((e) =>
        e.kind === 'wall' ? (
          <WallMesh key={e.id} w={e} openings={openings} selected={selected} onSelect={onSelect} />
        ) : e.kind === 'surface' ? (
          e.poly ? <PolySurface key={e.id} s={e} selected={selected === e.id} onSelect={onSelect} /> : <SurfaceMesh key={e.id} s={e} selected={selected === e.id} onSelect={onSelect} />
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
      {project.building && footprints.length > 0 && <BuildingMass footprints={footprints} b={project.building} />}
      {st && mpp > 0 && st.trees.map((t, i) => <Tree key={i} at={{ x: t.at.x * mpp, y: t.at.y * mpp }} r={t.r * mpp} kind={t.kind} level={levelAt(t.at.x * mpp, t.at.y * mpp)} />)}
      {showDims && <DimLabels elements={elements} k={Math.max(0.38, bounds.size * 0.024)} />}
      {showDims && st && mpp > 0 &&
        st.levels.slice(0, 60).map((l, i) => {
          const x = l.at.x * mpp
          const y = l.at.y * mpp
          const rel = l.rel ?? (l.abs !== null && base !== null ? l.abs - base : null)
          const txt = `${l.abs !== null ? l.abs.toFixed(2) : ''}${rel !== null ? ` (${rel >= 0 ? '+' : ''}${rel.toFixed(2)})` : ''}`
          return txt ? <Label3D key={`lv${i}`} text={txt} position={[x, levelAt(x, y) + 0.8, y]} size={Math.max(0.36, bounds.size * 0.022)} color="#48546b" /> : null
        })}
      <NorthArrow deg={project.north || 0} at={{ x: bounds.minX - 2, y: bounds.minY - 2 }} size={Math.max(1.2, bounds.size * 0.05)} />
      <Controls target={[bounds.cx, 0, bounds.cy]} dist={bounds.size * 1.1} />
    </>
  )
}

// תוויות מידה: אורך קירות וגדרות, שטח משטחים, כל אחת עם התווית שלה
function DimLabels({ elements, k }: { elements: Element[]; k: number }) {
  return (
    <>
      {elements.map((e) => {
        if (e.kind === 'wall' || e.kind === 'fence') {
          const L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1)
          if (L < 2.5 || (e.kind === 'wall' && e.scope === 'house' && !e.approved && L < 4)) return null
          return <Label3D key={e.id} text={`${fmtNum(L)} מ' · ${LABEL_TEXT[e.label]}`} position={[(e.x1 + e.x2) / 2, e.height + k, (e.y1 + e.y2) / 2]} size={k} />
        }
        if (e.kind === 'surface') {
          const c = e.poly ? centroid(e.poly) : { x: e.x + e.w / 2, y: e.y + e.d / 2 }
          return <Label3D key={e.id} text={`${fmtNum(surfaceArea(e))} מ"ר · ${fmtNum(e.w)}×${fmtNum(e.d)} מ' · ${e.level >= 0 ? '+' : ''}${e.level.toFixed(2)} · ${LABEL_TEXT[e.label]}`} position={[c.x, e.level + k * 1.5, c.y]} size={k * 1.1} color="#2f5d4a" />
        }
        if (e.kind === 'object') {
          if (Math.max(e.w, e.d) < 1.5) return null
          return <Label3D key={e.id} text={`${OBJECTS[e.type].text} ${fmtNum(e.w)}×${fmtNum(e.d)} · ${LABEL_TEXT[e.label]}`} position={[e.x, e.level + e.h + k, e.y]} size={k} color="#2f5d4a" />
        }
        if (e.kind === 'line') {
          const L = polyLength(e.pts)
          if (L < 2) return null
          const m = e.pts[Math.floor(e.pts.length / 2)]
          return <Label3D key={e.id} text={`${LINES[e.type].text} ${fmtNum(L)} מ' · ${LABEL_TEXT[e.label]}`} position={[m.x, e.level + e.height + k, m.y]} size={k} color="#2f5d4a" />
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

export default function ModelTab() {
  const { project, variant } = useProject()
  const [params, setParams] = useSearchParams()
  const selId = params.get('el')
  const names = useMemo(() => numberedNames(variant.elements), [variant.elements])
  const selected = variant.elements.find((e) => e.id === selId) ?? null
  const [showDims, setShowDims] = useState(false)
  const select = (id: string | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('el', id)
    else p.delete('el')
    setParams(p, { replace: true })
  }

  if (!hasBasis(project)) {
    return (
      <div className="card">
        <Empty title={NO_BASIS}>
          <div>המודל נבנה רק אחרי שנקבע קנה מידה מההיתר, או אחרי בחירה במידות ידניות.</div>
          <Link className="btn primary" to="../permit">
            להיתר
          </Link>
        </Empty>
      </div>
    )
  }
  if (!variant.elements.length) {
    return (
      <div className="card">
        <Empty title="אין עדיין אלמנטים למודל">
          <div>מזהים קירות מההיתר או משרטטים במסך התוכנית.</div>
          <Link className="btn primary" to="../plan">
            לתוכנית
          </Link>
        </Empty>
      </div>
    )
  }

  const unapproved = variant.elements.filter((e) => !e.approved).length

  return (
    <div className="stack" style={{ gap: 12 }}>
    <PageIntro
      art="model"
      compact
      title="הבית והגינה בנפח, לפני שמזמינים חומר"
      why={
        <>
          המודל נבנה מאותם אלמנטים של התוכנית: <b>גבהים, מפלסים, טקסטורות</b> ופריטים. כאן בודקים <b>פרופורציות וצל</b>, ולוחצים על אלמנט כדי לערוך אותו. מידות מוצגות בכפתור <b>"הצגת מידות"</b>.
        </>
      }
      insights={[
        { k: 'אלמנטים במודל', v: variant.elements.length },
        { k: 'לא אושרו', v: unapproved, tone: unapproved ? 'warn' : 'good' },
      ]}
    />
    <div className="editor">
      <div className="model-box" data-testid="model-canvas">
        <Canvas shadows dpr={[1, 2]} camera={{ fov: 40, near: 0.1, far: 2000 }} onPointerMissed={() => select(null)}>
          <Scene project={project} elements={variant.elements} selected={selId} onSelect={select} showDims={showDims} />
        </Canvas>
        <div style={{ position: 'absolute', top: 10, insetInlineStart: 10, display: 'flex', gap: 6 }}>
          <button className={`btn small ${showDims ? 'active' : ''}`} onClick={() => setShowDims((v) => !v)} aria-pressed={showDims}>
            הצגת מידות
          </button>
        </div>
        <div className="model-legend">
          <span className="swatch">
            <i style={{ background: '#eceae4', border: '1px solid #bbb' }} />
            קיר בית
          </span>
          <span className="swatch">
            <i style={{ background: '#f1d9a0' }} />
            לא אושר
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
            {unapproved} אלמנטים לא אושרו ומוצגים בצבע חול. המידות שלהם <Tag label="estimated" /> או <Tag label="assumed" />.
          </div>
        )}
        {selected ? (
          <ElementEditor project={project} el={selected} elements={variant.elements} name={names.get(selected.id) ?? ''} onClose={() => select(null)} />
        ) : (
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
              <button key={e.id} className={`el-item ${e.id === selId ? 'sel' : ''}`} onClick={() => select(e.id)}>
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
