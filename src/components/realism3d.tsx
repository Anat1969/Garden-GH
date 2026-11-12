// רכיבי המחשה ריאליסטית לרמת הגימור "מפורט": שמיים ואור סביבה, קרקע טבעית, חומרים עם בליטה וחספוס,
// מים, דשא בגבעולים, עצים מלאים, זכוכית ומסגרות, והצללה סביבתית (AO) כשהמכשיר עומד בזה.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { Pt, Surface } from '../lib/types'
import type { SurfaceMaterial } from '../lib/garden'
import { MATERIALS } from '../lib/garden'
import { barkPBR, leafPBR, plasterPBR, soilPBR, surfacePBR, withRepeat, type PBRSet } from '../lib/realism'
import { pointInPoly } from '../lib/geom'

// ---------- סביבה ----------

export function Atmosphere({ center, size, sunDir }: { center: Pt; size: number; sunDir: THREE.Vector3 }) {
  const { gl, scene } = useThree()
  const sky = useMemo(() => {
    const s = new Sky()
    s.scale.setScalar(1500)
    const u = s.material.uniforms
    u.turbidity.value = 5
    u.rayleigh.value = 1.2
    u.mieCoefficient.value = 0.004
    u.mieDirectionalG.value = 0.82
    return s
  }, [])
  useEffect(() => {
    sky.material.uniforms.sunPosition.value.copy(sunDir)
  }, [sky, sunDir.x, sunDir.y, sunDir.z]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl)
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.45
    const prevExp = gl.toneMappingExposure
    gl.toneMappingExposure = 0.92
    return () => {
      scene.environment = null
      gl.toneMappingExposure = prevExp
      env.dispose()
      pm.dispose()
    }
  }, [gl, scene])
  useEffect(() => {
    scene.fog = new THREE.Fog('#dfe7ec', size * 3, size * 12)
    return () => {
      scene.fog = null
    }
  }, [scene, size])
  return <primitive object={sky} position={[center.x, 0, center.y]} />
}

export function NatureGround({ center, size, y, onClick }: { center: Pt; size: number; y: number; onClick: () => void }) {
  const S = size * 10
  const set = useMemo(() => withRepeat(soilPBR(), S / 6, S / 6), [S])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, y, center.y]} receiveShadow onClick={onClick}>
      <planeGeometry args={[S, S]} />
      <meshStandardMaterial map={set.map} normalMap={set.normalMap} roughnessMap={set.roughnessMap} normalScale={new THREE.Vector2(0.8, 0.8)} />
    </mesh>
  )
}

// ---------- חומרים ----------

const pbrCache = new Map<string, PBRSet>()
function repeated(material: SurfaceMaterial, color: string | undefined, rx: number, ry: number) {
  const key = `${material}:${color ?? ''}:${rx.toFixed(3)}:${ry.toFixed(3)}`
  let s = pbrCache.get(key)
  if (!s) {
    s = withRepeat(surfacePBR(material, color), rx, ry)
    pbrCache.set(key, s)
  }
  return s
}

// חומר משטח מלא: צבע, בליטה וחספוס, ומים עם אדוות שזזות
export function RealSurfMat({ material, color, repeat }: { material: SurfaceMaterial; color?: string; repeat: [number, number] }) {
  const set = repeated(material, color, repeat[0], repeat[1])
  const ns = useMemo(() => new THREE.Vector2(set.normalScale, set.normalScale), [set])
  if (material === 'water') return <WaterMat set={set} color={color || MATERIALS.water.color} />
  return <meshStandardMaterial map={set.map} normalMap={set.normalMap} normalScale={ns} roughnessMap={set.roughnessMap} roughness={set.roughness} metalness={set.metalness} envMapIntensity={0.8} />
}

function WaterMat({ set, color }: { set: PBRSet; color: string }) {
  const nm = useMemo(() => {
    const t = set.normalMap.clone()
    t.needsUpdate = true
    return t
  }, [set])
  useFrame((stt, dt) => {
    stt.invalidate() // אדוות במים
    nm.offset.x += dt * 0.02
    nm.offset.y += dt * 0.012
  })
  return <meshPhysicalMaterial color={color} roughness={0.04} metalness={0.05} clearcoat={1} clearcoatRoughness={0.05} normalMap={nm} normalScale={new THREE.Vector2(0.35, 0.35)} envMapIntensity={1.6} transparent opacity={0.88} />
}

// טיח לקירות הבית
export function PlasterMat({ L, H, color }: { L: number; H: number; color?: string }) {
  const set = useMemo(() => withRepeat(plasterPBR(color), Math.max(0.3, L / 3), Math.max(0.3, H / 3)), [L, H, color])
  return <meshStandardMaterial map={set.map} normalMap={set.normalMap} normalScale={new THREE.Vector2(0.6, 0.6)} roughnessMap={set.roughnessMap} envMapIntensity={0.6} />
}

// קיר פיתוח מאבן
export function StoneWallMat({ L, H }: { L: number; H: number }) {
  const set = useMemo(() => withRepeat(surfacePBR('stone', '#cdbf9f'), Math.max(0.3, L / 1.6), Math.max(0.3, H / 1.6)), [L, H])
  return <meshStandardMaterial map={set.map} normalMap={set.normalMap} normalScale={new THREE.Vector2(1.3, 1.3)} roughnessMap={set.roughnessMap} />
}

export function GlassMat() {
  return <meshPhysicalMaterial color="#a9c4cf" roughness={0.03} metalness={0.4} transparent opacity={0.5} envMapIntensity={2} clearcoat={1} />
}

// מסגרת אלומיניום סביב פתח
export function OpeningFrame({ w, h, depth, type }: { w: number; h: number; depth: number; type: 'door' | 'window' | 'gate' }) {
  const f = 0.06
  const c = '#3a3d40'
  const mat = <meshStandardMaterial color={c} roughness={0.35} metalness={0.7} />
  return (
    <group>
      <mesh position={[0, h / 2 - f / 2, 0]} castShadow>
        <boxGeometry args={[w, f, depth]} />
        {mat}
      </mesh>
      {type === 'window' && (
        <mesh position={[0, -h / 2 + f / 2, 0]}>
          <boxGeometry args={[w, f, depth]} />
          {mat}
        </mesh>
      )}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (w - f)) / 2, 0, 0]} castShadow>
          <boxGeometry args={[f, h, depth]} />
          {mat}
        </mesh>
      ))}
      {type === 'window' && w > 1.2 && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[f * 0.7, h, depth * 0.8]} />
          {mat}
        </mesh>
      )}
    </group>
  )
}

// ---------- דשא בגבעולים ----------

const BLADE = (() => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.014, 0, 0, 0.014, 0, 0, 0.004, 0.5, 0.002, -0.004, 0.5, -0.002, 0, 1, 0], 3))
  g.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4])
  g.computeVertexNormals()
  return g
})()

export function GrassField({ surfaces, budget = 40000 }: { surfaces: Surface[]; budget?: number }) {
  const lawns = surfaces.filter((s) => s.material === 'lawn' || s.material === 'turf')
  const area = lawns.reduce((a, s) => a + s.w * s.d, 0)
  const density = area > 0 ? Math.min(220, budget / area) : 0
  return (
    <>
      {lawns.map((s) => (
        <GrassPatch key={s.id} s={s} density={density} />
      ))}
    </>
  )
}

function GrassPatch({ s, density }: { s: Surface; density: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const turf = s.material === 'turf'
  const count = Math.max(1, Math.floor(s.w * s.d * density))
  const base = new THREE.Color(s.color || (turf ? '#5f9c4e' : '#6f9e55'))
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    const top = s.level + MATERIALS[s.material].height
    let k = 0
    let tries = 0
    let seed = s.id.length * 7919
    const r = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    while (k < count && tries < count * 3) {
      tries++
      const x = s.x + r() * s.w
      const y = s.y + r() * s.d
      if (s.poly && !pointInPoly({ x, y }, s.poly)) continue
      o.position.set(x, top - 0.005, y)
      o.rotation.set((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5)
      const h = turf ? 0.035 + r() * 0.015 : 0.07 + r() * 0.08
      o.scale.set(1 + r() * 0.6, h, 1)
      o.updateMatrix()
      m.setMatrixAt(k, o.matrix)
      const hsl = { h: 0, s: 0, l: 0 }
      base.getHSL(hsl)
      c.setHSL(hsl.h + (r() - 0.5) * 0.04, hsl.s * (0.8 + r() * 0.3), hsl.l * (0.75 + r() * 0.5))
      m.setColorAt(k, c)
      k++
    }
    m.count = k
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [s, count, turf]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <instancedMesh ref={ref} args={[BLADE, undefined, count]} receiveShadow raycast={() => null}>
      <meshStandardMaterial side={THREE.DoubleSide} roughness={0.85} />
    </instancedMesh>
  )
}

// ---------- צמחייה ----------

function blobGeometry(radius: number, seed: number) {
  const g = new THREE.IcosahedronGeometry(radius, 3)
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed * 1.3) * Math.sin(v.z * 3.4 + seed * 0.7)
    const n2 = Math.sin(v.x * 9 + seed * 2) * Math.sin(v.y * 8.5) * Math.sin(v.z * 9.5 + seed)
    v.multiplyScalar(1 + n * 0.16 + n2 * 0.06)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

// צמרת מלאה: כמה גושי עלווה מחוספסים בגוונים
export function RealCrown({ r, color, seed = 1, flat = 1 }: { r: number; color: string; seed?: number; flat?: number }) {
  const set = leafPBR(color)
  const parts = useMemo(() => {
    const out: { p: [number, number, number]; s: number; g: THREE.BufferGeometry }[] = []
    const n = r > 1.2 ? 7 : r > 0.6 ? 5 : 3
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + seed
      const d = i === 0 ? 0 : r * 0.42
      const s = i === 0 ? r * 0.72 : r * (0.5 + ((i * 37 + seed * 13) % 10) / 40)
      out.push({ p: [Math.cos(a) * d, i === 0 ? r * 0.1 : ((i % 3) - 1) * r * 0.22, Math.sin(a) * d], s, g: blobGeometry(1, seed + i) })
    }
    return out
  }, [r, seed])
  useEffect(() => () => parts.forEach((x) => x.g.dispose()), [parts])
  return (
    <group scale={[1, flat, 1]}>
      {parts.map((x, i) => (
        <mesh key={i} geometry={x.g} position={x.p} scale={x.s} castShadow receiveShadow>
          <meshStandardMaterial color="#ffffff" map={set.map} normalMap={set.normalMap} normalScale={new THREE.Vector2(1.2, 1.2)} roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

export function RealTrunk({ h, r0 = 0.09, r1 = 0.15 }: { h: number; r0?: number; r1?: number }) {
  const set = useMemo(() => withRepeat(barkPBR(), 1, Math.max(1, h / 1.2)), [h])
  return (
    <mesh position={[0, h / 2, 0]} castShadow>
      <cylinderGeometry args={[r0, r1, h, 12]} />
      <meshStandardMaterial map={set.map} normalMap={set.normalMap} normalScale={new THREE.Vector2(1.5, 1.5)} roughness={0.95} />
    </mesh>
  )
}

// דקל: גזע טבעתי וכפות מתעקלות
export function RealPalm({ h, r, color }: { h: number; r: number; color: string }) {
  const frond = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 0.32, 12, 1)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + 0.5
      p.setXYZ(i, x, -x * x * 0.55, p.getY(i) * (1 - x * 0.7))
    }
    g.computeVertexNormals()
    return g
  }, [])
  useEffect(() => () => frond.dispose(), [frond])
  const set = leafPBR(color)
  return (
    <group>
      <RealTrunk h={h - 0.3} r0={0.15} r1={0.22} />
      {Array.from({ length: 11 }, (_, i) => (
        <mesh key={i} geometry={frond} position={[0, h - 0.35, 0]} rotation={[0, (i / 11) * Math.PI * 2, 0.35 - (i % 3) * 0.12]} scale={[r * 1.1, r * 1.1, r * 1.1]} castShadow>
          <meshStandardMaterial map={set.map} color="#ffffff" side={THREE.DoubleSide} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

// ---------- הצללה סביבתית ----------

// AO בפינות ובמגע בין משטחים. נכבה לבד אם המכשיר איטי
export function PostFX() {
  const { gl, scene, camera, size } = useThree()
  const [on, setOn] = useState(true)
  const composer = useMemo(() => {
    try {
      const c = new EffectComposer(gl)
      c.addPass(new RenderPass(scene, camera))
      const ao = new GTAOPass(scene, camera, size.width, size.height)
      ao.blendIntensity = 0.85
      ao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.2, scale: 1 })
      const orig = ao.overrideVisibility.bind(ao)
      // תוויות ומשטחים שקופים לא מטילים הצללה
      ao.overrideVisibility = () => {
        orig()
        scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined
          if ((o as THREE.Sprite).isSprite || (m && !Array.isArray(m) && m.transparent)) o.visible = false
        })
      }
      c.addPass(ao)
      c.addPass(new OutputPass())
      return c
    } catch {
      return null
    }
  }, [gl, scene, camera]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    composer?.setPixelRatio(gl.getPixelRatio())
    composer?.setSize(size.width, size.height)
  }, [composer, size.width, size.height, gl])
  useEffect(() => () => composer?.dispose(), [composer])
  const perf = useRef({ n: 0, t: 0 })
  useFrame((_, dt) => {
    if (!composer || !on) {
      gl.render(scene, camera)
      return
    }
    const t0 = performance.now()
    composer.render(dt)
    // מדידת זמן הציור עצמו: אם איטי מדי, ההצללה נכבית
    const p = perf.current
    if (p.n < 12) {
      p.n++
      if (p.n > 2) p.t += performance.now() - t0
      if (p.n === 12 && p.t / 10 > 45) setOn(false)
    }
  }, 1)
  return null
}
