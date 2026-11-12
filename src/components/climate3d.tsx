// שכבות אקלים במודל: מפת חום על הקרקע, מסלול השמש בחורף ובקיץ, שמש ואור לפי שעה, חלקיקי רוח ומקומות ישיבה.
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { Pt } from '../lib/types'
import { dayPath, planDir, type Season } from '../lib/sun'
import { rampColor, RAMPS, type Grid } from '../lib/climate'
import { Label3D } from './model3d'

// ---------- מפת חום ----------

export function HeatLayer({ g, values, ramp, max, opacity = 0.8 }: { g: Grid; values: Float32Array; ramp: keyof typeof RAMPS; max: number; opacity?: number }) {
  const tex = useMemo(() => {
    const data = new Uint8Array(g.nx * g.ny * 4)
    for (let i = 0; i < g.nx * g.ny; i++) {
      const v = values[i]
      if (Number.isNaN(v)) continue
      const [r, gg, b] = rampColor(ramp, v / max)
      data[i * 4] = r
      data[i * 4 + 1] = gg
      data[i * 4 + 2] = b
      data[i * 4 + 3] = 255
    }
    const t = new THREE.DataTexture(data, g.nx, g.ny, THREE.RGBAFormat)
    t.magFilter = THREE.LinearFilter
    t.minFilter = THREE.LinearFilter
    t.colorSpace = THREE.SRGBColorSpace
    t.needsUpdate = true
    return t
  }, [g, values, ramp, max])
  useEffect(() => () => tex.dispose(), [tex])

  const geom = useMemo(() => {
    const { nx, ny, cell, x0, y0 } = g
    const pos: number[] = []
    const uv: number[] = []
    const groundAt = (ix: number, iy: number) => {
      let m = -Infinity
      for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        const x = ix + dx
        const y = iy + dy
        if (x < 0 || y < 0 || x >= nx || y >= ny) continue
        m = Math.max(m, g.ground[y * nx + x])
      }
      return Number.isFinite(m) ? m : 0
    }
    for (let iy = 0; iy <= ny; iy++)
      for (let ix = 0; ix <= nx; ix++) {
        pos.push(x0 + ix * cell, groundAt(ix, iy) + 0.09, y0 + iy * cell)
        uv.push(ix / nx, iy / ny)
      }
    const idx: number[] = []
    for (let iy = 0; iy < ny; iy++)
      for (let ix = 0; ix < nx; ix++) {
        const a = iy * (nx + 1) + ix
        const b = a + 1
        const c = a + nx + 1
        const d = c + 1
        idx.push(a, c, b, b, c, d)
      }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setIndex(idx)
    return geo
  }, [g])
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <mesh geometry={geom} renderOrder={2} raycast={() => null}>
      <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  )
}

// ---------- שמש ----------

export function sunVector(az: number, el: number, north: number) {
  const d = planDir(az, north)
  const ce = Math.cos((el * Math.PI) / 180)
  return new THREE.Vector3(d.x * ce, Math.sin((el * Math.PI) / 180), d.y * ce)
}

// אור השמש: מגיע מכיוון השמש בשעה שנבחרה, עם צללים
export function SunLight({ center, size, az, el, north, intensity = 2.4 }: { center: Pt; size: number; az: number; el: number; north: number; intensity?: number }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const v = sunVector(az, Math.max(el, 2), north)
  const R = size * 1.6
  useEffect(() => {
    const l = light.current
    if (!l) return
    l.target.position.set(center.x, 0, center.y)
    l.target.updateMatrixWorld()
  }, [center.x, center.y])
  const day = el > 0
  const warm = el < 15 ? '#ffd2a1' : el < 30 ? '#fff0d8' : '#fffaf2'
  return (
    <directionalLight
      ref={light}
      position={[center.x + v.x * R, v.y * R, center.y + v.z * R]}
      intensity={day ? intensity * Math.min(1, 0.35 + Math.sin((el * Math.PI) / 180)) : 0.15}
      color={warm}
      castShadow={day}
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-left={-size}
      shadow-camera-right={size}
      shadow-camera-top={size}
      shadow-camera-bottom={-size}
      shadow-camera-near={0.5}
      shadow-camera-far={R * 3}
      shadow-bias={-0.0004}
      shadow-normalBias={0.03}
    />
  )
}

const SEASON_COLOR: Record<Season, string> = { winter: '#3f74c4', equinox: '#b49a3c', summer: '#e07b2c' }

function Arc({ pts, color, r }: { pts: THREE.Vector3[]; color: string; r: number }) {
  const geom = useMemo(() => (pts.length > 1 ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(8, pts.length * 2), r, 6, false) : null), [pts, r])
  useEffect(() => () => geom?.dispose(), [geom])
  if (!geom) return null
  return (
    <mesh geometry={geom} raycast={() => null}>
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  )
}

// מסלול השמש בחורף, באביב-סתיו ובקיץ על כיפה מעל המגרש, עם סימון שעות והשמש בשעה שנבחרה
export function SunPath({ center, size, lat, lon, north, season, az, el }: { center: Pt; size: number; lat: number; lon: number; north: number; season: Season; az: number; el: number }) {
  const R = size * 0.5
  const at = (a: number, e: number) => {
    const v = sunVector(a, e, north)
    return new THREE.Vector3(center.x + v.x * R, v.y * R, center.y + v.z * R)
  }
  const paths = useMemo(
    () =>
      (['winter', 'equinox', 'summer'] as Season[]).map((s) => {
        const p = dayPath(s, lat, lon, 0.25)
        return { s, pts: p.map((x) => at(x.az, x.el)), hours: p.filter((x) => Math.abs(x.h - Math.round(x.h)) < 0.01 && Math.round(x.h) % 3 === 0) }
      }),
    [lat, lon, north, R, center.x, center.y], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const k = Math.max(0.28, size * 0.016)
  const sunPos = at(az, Math.max(el, 0))
  const dirs: [string, number][] = [
    ['צפון', 0],
    ['מזרח', 90],
    ['דרום', 180],
    ['מערב', 270],
  ]
  return (
    <group>
      {paths.map((p) => (
        <group key={p.s}>
          <Arc pts={p.pts} color={SEASON_COLOR[p.s]} r={p.s === season ? k * 0.14 : k * 0.06} />
          {p.s !== 'equinox' &&
            p.hours.map((h) => {
              const pos = at(h.az, h.el)
              return (
                <group key={h.h}>
                  <mesh position={pos} raycast={() => null}>
                    <sphereGeometry args={[k * 0.22, 10, 8]} />
                    <meshBasicMaterial color={SEASON_COLOR[p.s]} toneMapped={false} />
                  </mesh>
                  <Label3D text={`${Math.round(h.h)}:00`} position={[pos.x, pos.y + k * 0.8, pos.z]} size={k * 0.8} color={SEASON_COLOR[p.s]} />
                </group>
              )
            })}
        </group>
      ))}
      <Label3D text="קיץ" position={[paths[2].pts[Math.floor(paths[2].pts.length / 2)]?.x ?? 0, (paths[2].pts[Math.floor(paths[2].pts.length / 2)]?.y ?? 0) + k * 1.6, paths[2].pts[Math.floor(paths[2].pts.length / 2)]?.z ?? 0]} size={k} color={SEASON_COLOR.summer} />
      <Label3D text="חורף" position={[paths[0].pts[Math.floor(paths[0].pts.length / 2)]?.x ?? 0, (paths[0].pts[Math.floor(paths[0].pts.length / 2)]?.y ?? 0) + k * 1.6, paths[0].pts[Math.floor(paths[0].pts.length / 2)]?.z ?? 0]} size={k} color={SEASON_COLOR.winter} />
      {el > 0 && (
        <group position={sunPos}>
          <mesh raycast={() => null}>
            <sphereGeometry args={[k * 0.9, 20, 14]} />
            <meshBasicMaterial color="#ffcf3f" toneMapped={false} />
          </mesh>
          <mesh raycast={() => null}>
            <sphereGeometry args={[k * 1.6, 20, 14]} />
            <meshBasicMaterial color="#ffd866" transparent opacity={0.25} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      )}
      {/* טבעת כיוונים על הקרקע */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, 0.03, center.y]} raycast={() => null}>
        <ringGeometry args={[R * 0.995, R, 96]} />
        <meshBasicMaterial color="#6b746e" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      {dirs.map(([t, a]) => {
        const d = planDir(a, north)
        return <Label3D key={t} text={t} position={[center.x + d.x * R * 1.06, 0.4, center.y + d.y * R * 1.06]} size={k * 1.1} color="#1d2120" />
      })}
    </group>
  )
}

// ---------- רוח ----------

// חלקיקים שנעים עם הרוח: מהירים בשטח פתוח, איטיים בצל הרוח, נעצרים במכשולים
export function WindParticles({ g, speed, dir, north, count = 520 }: { g: Grid; speed: Float32Array; dir: number; north: number; count?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const flow = useMemo(() => {
    const u = planDir(dir, north)
    return { x: -u.x, y: -u.y }
  }, [dir, north])
  const state = useMemo(() => {
    const W = g.nx * g.cell
    const H = g.ny * g.cell
    const rnd = () => ({ x: g.x0 + Math.random() * W, y: g.y0 + Math.random() * H, age: Math.random() * 6 })
    return { W, H, rnd, p: Array.from({ length: count }, rnd) }
  }, [g, count])
  const tmp = useMemo(() => new THREE.Object3D(), [])
  const col = useMemo(() => new THREE.Color(), [])
  const ang = Math.atan2(flow.y, flow.x)
  useFrame((stt, dtRaw) => {
    stt.invalidate() // החלקיקים זזים כל הזמן
    const m = mesh.current
    if (!m) return
    const dt = Math.min(0.05, dtRaw)
    state.p.forEach((q, k) => {
      const ix = Math.floor((q.x - g.x0) / g.cell)
      const iy = Math.floor((q.y - g.y0) / g.cell)
      const i = ix >= 0 && iy >= 0 && ix < g.nx && iy < g.ny ? iy * g.nx + ix : -1
      const v = i >= 0 ? speed[i] : NaN
      q.age += dt
      if (i < 0 || Number.isNaN(v) || g.solid[i] > g.ground[i] + 1 || q.age > 7) {
        Object.assign(q, state.rnd(), { age: 0 })
        return
      }
      q.x += flow.x * v * dt * 1.4
      q.y += flow.y * v * dt * 1.4
      const len = 0.25 + v * 0.18
      tmp.position.set(q.x, g.ground[i] + 1.1, q.y)
      tmp.rotation.set(0, -ang, 0)
      const fade = Math.min(1, q.age * 2, (7 - q.age) * 2)
      tmp.scale.set(len * fade + 0.001, 1, 1)
      tmp.updateMatrix()
      m.setMatrixAt(k, tmp.matrix)
      const [r, gg, b] = rampColor('wind', v / 5)
      m.setColorAt(k, col.setRGB(r / 255, gg / 255, b / 255, THREE.SRGBColorSpace))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} raycast={() => null} frustumCulled={false}>
      <boxGeometry args={[1, 0.05, 0.07]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}

// חץ גדול בצד הרוח: מאיפה היא נושבת
export function WindArrow({ center, size, dir, north, text }: { center: Pt; size: number; dir: number; north: number; text: string }) {
  const u = planDir(dir, north)
  const R = size * 0.62
  const L = Math.max(2, size * 0.18)
  const geom = useMemo(() => {
    const s = new THREE.Shape()
    const w = L * 0.12
    s.moveTo(-L / 2, -w)
    s.lineTo(L / 2 - L * 0.3, -w)
    s.lineTo(L / 2 - L * 0.3, -w * 2.6)
    s.lineTo(L / 2, 0)
    s.lineTo(L / 2 - L * 0.3, w * 2.6)
    s.lineTo(L / 2 - L * 0.3, w)
    s.lineTo(-L / 2, w)
    s.closePath()
    const g = new THREE.ShapeGeometry(s)
    g.rotateX(-Math.PI / 2)
    return g
  }, [L])
  const pos: [number, number, number] = [center.x + u.x * R, 0.6, center.y + u.y * R]
  return (
    <group>
      <mesh geometry={geom} position={pos} rotation={[0, -Math.atan2(-u.y, -u.x), 0]} raycast={() => null}>
        <meshBasicMaterial color="#2f6bb3" side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <Label3D text={text} position={[pos[0], 1.6, pos[2]]} size={Math.max(0.45, size * 0.03)} color="#2f6bb3" />
    </group>
  )
}

// ---------- מקומות ישיבה ----------

export function SeatSpots({ spots, label, size }: { spots: { at: Pt; score: number }[]; label: string; size: number }) {
  const k = Math.max(0.4, size * 0.026)
  return (
    <>
      {spots.map((s, i) => (
        <group key={i} position={[s.at.x, 0.12, s.at.y]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[0.7, 1, 40]} />
            <meshBasicMaterial color="#1f6b45" side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
          <Label3D text={`${label} ${i + 1}`} position={[0, 1.4, 0]} size={k} color="#1f6b45" />
        </group>
      ))}
    </>
  )
}
