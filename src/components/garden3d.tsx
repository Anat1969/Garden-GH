// רכיבי תלת-ממד לספריית הגינה: טקסטורות משטח, פריטים נקודתיים, אלמנטים קוויים ושרטוט חופשי.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { GardenLine, GardenObject, Pt, Sketch, SurfaceMaterial } from '../lib/types'
import { LINES, MATERIALS, OBJECTS } from '../lib/garden'
import { textureCanvas } from '../lib/textures'

const SEL = '#2f5d4a'

const pick = (id: string, onSelect: (id: string) => void) => (ev: ThreeEvent<MouseEvent>) => {
  ev.stopPropagation()
  onSelect(id)
}

// טקסטורה לפי חומר. repeat: [x, y] במספר חזרות, או null לעבודה ב-UV במטרים (ExtrudeGeometry)
export function useSurfaceTexture(material: SurfaceMaterial, color: string | undefined, repeat: [number, number] | null) {
  const tile = MATERIALS[material].tile
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(textureCanvas(material, color, 256))
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 4
    if (repeat) t.repeat.set(repeat[0], repeat[1])
    else t.repeat.set(1 / tile, 1 / tile)
    return t
  }, [material, color, tile, repeat?.[0], repeat?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex.dispose(), [tex])
  return tex
}

function Mat({ color, selected, roughness = 0.9, opacity }: { color: string; selected: boolean; roughness?: number; opacity?: number }) {
  return <meshStandardMaterial color={selected ? SEL : color} roughness={roughness} transparent={opacity !== undefined} opacity={opacity ?? 1} />
}

// ---------- פריט נקודתי ----------

export function GardenObjectMesh({ o, selected, onSelect }: { o: GardenObject; selected: boolean; onSelect: (id: string) => void }) {
  const def = OBJECTS[o.type]
  const c = o.color || def.color
  const { w, d, h } = o
  const r = Math.max(w, d) / 2
  const onClick = pick(o.id, onSelect)
  let body: JSX.Element
  switch (o.type) {
    case 'tree':
    case 'fruit_tree': {
      const trunk = Math.max(0.6, h - r * 1.4)
      body = (
        <>
          <mesh position={[0, trunk / 2, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.15, trunk, 8]} />
            <Mat color="#7a5a3a" selected={selected} />
          </mesh>
          <mesh position={[0, trunk + Math.min(r, h / 2) * 0.8, 0]} scale={[1, Math.min(1, (h - trunk) / (r * 1.6) || 1), 1]} castShadow>
            <sphereGeometry args={[r, 18, 12]} />
            <Mat color={c} selected={selected} roughness={1} />
          </mesh>
          {o.type === 'fruit_tree' &&
            [0, 1, 2, 3, 4, 5].map((i) => (
              <mesh key={i} position={[Math.cos(i * 1.05) * r * 0.85, trunk + r * 0.6 + (i % 2) * r * 0.3, Math.sin(i * 1.05) * r * 0.85]}>
                <sphereGeometry args={[0.09, 8, 6]} />
                <meshStandardMaterial color="#e08a2c" />
              </mesh>
            ))}
        </>
      )
      break
    }
    case 'palm':
      body = (
        <>
          <mesh position={[0, (h - 0.4) / 2, 0]} castShadow>
            <cylinderGeometry args={[0.14, 0.2, h - 0.4, 8]} />
            <Mat color="#8a6a48" selected={selected} />
          </mesh>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <mesh key={i} position={[Math.cos((i * Math.PI) / 4) * r * 0.45, h - 0.5, Math.sin((i * Math.PI) / 4) * r * 0.45]} rotation={[0, -(i * Math.PI) / 4, 0.45]} castShadow>
              <boxGeometry args={[r, 0.04, 0.35]} />
              <Mat color={c} selected={selected} roughness={1} />
            </mesh>
          ))}
        </>
      )
      break
    case 'shrub':
    case 'flowers':
      body = (
        <mesh position={[0, h / 2, 0]} scale={[w / 2, h / 2, d / 2]} castShadow>
          <sphereGeometry args={[1, 14, 10]} />
          <Mat color={c} selected={selected} roughness={1} />
        </mesh>
      )
      break
    case 'planter':
    case 'sandbox':
      body = (
        <>
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
            <Mat color={o.type === 'sandbox' ? '#8d6a45' : c} selected={selected} />
          </mesh>
          <mesh position={[0, h + 0.005, 0]}>
            <boxGeometry args={[Math.max(0.05, w - 0.12), 0.01, Math.max(0.05, d - 0.12)]} />
            <meshStandardMaterial color={o.type === 'sandbox' ? '#e6d6ad' : '#5e8a4e'} roughness={1} />
          </mesh>
        </>
      )
      break
    case 'pergola': {
      const posts: [number, number][] = [[-w / 2 + 0.08, -d / 2 + 0.08], [w / 2 - 0.08, -d / 2 + 0.08], [-w / 2 + 0.08, d / 2 - 0.08], [w / 2 - 0.08, d / 2 - 0.08]]
      const slats = Math.max(3, Math.round(w / 0.4))
      body = (
        <>
          {posts.map(([x, z], i) => (
            <mesh key={i} position={[x, h / 2, z]} castShadow>
              <boxGeometry args={[0.14, h, 0.14]} />
              <Mat color={c} selected={selected} />
            </mesh>
          ))}
          {[-d / 2 + 0.08, d / 2 - 0.08].map((z, i) => (
            <mesh key={`b${i}`} position={[0, h - 0.1, z]} castShadow>
              <boxGeometry args={[w + 0.3, 0.2, 0.08]} />
              <Mat color={c} selected={selected} />
            </mesh>
          ))}
          {Array.from({ length: slats }, (_, i) => (
            <mesh key={`s${i}`} position={[-w / 2 + (i + 0.5) * (w / slats), h + 0.04, 0]} castShadow>
              <boxGeometry args={[0.06, 0.12, d + 0.3]} />
              <Mat color={c} selected={selected} />
            </mesh>
          ))}
        </>
      )
      break
    }
    case 'umbrella':
      body = (
        <>
          <mesh position={[0, h / 2, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, h, 6]} />
            <meshStandardMaterial color="#777" />
          </mesh>
          <mesh position={[0, h - 0.25, 0]} castShadow>
            <coneGeometry args={[r, 0.5, 16, 1, true]} />
            <meshStandardMaterial color={selected ? SEL : c} side={THREE.DoubleSide} roughness={0.9} />
          </mesh>
        </>
      )
      break
    case 'dining':
      body = (
        <>
          <mesh position={[0, h - 0.03, 0]} castShadow>
            <cylinderGeometry args={[Math.min(w, d) * 0.28, Math.min(w, d) * 0.28, 0.05, 20]} />
            <Mat color={c} selected={selected} />
          </mesh>
          <mesh position={[0, (h - 0.05) / 2, 0]}>
            <cylinderGeometry args={[0.05, 0.05, h - 0.05, 8]} />
            <meshStandardMaterial color="#555" />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[Math.cos((i * Math.PI) / 2) * Math.min(w, d) * 0.4, 0.23, Math.sin((i * Math.PI) / 2) * Math.min(w, d) * 0.4]} castShadow>
              <boxGeometry args={[0.45, 0.46, 0.45]} />
              <Mat color={c} selected={selected} />
            </mesh>
          ))}
        </>
      )
      break
    case 'pond':
      body = (
        <>
          <mesh position={[0, 0.06, 0]} scale={[w / 2, 1, d / 2]} receiveShadow>
            <cylinderGeometry args={[1.08, 1.08, 0.12, 32]} />
            <Mat color="#a59c8e" selected={selected} />
          </mesh>
          <mesh position={[0, 0.125, 0]} scale={[w / 2, 1, d / 2]}>
            <cylinderGeometry args={[1, 1, 0.01, 32]} />
            <meshStandardMaterial color={c} roughness={0.15} metalness={0.1} />
          </mesh>
        </>
      )
      break
    case 'fountain':
      body = (
        <>
          <mesh position={[0, 0.2, 0]} castShadow>
            <cylinderGeometry args={[r, r * 1.05, 0.4, 24]} />
            <Mat color="#c9c2b6" selected={selected} />
          </mesh>
          <mesh position={[0, 0.41, 0]}>
            <cylinderGeometry args={[r * 0.9, r * 0.9, 0.01, 24]} />
            <meshStandardMaterial color={c} roughness={0.15} />
          </mesh>
          <mesh position={[0, h / 2 + 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.1, h - 0.4, 10]} />
            <meshStandardMaterial color="#c9c2b6" />
          </mesh>
        </>
      )
      break
    case 'lamp':
    case 'spot':
      body = (
        <>
          <mesh position={[0, h / 2, 0]}>
            <cylinderGeometry args={[0.03, 0.04, h, 8]} />
            <meshStandardMaterial color="#3d3f3e" />
          </mesh>
          <mesh position={[0, h, 0]}>
            <sphereGeometry args={[Math.max(0.06, r * 0.5), 12, 10]} />
            <meshStandardMaterial color={selected ? SEL : c} emissive={c} emissiveIntensity={0.6} />
          </mesh>
        </>
      )
      break
    case 'shed':
      body = (
        <>
          <mesh position={[0, (h * 0.8) / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, h * 0.8, d]} />
            <Mat color={c} selected={selected} />
          </mesh>
          <mesh position={[0, h * 0.8 + 0.06, 0]} rotation={[0.12, 0, 0]} castShadow>
            <boxGeometry args={[w + 0.2, 0.08, d + 0.25]} />
            <meshStandardMaterial color="#6c6a66" />
          </mesh>
        </>
      )
      break
    default:
      body = o.type === 'firepit' || def.round ? (
        <mesh position={[0, h / 2, 0]} scale={[w / 2, 1, d / 2]} castShadow>
          <cylinderGeometry args={[1, 1, h, 24]} />
          <Mat color={c} selected={selected} />
        </mesh>
      ) : (
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <Mat color={c} selected={selected} />
        </mesh>
      )
  }
  return (
    <group position={[o.x, o.level, o.y]} rotation={[0, (-o.rot * Math.PI) / 180, 0]} onClick={onClick}>
      {body}
    </group>
  )
}

// ---------- אלמנט קווי ----------

function segs(pts: Pt[]) {
  const out: { cx: number; cy: number; L: number; ang: number }[] = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    if (L < 0.01) continue
    out.push({ cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, L, ang: Math.atan2(b.y - a.y, b.x - a.x) })
  }
  return out
}

export function GardenLineMesh({ l, selected, onSelect }: { l: GardenLine; selected: boolean; onSelect: (id: string) => void }) {
  const def = LINES[l.type]
  const c = l.color || def.color
  const flat = l.type === 'path' || l.type === 'irrigation' || l.type === 'light_strip'
  const h = flat ? (l.type === 'path' ? 0.06 : 0.03) : Math.max(0.03, l.height)
  const w = Math.max(0.03, l.type === 'irrigation' ? 0.04 : l.type === 'light_strip' ? 0.05 : l.width)
  const pathTex = useSurfaceTexture('paving', l.type === 'path' ? l.color : undefined, [1, 1])
  return (
    <group onClick={pick(l.id, onSelect)}>
      {segs(l.pts).map((s, i) => (
        <mesh key={i} position={[s.cx, l.level + h / 2, s.cy]} rotation={[0, -s.ang, 0]} castShadow={!flat} receiveShadow>
          <boxGeometry args={[s.L + (l.type === 'path' ? w * 0.5 : w * 0.3), h, w]} />
          {l.type === 'path' && !selected ? (
            <meshStandardMaterial map={pathTex} roughness={0.95} />
          ) : (
            <meshStandardMaterial
              color={selected ? SEL : c}
              roughness={l.type === 'hedge' ? 1 : 0.8}
              emissive={l.type === 'light_strip' ? c : '#000000'}
              emissiveIntensity={l.type === 'light_strip' ? 0.7 : 0}
            />
          )}
        </mesh>
      ))}
    </group>
  )
}

// ---------- שרטוט חופשי: קו על הקרקע ----------

export function SketchMesh({ s, selected, onSelect }: { s: Sketch; selected: boolean; onSelect: (id: string) => void }) {
  const pts = s.closed && s.pts.length > 2 ? [...s.pts, s.pts[0]] : s.pts
  const w = Math.max(0.02, s.stroke)
  return (
    <group onClick={pick(s.id, onSelect)}>
      {segs(pts).map((g, i) => (
        <mesh key={i} position={[g.cx, 0.02, g.cy]} rotation={[0, -g.ang, 0]}>
          <boxGeometry args={[g.L + w, 0.012, w]} />
          <meshBasicMaterial color={selected ? SEL : s.color} />
        </mesh>
      ))}
    </group>
  )
}
