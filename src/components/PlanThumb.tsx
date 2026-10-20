import { useMemo } from 'react'
import type { Element, Project } from '../lib/types'
import { LINES, MATERIALS, OBJECTS } from '../lib/garden'
import { boundsOf } from '../lib/elementGeom'
import { activeVariant } from '../lib/store'
import { unitFootprints } from './model3d'

// תוכנית מוקטנת של הבית והגינה לכרטיס פרויקט: משטחים בצבעי החומר, קירות, גדרות ופריטים
const ORDER: Record<Element['kind'], number> = { surface: 0, line: 1, sketch: 2, fence: 3, wall: 4, opening: 5, object: 6 }

export function PlanThumb({ project }: { project: Project }) {
  const els = activeVariant(project).elements
  const fps = useMemo(() => unitFootprints(project), [project])
  const b = useMemo(() => {
    const bb = boundsOf(els)
    if (!bb) return null
    const pad = Math.max(1, Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 0.06)
    return { x: bb.minX - pad, y: bb.minY - pad, w: bb.maxX - bb.minX + pad * 2, h: bb.maxY - bb.minY + pad * 2 }
  }, [els])

  if (!b)
    return (
      <div className="plan-thumb empty">
        <span>{project.permit ? 'היתר נטען, עוד אין תוכנית' : 'עוד אין תוכנית'}</span>
      </div>
    )
  const k = Math.max(b.w, b.h) / 160
  const sorted = [...els].sort((a, c) => ORDER[a.kind] - ORDER[c.kind])
  const north = project.north || 0
  return (
    <div className="plan-thumb">
      <svg viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`תוכנית ${project.name}`}>
        {fps.map((fp, i) => (
          <polygon key={`fp${i}`} points={fp.map((p) => `${p.x},${p.y}`).join(' ')} fill="#f1efe9" stroke="none" />
        ))}
        {sorted.map((e) => {
          switch (e.kind) {
            case 'surface': {
              const fill = e.color || MATERIALS[e.material].color
              return e.poly ? (
                <polygon key={e.id} points={e.poly.map((p) => `${p.x},${p.y}`).join(' ')} fill={fill} stroke="rgba(0,0,0,.12)" strokeWidth={k * 0.6} />
              ) : (
                <rect key={e.id} x={e.x} y={e.y} width={e.w} height={e.d} fill={fill} stroke="rgba(0,0,0,.12)" strokeWidth={k * 0.6} />
              )
            }
            case 'line':
              return <polyline key={e.id} points={e.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={e.color || LINES[e.type].color} strokeWidth={Math.max(k * 1.5, e.width)} strokeLinecap="round" strokeLinejoin="round" />
            case 'sketch':
              return <polyline key={e.id} points={e.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={e.color} strokeWidth={Math.max(k, e.stroke)} strokeLinecap="round" opacity={0.8} />
            case 'fence':
              return <line key={e.id} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#6b4f36" strokeWidth={k * 1.4} strokeDasharray={`${k * 4} ${k * 2}`} />
            case 'wall':
              return <line key={e.id} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={e.scope === 'garden' ? '#9b8462' : '#2a2f2d'} strokeWidth={Math.max(k * 1.6, e.thickness)} strokeLinecap="square" />
            case 'object': {
              const fill = e.color || OBJECTS[e.type].color
              return OBJECTS[e.type].round ? (
                <ellipse key={e.id} cx={e.x} cy={e.y} rx={e.w / 2} ry={e.d / 2} fill={fill} fillOpacity={0.85} stroke="rgba(0,0,0,.2)" strokeWidth={k * 0.5} />
              ) : (
                <rect key={e.id} x={e.x - e.w / 2} y={e.y - e.d / 2} width={e.w} height={e.d} fill={fill} fillOpacity={0.85} transform={`rotate(${e.rot} ${e.x} ${e.y})`} />
              )
            }
            default:
              return null
          }
        })}
      </svg>
      <span className="thumb-north" style={{ transform: `rotate(${north}deg)` }} aria-label="צפון">
        צ
      </span>
    </div>
  )
}
