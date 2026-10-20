// המחשה תלת-ממדית לכללי האצבע: סצנה לכל קטגוריה, עם תוויות של הפרמטר והערך מתוך המדריך.
// הכלל שנבחר ברשימה מודגש בסצנה.
import { useEffect, useRef, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls as OrbitImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import { RULES } from '../data/gardenGuide'
import { Label3D } from './model3d'

type V3 = [number, number, number]
const C = { lawn: '#8fbf86', paving: '#c9c2b4', stone: '#cbbfa8', wall: '#bdbfbb', wood: '#a37c52', soil: '#8b6a4a', leaf: '#4f7d47', bed: '#7d5d40', water: '#7fb4c9', ink: '#2a2f2d', accent: '#2f5d4a' }

const Box = ({ p, s, c, o, rot }: { p: V3; s: V3; c: string; o?: number; rot?: V3 }) => (
  <mesh position={p} rotation={rot} castShadow receiveShadow>
    <boxGeometry args={s} />
    <meshStandardMaterial color={c} roughness={0.9} transparent={o !== undefined} opacity={o ?? 1} />
  </mesh>
)
const Cyl = ({ p, r, h, c, e }: { p: V3; r: number; h: number; c: string; e?: boolean }) => (
  <mesh position={p} castShadow>
    <cylinderGeometry args={[r, r, h, 20]} />
    <meshStandardMaterial color={c} roughness={0.8} emissive={e ? c : '#000000'} emissiveIntensity={e ? 0.9 : 0} />
  </mesh>
)
const Ball = ({ p, r, c }: { p: V3; r: number; c: string }) => (
  <mesh position={p} castShadow>
    <sphereGeometry args={[r, 16, 12]} />
    <meshStandardMaterial color={c} roughness={1} />
  </mesh>
)
const Tree = ({ p, r = 1.2, h = 2.4 }: { p: V3; r?: number; h?: number }) => (
  <group position={p}>
    <Cyl p={[0, h / 2, 0]} r={0.08} h={h} c="#7a5a3a" />
    <Ball p={[0, h + r * 0.6, 0]} r={r} c={C.leaf} />
  </group>
)

// קו מידה: פס דק עם שני קצוות, בצבע ההדגשה
function Dim({ a, b, y = 0.06, on }: { a: V3; b: V3; y?: number; on: boolean }) {
  const dx = b[0] - a[0]
  const dz = b[2] - a[2]
  const L = Math.hypot(dx, dz)
  const ang = Math.atan2(dz, dx)
  const col = on ? C.accent : '#6d706d'
  return (
    <group position={[(a[0] + b[0]) / 2, y, (a[2] + b[2]) / 2]} rotation={[0, -ang, 0]}>
      <mesh>
        <boxGeometry args={[L, 0.03, 0.03]} />
        <meshBasicMaterial color={col} />
      </mesh>
      {[-L / 2, L / 2].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[0.03, 0.03, 0.35]} />
          <meshBasicMaterial color={col} />
        </mesh>
      ))}
    </group>
  )
}

interface Anchor {
  rule: number
  at: V3
}

// הגיאומטריה ונקודות התוויות של כל קטגוריה
function sceneFor(id: string, hl: number | null): { body: ReactNode; anchors: Anchor[] } {
  const on = (i: number) => hl === i
  switch (id) {
    case 'paths':
      return {
        body: (
          <>
            <Box p={[0, -0.05, 0]} s={[9, 0.1, 7]} c={C.lawn} />
            <Box p={[0, 0.02, 0]} s={[9, 0.06, 1.35]} c={C.paving} />
            <Box p={[2.2, 0.02, -2.2]} s={[0.9, 0.06, 3.1]} c={C.paving} />
            {[0, 1, 2, 3].map((i) => (
              <Cyl key={i} p={[-2.6, 0.04, 1.3 + i * 0.62]} r={0.22} h={0.06} c={C.stone} />
            ))}
            <Dim a={[-3.6, 0, -0.68]} b={[-3.6, 0, 0.68]} y={0.12} on={on(0)} />
            <Dim a={[1.75, 0, -3.2]} b={[2.65, 0, -3.2]} y={0.12} on={on(1)} />
            <Dim a={[-3.1, 0, 1.3]} b={[-3.1, 0, 1.92]} y={0.12} on={on(4)} />
          </>
        ),
        anchors: [
          { rule: 0, at: [-3.6, 0.9, 0] },
          { rule: 1, at: [2.2, 0.9, -3.2] },
          { rule: 4, at: [-2.6, 0.8, 2.6] },
          { rule: 5, at: [1, 0.6, 0.4] },
        ],
      }
    case 'seating':
      return {
        body: (
          <>
            <Box p={[0, -0.05, 0]} s={[9, 0.1, 7]} c={C.lawn} />
            <Box p={[0, 1.4, -2.2]} s={[6, 2.8, 0.25]} c={C.wall} />
            <Box p={[0, 0.03, -0.6]} s={[3, 0.08, 3]} c={C.stone} />
            <Box p={[0, 0.75, -0.6]} s={[1.6, 0.05, 0.9]} c={C.wood} />
            <Box p={[0, 0.37, -0.6]} s={[0.1, 0.72, 0.1]} c="#555" />
            {[
              [-0.5, -1.35],
              [0.5, -1.35],
              [-0.5, 0.15],
              [0.5, 0.15],
            ].map(([x, z], i) => (
              <Box key={i} p={[x, 0.23, z]} s={[0.45, 0.46, 0.45]} c="#8d6a45" />
            ))}
            <Cyl p={[0, 0.2, 2.6]} r={0.5} h={0.4} c="#7b6b5f" />
            <Dim a={[-1.5, 0, 1.05]} b={[1.5, 0, 1.05]} y={0.14} on={on(0)} />
            <Dim a={[1.9, 0, -2.05]} b={[1.9, 0, 2.6]} y={0.14} on={on(6)} />
          </>
        ),
        anchors: [
          { rule: 0, at: [0, 1.5, 1.05] },
          { rule: 1, at: [-2.6, 1.2, -0.6] },
          { rule: 6, at: [2.6, 1.0, 1.2] },
        ],
      }
    case 'steps_levels':
      return {
        body: (
          <>
            <Box p={[0, -0.05, 0]} s={[9, 0.1, 7]} c={C.lawn} />
            {[0, 1, 2].map((i) => (
              <Box key={i} p={[0, 0.075 + i * 0.15, 1 - i * 0.33]} s={[2, 0.15, 0.33 * (3 - i) + 0.01]} c={C.stone} />
            ))}
            <Box p={[0, 0.225, -1.5]} s={[6, 0.45, 2.4]} c={C.paving} />
            <Box p={[2.6, 0.225 + 0.225, 1.2]} s={[2, 0.45, 0.4]} c={C.stone} />
            <Dim a={[1.15, 0, 1.17]} b={[1.15, 0, 0.84]} y={0.18} on={on(1)} />
          </>
        ),
        anchors: [
          { rule: 0, at: [-1.8, 1.0, 0.8] },
          { rule: 1, at: [1.3, 0.8, 1.4] },
          { rule: 2, at: [-1.4, 0.6, 1.8] },
          { rule: 6, at: [2.6, 1.3, 1.2] },
        ],
      }
    case 'drainage':
      return {
        body: (
          <>
            <Box p={[0, 1.4, -2.6]} s={[7, 2.8, 0.25]} c={C.wall} />
            <Box p={[0, 0.2, -2.0]} s={[1.2, 0.04, 1]} c="#9aa09d" />
            <Box p={[0, 0.02, -0.6]} s={[7, 0.08, 2.2]} c={C.paving} rot={[-0.04, 0, 0]} />
            <Box p={[0, -0.12, 2.0]} s={[7, 0.08, 3]} c={C.lawn} rot={[-0.03, 0, 0]} />
            <Box p={[0, 0.06, -1.5]} s={[1.4, 0.06, 0.18]} c="#555" />
            {[-2, 0, 2].map((x) => (
              <mesh key={x} position={[x, 0.15, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.14, 0.4, 12]} />
                <meshBasicMaterial color={hl === 0 ? C.accent : '#4a87a8'} />
              </mesh>
            ))}
          </>
        ),
        anchors: [
          { rule: 0, at: [2.4, 0.9, -0.6] },
          { rule: 1, at: [-2.2, 0.7, 2.2] },
          { rule: 2, at: [0, 1.5, -2.0] },
          { rule: 3, at: [-2.2, 0.8, -1.5] },
        ],
      }
    case 'planting_soil':
      return {
        body: (
          <>
            <Box p={[0, -0.05, 0]} s={[10, 0.1, 8]} c={C.lawn} />
            <Box p={[-3.5, 1.4, 0]} s={[3, 2.8, 6]} c={C.wall} />
            <Tree p={[-1.0 + 0.5, 0, -1.6]} r={0.8} h={1.8} />
            <Tree p={[2.5, 0, 1.4]} r={1.3} h={2.6} />
            <Box p={[2.5, -0.5, 1.4]} s={[1, 1, 1]} c={C.soil} o={0.55} />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Ball key={i} p={[-1.6 + i * 0.4, 0.35, 3.4]} r={0.32} c="#5e8a4e" />
            ))}
            <Dim a={[-2, 0, -1.6]} b={[-0.5, 0, -1.6]} y={0.08} on={on(0)} />
            <Dim a={[-2, 0, 1.4]} b={[2.5, 0, 1.4]} y={0.08} on={on(1)} />
          </>
        ),
        anchors: [
          { rule: 0, at: [-1.2, 0.6, -2.4] },
          { rule: 1, at: [0.3, 0.6, 2.2] },
          { rule: 4, at: [-0.4, 1.0, 3.8] },
          { rule: 8, at: [3.6, 0.3, 1.4] },
        ],
      }
    case 'irrigation':
      return {
        body: (
          <>
            <Box p={[-2.2, 0.05, 0]} s={[3, 0.2, 6]} c={C.bed} />
            <Box p={[2.2, -0.02, 0]} s={[4, 0.06, 6]} c={C.lawn} />
            {[-1.2, 0, 1.2].map((z) => (
              <group key={z}>
                <Box p={[-2.2, 0.17, z]} s={[2.8, 0.03, 0.03]} c="#333" />
                {[-3.2, -2.6, -2, -1.4].map((x) => (
                  <Ball key={x} p={[x, 0.2, z]} r={0.05} c={hl === 0 ? C.accent : C.water} />
                ))}
              </group>
            ))}
            {[
              [0.6, -2.6],
              [3.8, -2.6],
              [0.6, 2.6],
              [3.8, 2.6],
            ].map(([x, z], i) => (
              <mesh key={i} position={[x, 0.45, z]}>
                <coneGeometry args={[1.6, 0.9, 20, 1, true]} />
                <meshStandardMaterial color={C.water} transparent opacity={hl === 1 ? 0.45 : 0.22} side={2} />
              </mesh>
            ))}
          </>
        ),
        anchors: [
          { rule: 0, at: [-2.2, 0.9, -2.4] },
          { rule: 1, at: [2.2, 1.3, 0] },
          { rule: 2, at: [0, 0.6, 3.4] },
          { rule: 3, at: [0, 1.8, -3.2] },
        ],
      }
    case 'lighting':
      return {
        body: (
          <>
            <Box p={[0, -0.05, 0]} s={[10, 0.1, 6]} c="#5d7a58" />
            <Box p={[0, 0.02, 0]} s={[10, 0.06, 1.3]} c={C.paving} />
            {[-3, 0, 3].map((x) => (
              <group key={x}>
                <Cyl p={[x, 0.4, 0.9]} r={0.06} h={0.8} c="#3d3f3e" />
                <Cyl p={[x, 0.82, 0.9]} r={0.09} h={0.08} c="#f3d38a" e />
                <mesh position={[x, 0.06, 0.9]} rotation={[-Math.PI / 2, 0, 0]}>
                  <circleGeometry args={[0.9, 24]} />
                  <meshBasicMaterial color="#f8e2a6" transparent opacity={0.35} />
                </mesh>
              </group>
            ))}
            <Tree p={[2.5, 0, -2]} r={1.1} h={2.2} />
            <Cyl p={[2.5, 0.08, -1.3]} r={0.08} h={0.12} c="#f3d38a" e />
            <Dim a={[-3, 0, 1.5]} b={[0, 0, 1.5]} y={0.1} on={on(1)} />
          </>
        ),
        anchors: [
          { rule: 0, at: [-3, 1.5, 0.9] },
          { rule: 1, at: [-1.5, 0.7, 2.0] },
          { rule: 4, at: [2.5, 3.8, -2] },
        ],
      }
    case 'climate':
      return {
        body: (
          <>
            <Box p={[0, -0.05, 0]} s={[10, 0.1, 8]} c={C.lawn} />
            <Box p={[0, 1.6, -3]} s={[7, 3.2, 0.3]} c={C.wall} />
            <Box p={[-3.4, 1.6, -1.6]} s={[0.15, 3.2, 3]} c="#6f9a5f" />
            <Box p={[0.8, 0.03, -1.6]} s={[3.6, 0.08, 2.6]} c={C.stone} />
            {[
              [-0.9, -2.8],
              [2.5, -2.8],
              [-0.9, -0.4],
              [2.5, -0.4],
            ].map(([x, z], i) => (
              <Box key={i} p={[x, 1.3, z]} s={[0.12, 2.6, 0.12]} c={C.wood} />
            ))}
            {Array.from({ length: 8 }, (_, i) => (
              <Box key={i} p={[-0.8 + i * 0.47, 2.65, -1.6]} s={[0.06, 0.12, 2.8]} c={C.wood} />
            ))}
            <Tree p={[-2.8, 0, 2.2]} r={1.4} h={2.6} />
            <Ball p={[-7, 4, 6]} r={0.6} c="#f2c14e" />
          </>
        ),
        anchors: [
          { rule: 0, at: [0.8, 3.4, -1.0] },
          { rule: 1, at: [-2.8, 4.6, 2.2] },
          { rule: 3, at: [3.4, 1.6, -0.4] },
          { rule: 5, at: [-3.4, 3.6, -1.6] },
        ],
      }
    default:
      // פרופורציות, תחזוקה ותקציב
      return {
        body: (
          <>
            <Box p={[0, -0.05, 0]} s={[10, 0.1, 8]} c={C.paving} />
            <Box p={[0, 1.4, -3.6]} s={[9, 2.8, 0.25]} c={C.wall} />
            <Box p={[0, 0.08, -3.15]} s={[8.6, 0.16, 0.6]} c={C.bed} />
            {[-3, -1.5, 0, 1.5, 3].map((x) => (
              <Ball key={x} p={[x, 0.4, -3.15]} r={0.28} c="#5e8a4e" />
            ))}
            <Box p={[0.5, 0.02, 0.6]} s={[6, 0.06, 3]} c={C.lawn} />
            <Tree p={[3.6, 0, 2.6]} r={0.9} h={2} />
            <Dim a={[-2.7, 0, -0.9]} b={[-2.7, 0, 2.1]} y={0.1} on={on(0)} />
          </>
        ),
        anchors: [
          { rule: 0, at: [-2.7, 0.8, 0.6] },
          { rule: 1, at: [-1, 1.0, -3.0] },
          { rule: 3, at: [3.6, 3.6, 2.6] },
          { rule: 4, at: [1.8, 0.9, 3.4] },
        ],
      }
  }
}

function Orbit() {
  const { camera, gl } = useThree()
  const ref = useRef<OrbitImpl | null>(null)
  useEffect(() => {
    const c = new OrbitImpl(camera, gl.domElement)
    c.enableDamping = true
    c.autoRotate = true
    c.autoRotateSpeed = 0.6
    c.maxPolarAngle = Math.PI / 2.1
    c.target.set(0, 0.6, 0)
    camera.position.set(7, 6.5, 8)
    c.update()
    ref.current = c
    let raf = 0
    const loop = () => {
      c.update()
      raf = requestAnimationFrame(loop)
    }
    loop()
    const stop = () => (c.autoRotate = false)
    gl.domElement.addEventListener('pointerdown', stop)
    return () => {
      cancelAnimationFrame(raf)
      gl.domElement.removeEventListener('pointerdown', stop)
      c.dispose()
    }
  }, [camera, gl])
  return null
}

export function RuleScene({ groupId, highlight }: { groupId: string; highlight: number | null }) {
  const group = RULES.find((g) => g.id === groupId) ?? RULES[0]
  const { body, anchors } = sceneFor(group.id, highlight)
  return (
    <div className="rule-scene" data-testid="rule-scene">
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 38, near: 0.1, far: 200 }}>
        <hemisphereLight args={['#ffffff', '#b8c4bb', 0.75]} />
        <directionalLight position={[-6, 9, 6]} intensity={1.4} castShadow />
        {body}
        {anchors.map((a) => {
          const r = group.rules[a.rule]
          if (!r) return null
          const on = highlight === a.rule
          const v = r.value ? (r.value.length > 26 ? r.value.slice(0, 25) + '…' : r.value) : ''
          return <Label3D key={a.rule} text={`${r.rule.length > 22 ? r.rule.slice(0, 21) + '…' : r.rule}${v ? ': ' + v : ''}`} position={a.at} size={on ? 0.42 : 0.3} color={on ? '#ffffff' : '#1d2120'} bg={on ? 'rgba(47,93,74,0.95)' : 'rgba(255,255,255,0.9)'} />
        })}
        <Orbit />
      </Canvas>
      <div className="rule-scene-cap">
        <b>{group.title}</b> · גוררים לסיבוב, גלגלת לזום
      </div>
    </div>
  )
}
