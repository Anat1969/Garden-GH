// בחירת משטחים לתכנון בלחיצה על התוכנית: "דוקרים" משטח, והוא מסומן. כל משטח (חוץ ממדרגות) מעל 4 מ"ר.
// preview: תוצאת תכנון מוצעת שמוצגת מעל המשטחים שנבחרו, לפני שמירה.
import { useMemo, useState } from 'react'
import type { Element, Project, Surface, Variant } from '../lib/types'
import { MATERIALS, OBJECTS, LINES } from '../lib/garden'
import { boundsOf, surfacePoly } from '../lib/elementGeom'
import { polyArea } from '../lib/geom'
import { fmtNum } from '../lib/bom'
import { stairPlan } from '../lib/stairs'
import { unitFootprints } from './model3d'

export const pickable = (els: Element[]): Surface[] =>
  els
    .filter((e): e is Surface => e.kind === 'surface' && !e.stairs)
    .filter((s) => Math.abs(polyArea(surfacePoly(s))) >= 4)
    .sort((a, b) => Math.abs(polyArea(surfacePoly(b))) - Math.abs(polyArea(surfacePoly(a))))

const pts = (p: { x: number; y: number }[]) => p.map((v) => `${v.x},${v.y}`).join(' ')

function Shape({ e, k, dim }: { e: Element; k: number; dim?: boolean }) {
  switch (e.kind) {
    case 'surface': {
      const sp = e.stairs ? stairPlan(e) : null
      if (sp)
        return (
          <g opacity={dim ? 0.5 : 1}>
            <polygon points={pts(surfacePoly(e))} fill="#efebe2" stroke="#4a4740" strokeWidth={k * 0.6} />
            {sp.steps.slice(1).map((st, i) => (
              <polygon key={i} points={pts(st.poly)} fill="none" stroke="#4a4740" strokeWidth={k * 0.35} />
            ))}
          </g>
        )
      return <polygon points={pts(surfacePoly(e))} fill={e.color || MATERIALS[e.material].color} opacity={dim ? 0.45 : 1} stroke="rgba(0,0,0,.15)" strokeWidth={k * 0.6} />
    }
    case 'wall':
      return <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={e.scope === 'garden' ? '#9b8462' : '#2a2f2d'} strokeWidth={Math.max(k * 1.6, e.thickness)} />
    case 'fence':
      return <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#6b4f36" strokeWidth={k * 1.2} strokeDasharray={`${k * 4} ${k * 2}`} />
    case 'line':
      return <polyline points={pts(e.pts)} fill="none" stroke={e.color || LINES[e.type].color} strokeWidth={Math.max(k * 1.4, e.width)} strokeLinecap="round" />
    case 'object': {
      const fill = e.color || OBJECTS[e.type].color
      return OBJECTS[e.type].round ? <ellipse cx={e.x} cy={e.y} rx={e.w / 2} ry={e.d / 2} fill={fill} fillOpacity={0.85} /> : <rect x={e.x - e.w / 2} y={e.y - e.d / 2} width={e.w} height={e.d} fill={fill} fillOpacity={0.85} transform={`rotate(${e.rot} ${e.x} ${e.y})`} />
    }
    default:
      return null
  }
}

const ORDER: Record<Element['kind'], number> = { surface: 0, line: 1, sketch: 2, fence: 3, wall: 4, opening: 5, object: 6 }

export function ZonePicker({ project, variant, picked, onToggle, preview, multi = true }: { project: Project; variant: Variant; picked: string[]; onToggle: (id: string) => void; preview?: Element[] | null; multi?: boolean }) {
  const els = variant.elements
  const fps = useMemo(() => unitFootprints(project), [project])
  const zones = useMemo(() => pickable(els), [els])
  const [hover, setHover] = useState<string | null>(null)
  const b = useMemo(() => {
    const bb = boundsOf(els)
    if (!bb) return null
    const pad = Math.max(1, Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 0.04)
    return { x: bb.minX - pad, y: bb.minY - pad, w: bb.maxX - bb.minX + pad * 2, h: bb.maxY - bb.minY + pad * 2 }
  }, [els])
  if (!b) return <div className="zone-picker empty">עוד אין תוכנית. משרטטים משטח בתוכנית, או טוענים היתר.</div>
  const k = Math.max(b.w, b.h) / 300
  const zoneIds = new Set(zones.map((z) => z.id))
  // בתצוגה מקדימה: המשטחים שנבחרו מוחלפים בתכנון המוצע
  const base = preview ? els.filter((e) => !picked.includes(e.id)) : els
  const sorted = [...base].sort((a, c) => ORDER[a.kind] - ORDER[c.kind])
  const hz = zones.find((z) => z.id === hover)
  return (
    <div className="zone-picker" data-testid="zone-picker">
      <svg viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label={multi ? 'בחירת משטחים לתכנון: לחיצה על משטח בתוכנית' : 'בחירת משטח: לחיצה על משטח בתוכנית'}>
        {fps.map((fp, i) => (
          <polygon key={`fp${i}`} points={pts(fp)} fill="#e9e6df" />
        ))}
        {sorted.map((e) => (
          <Shape key={e.id} e={e} k={k} dim={!preview && zoneIds.has(e.id) && !picked.includes(e.id) && picked.length > 0} />
        ))}
        {preview && [...preview].sort((a, c) => ORDER[a.kind] - ORDER[c.kind]).map((e) => <Shape key={`p${e.id}`} e={e} k={k} />)}
        {zones.map((z) => {
          const on = picked.includes(z.id)
          return (
            <polygon
              key={`z${z.id}`}
              data-testid="pick-zone"
              data-picked={on ? '1' : '0'}
              points={pts(surfacePoly(z))}
              fill={on && !preview ? '#2f5d4a' : '#000'}
              fillOpacity={on && !preview ? 0.22 : hover === z.id ? 0.08 : 0}
              stroke={on ? '#2f5d4a' : hover === z.id ? '#1d2120' : 'transparent'}
              strokeWidth={k * (on ? 2.4 : 1.6)}
              strokeDasharray={preview && on ? `${k * 5} ${k * 3}` : undefined}
              style={{ cursor: 'pointer' }}
              role="checkbox"
              aria-checked={on}
              aria-label={`${MATERIALS[z.material].text}, ${fmtNum(Math.abs(polyArea(surfacePoly(z))))} מ"ר`}
              tabIndex={0}
              onPointerEnter={() => setHover(z.id)}
              onPointerLeave={() => setHover(null)}
              onClick={() => onToggle(z.id)}
              onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), onToggle(z.id))}
            />
          )
        })}
      </svg>
      <div className="zone-hint" aria-live="polite">
        {hz ? (
          <>
            <b>{MATERIALS[hz.material].text}</b> · {fmtNum(Math.abs(polyArea(surfacePoly(hz))))} מ"ר · {picked.includes(hz.id) ? 'נבחר, לחיצה מבטלת' : 'לחיצה בוחרת'}
          </>
        ) : picked.length ? (
          <>
            נבחרו <b>{picked.length}</b> משטחים · <b>{fmtNum(zones.filter((z) => picked.includes(z.id)).reduce((a, z) => a + Math.abs(polyArea(surfacePoly(z))), 0))} מ"ר</b>
          </>
        ) : (
          <>לוחצים על משטח בתוכנית כדי לבחור אותו לתכנון.</>
        )}
      </div>
    </div>
  )
}
