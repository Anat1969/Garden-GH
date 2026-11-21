import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import type { Building, Facade, FacadeSide, Pt, Surface } from '../lib/types'
import { facadeQuads } from '../lib/facades'
import type { HouseLayer } from '../lib/floors'
import { loadDocBlob } from '../lib/idb'
import { MATERIALS } from '../lib/garden'
import { bbox } from '../lib/geom'
import { SurfMat, useSurfaceTexture } from './garden3d'
import { useModelFinish } from '../lib/finish'
import { RealCrown, RealPalm, RealTrunk } from './realism3d'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { stairPlan } from '../lib/stairs'
import polygonClipping from 'polygon-clipping'

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

// ---------- טקסט שוכב על הקרקע: מידה שמחוברת למה שהיא מודדת, בקנה המידה של המודל ----------
// angle: זווית הקו בתוכנית (רדיאנים, x מזרחה, y דרומה). size: גובה השורה הראשונה במטרים.

export function FlatText({ lines, at, angle = 0, size, color = '#1d2120', bg = 'rgba(255,255,255,0.9)', border, onClick }: { lines: string[]; at: [number, number, number]; angle?: number; size: number; color?: string; bg?: string; border?: string; onClick?: () => void }) {
  const { tex, aspect, h } = useMemo(() => {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')!
    const fs = 48
    const fs2 = 34
    const font1 = `600 ${fs}px "IBM Plex Sans Hebrew", sans-serif`
    const font2 = `400 ${fs2}px "IBM Plex Sans Hebrew", sans-serif`
    ctx.font = font1
    let w = ctx.measureText(lines[0]).width
    ctx.font = font2
    for (const l of lines.slice(1)) w = Math.max(w, ctx.measureText(l).width)
    c.width = Math.ceil(w) + 32
    c.height = fs + 20 + (lines.length - 1) * (fs2 + 8)
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.roundRect(0, 0, c.width, c.height, 12)
    ctx.fill()
    if (border) {
      ctx.strokeStyle = border
      ctx.lineWidth = 5
      ctx.stroke()
    }
    ctx.direction = 'rtl'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    ctx.font = font1
    ctx.fillText(lines[0], c.width / 2, fs / 2 + 11)
    ctx.font = font2
    ctx.globalAlpha = 0.8
    lines.slice(1).forEach((l, i) => ctx.fillText(l, c.width / 2, fs + 14 + i * (fs2 + 8) + fs2 / 2))
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return { tex: t, aspect: c.width / c.height, h: c.height / (fs + 20) }
  }, [lines.join('|'), color, bg, border]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex.dispose(), [tex])
  // קריאות: הטקסט לא הפוך. זווית בין -90 ל-90 מעלות
  let a = angle
  if (a > Math.PI / 2) a -= Math.PI
  if (a < -Math.PI / 2) a += Math.PI
  const H = size * h
  return (
    <mesh
      position={at}
      rotation={[-Math.PI / 2, 0, -a]}
      renderOrder={8}
      onClick={
        onClick
          ? (ev: ThreeEvent<MouseEvent>) => {
              ev.stopPropagation()
              onClick()
            }
          : undefined
      }
      onPointerOver={onClick ? () => (document.body.style.cursor = 'pointer') : undefined}
      onPointerOut={onClick ? () => (document.body.style.cursor = '') : undefined}
    >
      <planeGeometry args={[H * aspect, H]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-4} />
    </mesh>
  )
}

// קו מידה על הקרקע: קו, שנתות בקצוות וקווי עזר אל הנקודות שנמדדו
export function GroundDim({ a, b, y, off, color = '#3b5d7a', width = 1 }: { a: { x: number; y: number }; b: { x: number; y: number }; y: number; off: number; color?: string; width?: number }) {
  const geom = useMemo(() => {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const ux = (b.x - a.x) / L
    const uy = (b.y - a.y) / L
    const nx = -uy * off
    const ny = ux * off
    const t = Math.min(0.18, L * 0.05)
    const A = { x: a.x + nx, y: a.y + ny }
    const B = { x: b.x + nx, y: b.y + ny }
    const seg = [
      A.x, y, A.y, B.x, y, B.y,
      a.x + nx * 0.15, y, a.y + ny * 0.15, A.x + nx * 0.25, y, A.y + ny * 0.25,
      b.x + nx * 0.15, y, b.y + ny * 0.15, B.x + nx * 0.25, y, B.y + ny * 0.25,
      A.x - (ux - uy) * t, y, A.y - (uy + ux) * t, A.x + (ux - uy) * t, y, A.y + (uy + ux) * t,
      B.x - (ux - uy) * t, y, B.y - (uy + ux) * t, B.x + (ux - uy) * t, y, B.y + (uy + ux) * t,
    ]
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
    return g
  }, [a.x, a.y, b.x, b.y, y, off])
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <lineSegments geometry={geom} renderOrder={7}>
      <lineBasicMaterial color={color} linewidth={width} transparent opacity={0.95} />
    </lineSegments>
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

// ---------- מדרגות: כל שלח מוצק מהמפלס התחתון עד גובהו, וקו דק בשפת כל מדרגה ----------

export function StairSurface({ s, selected, onSelect }: { s: Surface; selected: boolean; onSelect: (id: string) => void }) {
  const tex = useSurfaceTexture(s.material, s.color, null)
  const { geom, edges } = useMemo(() => {
    const plan = stairPlan(s)
    if (!plan) return { geom: null, edges: null }
    const parts = plan.steps.map((st) => {
      const shape = new THREE.Shape(st.poly.map((v) => new THREE.Vector2(v.x, -v.y)))
      const depth = Math.max(0.05, st.top - plan.bottom + 0.05)
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
      g.rotateX(-Math.PI / 2)
      g.translate(0, plan.bottom - 0.05, 0)
      return g
    })
    const merged = mergeGeometries(parts, false)
    parts.forEach((g) => g.dispose())
    return { geom: merged, edges: merged ? new THREE.EdgesGeometry(merged, 30) : null }
  }, [s])
  useEffect(
    () => () => {
      geom?.dispose()
      edges?.dispose()
    },
    [geom, edges],
  )
  if (!geom) return <PolySurface s={s} selected={selected} onSelect={onSelect} />
  return (
    <group>
      <mesh
        geometry={geom}
        receiveShadow
        castShadow
        onClick={(ev: ThreeEvent<MouseEvent>) => {
          ev.stopPropagation()
          onSelect(s.id)
        }}
      >
        <SurfMat material={s.material} color={s.color} selected={selected} tex={tex} />
      </mesh>
      {edges && (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color={selected ? '#2f5d4a' : '#6d6a60'} transparent opacity={0.55} />
        </lineSegments>
      )}
    </group>
  )
}

// ---------- גוש המגרש: כשמדרגות יורדות אל הרחוב, המגרש מוצג כגוש אדמה עם חתך המדרגות ----------

export function SitePlinth({ plot, cuts, top, bottom, onClick }: { plot: Pt[]; cuts: Pt[][]; top: number; bottom: number; onClick: () => void }) {
  const { geom, edges } = useMemo(() => {
    const ring = (ps: Pt[]): [number, number][] => [...ps.map((p) => [p.x, p.y] as [number, number]), [ps[0].x, ps[0].y]]
    let mp: polygonClipping.MultiPolygon = [[ring(plot)]]
    try {
      if (cuts.length) mp = polygonClipping.difference(mp, ...cuts.map((c) => [ring(c)] as polygonClipping.Polygon))
    } catch {
      /* חיתוך שנכשל: הגוש בלי חתך */
    }
    const shapes = mp.map((poly) => {
      const sh = new THREE.Shape(poly[0].map(([x, y]) => new THREE.Vector2(x, -y)))
      for (const h of poly.slice(1)) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, -y))))
      return sh
    })
    const g = new THREE.ExtrudeGeometry(shapes, { depth: Math.max(0.05, top - bottom), bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    g.translate(0, bottom, 0)
    return { geom: g, edges: new THREE.EdgesGeometry(g, 30) }
  }, [plot, cuts, top, bottom])
  useEffect(
    () => () => {
      geom.dispose()
      edges.dispose()
    },
    [geom, edges],
  )
  return (
    <group>
      <mesh
        geometry={geom}
        receiveShadow
        onClick={(ev: ThreeEvent<MouseEvent>) => {
          ev.stopPropagation()
          onClick()
        }}
      >
        <meshStandardMaterial color="#d8d0bf" roughness={1} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#8f8676" transparent opacity={0.6} />
      </lineSegments>
    </group>
  )
}

// ---------- הבית: מסה אחידה ושקופה למחצה ----------

export const HOUSE_COLOR = '#e6e3dc'
export const HOUSE_OPACITY = 0.72
export function HouseMat({ sel = false }: { sel?: boolean }) {
  return <meshStandardMaterial color={sel ? '#2f5d4a' : HOUSE_COLOR} emissive={sel ? '#2f5d4a' : '#000000'} emissiveIntensity={sel ? 0.3 : 0} roughness={0.85} transparent opacity={sel ? 0.95 : HOUSE_OPACITY} side={THREE.DoubleSide} depthWrite />
}

// ---------- מסת הקומות העליונות והגג ----------

export function BuildingMass({ footprints, b, layers }: { footprints: Pt[][]; b?: Building; layers: HouseLayer[] }) {
  const top = layers.length ? layers[layers.length - 1].z1 : null
  const topFps = layers.length ? layers[layers.length - 1].fps : footprints
  const ridge = b?.ridgeRel && top && b.ridgeRel > top + 0.2 ? b.ridgeRel : null
  const pitched = b && (b.roofType === 'gable' || b.roofType === 'mixed' || b.roofType === 'hip')
  return (
    <>
      {/* תקרת קומת הקרקע: כשהקומה שמעל קטנה ממנה, החלק הגלוי הוא גג או מרפסת */}
      {layers[0]?.fromPlan && footprints.map((fp, i) => <UpperBlock key={`s${i}`} fp={fp} z0={layers[0].z0 - 0.02} z1={layers[0].z0 + 0.12} />)}
      {layers.map((l, i) => (
        <group key={i}>
          {l.fps.map((fp, j) => (
            <UpperBlock key={j} fp={fp} z0={l.z0} z1={l.z1} />
          ))}
          {l.openings.map((o, j) => (
            <FloorOpening key={j} o={o} z0={l.z0} h={l.z1 - l.z0} />
          ))}
        </group>
      ))}
      {top !== null &&
        topFps.map((fp, i) => (
          <group key={`r${i}`}>
            {ridge && pitched && <Gable fp={fp} eave={top} ridge={ridge} />}
            {(!ridge || !pitched) && <UpperBlock fp={fp} z0={top} z1={top + 0.25} color="#a9aca8" roof />}
          </group>
        ))}
    </>
  )
}

// פתח בקומה עליונה, מתוכנית הקומה: חלון בכחול בהיר, דלת בכתום, כמו בקומת הקרקע
function FloorOpening({ o, z0, h }: { o: HouseLayer['openings'][number]; z0: number; h: number }) {
  const len = Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y)
  if (len < 0.3) return null
  const door = o.type !== 'window'
  const sill = door ? 0.02 : 0.9
  const oh = Math.min(h - sill - 0.25, door ? 2.1 : 1.2)
  if (oh < 0.4) return null
  return (
    <mesh position={[(o.a.x + o.b.x) / 2, z0 + sill + oh / 2, (o.a.y + o.b.y) / 2]} rotation={[0, -Math.atan2(o.b.y - o.a.y, o.b.x - o.a.x), 0]}>
      <boxGeometry args={[len, oh, 0.36]} />
      <meshStandardMaterial color={door ? '#e0763a' : '#a9c6d3'} transparent opacity={door ? 0.85 : 0.6} roughness={0.3} />
    </mesh>
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

// ---------- חזיתות ההיתר על הבית ----------
// שכבה דקה מחוץ לקירות, עם שרטוט החזית בהיטל ישר. התמונה נטענת מהמכשיר. חזית בלי תמונה לא מוצגת.

export function FacadeSkins({ facades, layers, north }: { facades: Facade[]; layers: { fps: Pt[][]; z0: number; z1: number }[]; north: number }) {
  const sides = useMemo(() => facades.map((f) => f.side).filter((s): s is FacadeSide => Boolean(s)), [facades])
  return (
    <>
      {facades.map((f) => (
        <FacadeSkin key={f.id} f={f} layers={layers} north={north} sides={sides} />
      ))}
    </>
  )
}

function FacadeSkin({ f, layers, north, sides }: { f: Facade; layers: { fps: Pt[][]; z0: number; z1: number }[]; north: number; sides: FacadeSide[] }) {
  const invalidate = useThree((s) => s.invalidate)
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    let dead = false
    let url = ''
    let t: THREE.Texture | null = null
    void loadDocBlob(f.id).then((blob) => {
      if (dead || !blob) return
      url = URL.createObjectURL(blob)
      t = new THREE.TextureLoader().load(url, () => {
        if (dead) return
        setTex(t)
        invalidate()
      })
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
    })
    return () => {
      dead = true
      t?.dispose()
      if (url) URL.revokeObjectURL(url)
      setTex(null)
    }
  }, [f.id, invalidate])
  const geom = useMemo(() => {
    const quads = facadeQuads(f, layers, north, sides)
    if (!quads.length) return null
    const pos: number[] = []
    const uv: number[] = []
    for (const q of quads) for (const i of [0, 1, 2, 0, 2, 3]) (pos.push(...q.pos[i]), uv.push(...q.uv[i]))
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.computeVertexNormals()
    return g
  }, [f, layers, north, sides])
  useEffect(() => () => geom?.dispose(), [geom])
  if (!geom || !tex) return null
  return (
    <mesh geometry={geom} receiveShadow>
      <meshStandardMaterial map={tex} roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  )
}
