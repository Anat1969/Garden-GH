import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls as OrbitImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import { Link, useSearchParams } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import type { Element, Fence, Opening, Surface, Wall } from '../lib/types'
import { MATERIAL_COLOR, MATERIAL_TEXT } from '../lib/types'
import { ElementEditor } from '../components/ElementEditor'
import { NO_BASIS, hasBasis, numberedNames } from '../lib/bom'
import { Empty, Tag } from '../components/ui'

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

const SURFACE_H: Record<Surface['material'], number> = { paving: 0.06, lawn: 0.04, bed: 0.2, deck: 0.15, gravel: 0.05 }

function SurfaceMesh({ s, selected, onSelect }: { s: Surface; selected: boolean; onSelect: (id: string) => void }) {
  const h = SURFACE_H[s.material]
  return (
    <mesh position={[s.x + s.w / 2, s.level + h / 2, s.y + s.d / 2]} receiveShadow castShadow onClick={pick(s.id, onSelect)}>
      <boxGeometry args={[s.w, h, s.d]} />
      <meshStandardMaterial color={selected ? '#2f5d4a' : MATERIAL_COLOR[s.material]} roughness={0.95} />
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

function Scene({ elements, selected, onSelect }: { elements: Element[]; selected: string | null; onSelect: (id: string | null) => void }) {
  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const e of elements) {
      const pts = e.kind === 'surface' ? [[e.x, e.y], [e.x + e.w, e.y + e.d]] : e.kind === 'opening' ? [] : [[e.x1, e.y1], [e.x2, e.y2]]
      for (const [x, y] of pts) {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
      }
    }
    if (!Number.isFinite(minX)) return { cx: 0, cy: 0, size: 20 }
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, size: Math.max(8, maxX - minX, maxY - minY) }
  }, [elements])
  const openings = elements.filter((e): e is Opening => e.kind === 'opening')
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b8c4bb', 0.7]} />
      <directionalLight position={[bounds.cx + bounds.size, bounds.size * 1.4, bounds.cy + bounds.size * 0.6]} intensity={1.6} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-bounds.size} shadow-camera-right={bounds.size} shadow-camera-top={bounds.size} shadow-camera-bottom={-bounds.size} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.cx, -0.01, bounds.cy]} receiveShadow onClick={() => onSelect(null)}>
        <planeGeometry args={[bounds.size * 4, bounds.size * 4]} />
        <meshStandardMaterial color="#dfe3dc" roughness={1} />
      </mesh>
      <gridHelper args={[bounds.size * 4, Math.round(bounds.size * 4), '#c5ccc6', '#d6dbd6']} position={[bounds.cx, 0, bounds.cy]} />
      {elements.map((e) =>
        e.kind === 'wall' ? (
          <WallMesh key={e.id} w={e} openings={openings} selected={selected} onSelect={onSelect} />
        ) : e.kind === 'surface' ? (
          <SurfaceMesh key={e.id} s={e} selected={selected === e.id} onSelect={onSelect} />
        ) : e.kind === 'fence' ? (
          <FenceMesh key={e.id} f={e} selected={selected === e.id} onSelect={onSelect} />
        ) : null,
      )}
      <Controls target={[bounds.cx, 0, bounds.cy]} dist={bounds.size * 1.1} />
    </>
  )
}

export default function ModelTab() {
  const { project, variant } = useProject()
  const [params, setParams] = useSearchParams()
  const selId = params.get('el')
  const names = useMemo(() => numberedNames(variant.elements), [variant.elements])
  const selected = variant.elements.find((e) => e.id === selId) ?? null
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
    <div className="editor">
      <div className="model-box" data-testid="model-canvas">
        <Canvas shadows dpr={[1, 2]} camera={{ fov: 40, near: 0.1, far: 2000 }} onPointerMissed={() => select(null)}>
          <Scene elements={variant.elements} selected={selId} onSelect={select} />
        </Canvas>
        <div className="model-legend">
          <span className="swatch">
            <i style={{ background: '#eceae4', border: '1px solid #bbb' }} />
            קיר בית
          </span>
          <span className="swatch">
            <i style={{ background: '#f1d9a0' }} />
            לא אושר
          </span>
          {(Object.keys(MATERIAL_TEXT) as (keyof typeof MATERIAL_TEXT)[]).map((m) => (
            <span key={m} className="swatch">
              <i style={{ background: MATERIAL_COLOR[m] }} />
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
  )
}
