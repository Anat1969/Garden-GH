import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { Building, Pt, Surface } from '../lib/types'
import { MATERIALS } from '../lib/garden'
import { bbox } from '../lib/geom'
import { SurfMat, useSurfaceTexture } from './garden3d'
import { useModelFinish } from '../lib/finish'
import { RealCrown, RealPalm, RealTrunk } from './realism3d'

// ---------- תווית טקסט במרחב ----------

export function Label3D({ text, position, size = 0.32, color = '#1d2120', bg = 'rgba(255,255,255,0.88)' }: { text: string; position: [number, number, number]; size?: number; color?: string; bg?: string }) {
  const { tex, aspect } = useMemo(() => {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')!
    const fs = 44
    ctx.font = `500 ${fs}px "IBM Plex Sans Hebrew", sans-serif`
    const w = Math.ceil(ctx.measureText(text).width) + 28
    c.width = w
    c.height = fs + 22
    ctx.font = `500 ${fs}px "IBM Plex Sans Hebrew", sans-serif`
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.roundRect(0, 0, c.width, c.height, 14)
    ctx.fill()
    ctx.fillStyle = color
    ctx.textBaseline = 'middle'
    ctx.direction = 'rtl'
    ctx.textAlign = 'center'
    ctx.fillText(text, c.width / 2, c.height / 2 + 2)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return { tex: t, aspect: c.width / c.height }
  }, [text, color, bg])
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <sprite position={position} scale={[size * aspect, size, 1]} renderOrder={10}>
      <spriteMaterial map={tex} depthTest={false} transparent />
    </sprite>
  )
}

// ---------- משטח מצולע ----------

export function PolySurface({ s, selected, onSelect }: { s: Surface; selected: boolean; onSelect: (id: string) => void }) {
  const h = MATERIALS[s.material].height
  const tex = useSurfaceTexture(s.material, s.color, null)
  const geom = useMemo(() => {
    const shape = new THREE.Shape(s.poly!.map((v) => new THREE.Vector2(v.x, -v.y)))
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    return g
  }, [s.poly, h])
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <mesh
      geometry={geom}
      position={[0, s.level, 0]}
      receiveShadow
      castShadow
      onClick={(ev: ThreeEvent<MouseEvent>) => {
        ev.stopPropagation()
        onSelect(s.id)
      }}
    >
      <SurfMat material={s.material} color={s.color} selected={selected} tex={tex} />
    </mesh>
  )
}

// ---------- הבית: מסה אחידה ושקופה למחצה ----------

export const HOUSE_COLOR = '#e6e3dc'
export const HOUSE_OPACITY = 0.72
export function HouseMat({ sel = false }: { sel?: boolean }) {
  return <meshStandardMaterial color={sel ? '#2f5d4a' : HOUSE_COLOR} emissive={sel ? '#2f5d4a' : '#000000'} emissiveIntensity={sel ? 0.3 : 0} roughness={0.85} transparent opacity={sel ? 0.95 : HOUSE_OPACITY} side={THREE.DoubleSide} depthWrite />
}

// ---------- מסת הקומות העליונות והגג ----------

export function BuildingMass({ footprints, b }: { footprints: Pt[][]; b: Building }) {
  const eave = b.eaveRel && b.eaveRel > b.groundHeight + 0.3 ? b.eaveRel : b.storeys > 1 ? b.groundHeight * b.storeys : null
  const ridge = b.ridgeRel && eave && b.ridgeRel > eave + 0.2 ? b.ridgeRel : null
  return (
    <>
      {footprints.map((fp, i) => (
        <group key={i}>
          {eave && <UpperBlock fp={fp} z0={b.groundHeight} z1={eave} />}
          {eave && ridge && (b.roofType === 'gable' || b.roofType === 'mixed' || b.roofType === 'hip') && <Gable fp={fp} eave={eave} ridge={ridge} />}
          {eave && (!ridge || b.roofType === 'flat') && <UpperBlock fp={fp} z0={eave} z1={eave + 0.25} color="#a9aca8" roof />}
        </group>
      ))}
    </>
  )
}

function UpperBlock({ fp, z0, z1 }: { fp: Pt[]; z0: number; z1: number; color?: string; roof?: boolean }) {
  const geom = useMemo(() => {
    const shape = new THREE.Shape(fp.map((v) => new THREE.Vector2(v.x, -v.y)))
    const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    return g
  }, [fp, z0, z1])
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <mesh geometry={geom} position={[0, z0, 0]} castShadow receiveShadow>
      <HouseMat />
    </mesh>
  )
}

// גג גמלון מעל המלבן החוסם, הרכס לאורך הצלע הארוכה
function Gable({ fp, eave, ridge }: { fp: Pt[]; eave: number; ridge: number }) {
  const geom = useMemo(() => {
    const bb = bbox(fp)
    const o = 0 // בלי בליטות: מסה נקייה
    const x0 = bb.x - o
    const x1 = bb.x + bb.w + o
    const z0 = bb.y - o
    const z1 = bb.y + bb.h + o
    const alongX = bb.w >= bb.h
    const v: number[] = []
    const push = (...p: number[][]) => p.forEach((q) => v.push(...q))
    if (alongX) {
      const zm = (z0 + z1) / 2
      push([x0, eave, z0], [x1, eave, z0], [x1, ridge, zm], [x0, eave, z0], [x1, ridge, zm], [x0, ridge, zm])
      push([x0, eave, z1], [x0, ridge, zm], [x1, ridge, zm], [x0, eave, z1], [x1, ridge, zm], [x1, eave, z1])
      push([x0, eave, z0], [x0, ridge, zm], [x0, eave, z1], [x1, eave, z0], [x1, eave, z1], [x1, ridge, zm])
    } else {
      const xm = (x0 + x1) / 2
      push([x0, eave, z0], [xm, ridge, z0], [xm, ridge, z1], [x0, eave, z0], [xm, ridge, z1], [x0, eave, z1])
      push([x1, eave, z0], [x1, eave, z1], [xm, ridge, z1], [x1, eave, z0], [xm, ridge, z1], [xm, ridge, z0])
      push([x0, eave, z0], [x1, eave, z0], [xm, ridge, z0], [x0, eave, z1], [xm, ridge, z1], [x1, eave, z1])
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    // UV לרעפים: לאורך הרכס ובמורד השיפוע, במטרים
    const uv: number[] = []
    const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2
    for (let i = 0; i < v.length; i += 3) {
      const [x, y, z] = [v[i], v[i + 1], v[i + 2]]
      const across = alongX ? z - mid : x - mid
      uv.push((alongX ? x : z) / 1.6, Math.hypot(across, y - ridge) / 1.6)
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.computeVertexNormals()
    return g
  }, [fp, eave, ridge])
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <mesh geometry={geom} castShadow>
      <HouseMat />
    </mesh>
  )
}

// ---------- עצים ----------

export function Tree({ at, r, kind, level }: { at: Pt; r: number; kind: 'tree' | 'palm' | 'shrub'; level: number }) {
  const finish = useModelFinish()
  const massing = finish === 'massing'
  const rr = Math.min(Math.max(r, 0.4), 5)
  if (finish === 'detailed') {
    const seed = Math.round(at.x * 7 + at.y * 13)
    if (kind === 'shrub')
      return (
        <group position={[at.x, level + rr * 0.45, at.y]}>
          <RealCrown r={rr * 0.6} color="#6f9a5f" seed={seed} flat={0.8} />
        </group>
      )
    if (kind === 'palm')
      return (
        <group position={[at.x, level, at.y]}>
          <RealPalm h={4.8} r={rr * 0.9} color="#5e8a4e" />
        </group>
      )
    return (
      <group position={[at.x, level, at.y]}>
        <RealTrunk h={2.2 + rr * 0.4} />
        <group position={[0, 2.2 + rr * 0.7, 0]}>
          <RealCrown r={rr * 0.85} color="#4f7d47" seed={seed} flat={0.85} />
        </group>
      </group>
    )
  }
  if (kind === 'shrub')
    return (
      <mesh position={[at.x, level + rr * 0.45, at.y]} castShadow>
        <sphereGeometry args={[rr * 0.6, 14, 10]} />
        <meshStandardMaterial color={massing ? '#d6d7d3' : '#6f9a5f'} roughness={1} />
      </mesh>
    )
  const trunkH = kind === 'palm' ? 4.5 : 2.2
  return (
    <group position={[at.x, level, at.y]}>
      <mesh position={[0, trunkH / 2, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.16, trunkH, 8]} />
        <meshStandardMaterial color={massing ? '#c4c5c1' : '#7a5a3a'} />
      </mesh>
      <mesh position={[0, trunkH + (kind === 'palm' ? 0.3 : rr * 0.7), 0]} castShadow>
        {kind === 'palm' ? <coneGeometry args={[rr * 0.9, 0.8, 9]} /> : <sphereGeometry args={[rr * 0.85, 16, 12]} />}
        <meshStandardMaterial color={massing ? '#d6d7d3' : kind === 'palm' ? '#5e8a4e' : '#4f7d47'} roughness={1} />
      </mesh>
    </group>
  )
}

// ---------- חץ צפון ----------

export function NorthArrow({ deg, at, size }: { deg: number; at: Pt; size: number }) {
  const r = (deg * Math.PI) / 180
  // כיוון הצפון בתוכנית: 0 = למעלה בגיליון (z שלילי)
  const dx = Math.sin(r)
  const dz = -Math.cos(r)
  const L = size
  const geom = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0, L)
    s.lineTo(L * 0.28, -L * 0.2)
    s.lineTo(0, 0)
    s.lineTo(-L * 0.28, -L * 0.2)
    s.closePath()
    const g = new THREE.ShapeGeometry(s)
    g.rotateX(-Math.PI / 2)
    return g
  }, [L])
  return (
    <group position={[at.x, 0.03, at.y]}>
      <mesh geometry={geom} rotation={[0, -Math.atan2(dx, -dz), 0]}>
        <meshBasicMaterial color="#1d2120" side={THREE.DoubleSide} />
      </mesh>
      <Label3D text="צפון" position={[dx * L * 1.35, 0.4, dz * L * 1.35]} size={L * 0.32} />
    </group>
  )
}

export { unitFootprints } from '../lib/structureToElements'
