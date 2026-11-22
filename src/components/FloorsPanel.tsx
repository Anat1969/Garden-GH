import { useRef } from 'react'
import type { FloorPlan, Project, Pt, StoreyKind } from '../lib/types'
import { STOREY_TEXT, mirroredFloor, movedFloor, patchFloor, realignedFloor, removeFloor, rotatedFloor } from '../lib/floors'
import { unitFootprints } from '../lib/structureToElements'
import { fmtNum } from '../lib/bom'
import { Tag, toast } from './ui'

// מפלסי הבית: מרתף, קומות וגג, כל אחד מהתוכנית שלו, מעל קו המתאר של קומת הקרקע.
// כיול מחדש: גוררים את המפלס למקומו, מסובבים, משקפים, או מציבים שוב אוטומטית.

const KINDS: StoreyKind[] = ['basement', 'floor', 'roof']

export function FloorsPanel({ project }: { project: Project }) {
  const floors = project.floors ?? []
  const ground = unitFootprints(project)
  return (
    <div className="card" data-testid="floors-panel">
      <div className="h-section" style={{ marginBottom: 4 }}>
        מפלסי הבית: מרתף, קומות וגג
      </div>
      <ol className="muted" style={{ margin: '0 0 12px', paddingInlineStart: 20, fontSize: 14 }}>
        <li>
          כל מפלס נבנה <b>מהתוכנית שלו</b>: קו מתאר ופתחים. נקרא ב<b>קריאה מלאה של ההיתר</b>.
        </li>
        <li>
          באיור: <b>הקרקע באפור</b>, <b>המפלס בירוק</b>, חלונות בכחול ודלתות בכתום.
        </li>
        <li>
          <b>כיול מחדש:</b> אם המפלס לא יושב במקומו, <b>גוררים אותו</b> באיור, מסובבים או משקפים. אפשר גם לתקן את הסוג ואת הגובה.
        </li>
      </ol>
      {floors.length === 0 ? (
        <div className="notice info">עוד לא נקראו מפלסים. בלי תוכנית קומה, הקומות מוצגות במודל לפי קו המתאר של הקרקע.</div>
      ) : (
        <div className="facade-grid">
          {floors.map((f) => (
            <FloorCard key={f.id} projectId={project.id} f={f} ground={ground} />
          ))}
        </div>
      )}
    </div>
  )
}

function FloorCard({ projectId, f, ground }: { projectId: string; f: FloorPlan; ground: Pt[][] }) {
  const set = (fn: (x: FloorPlan) => FloorPlan) => patchFloor(projectId, f.id, fn)
  return (
    <div className="facade-card" data-testid="floor-card">
      <div className="facade-head">
        <b>{f.title || STOREY_TEXT[f.kind ?? 'floor']}</b>
        <Tag label="estimated" />
      </div>
      <FloorSvg f={f} ground={ground} onMove={(dx, dy) => set((x) => movedFloor(x, dx, dy))} />
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }} role="group" aria-label="כיול מחדש">
        <button type="button" className="btn small" data-testid="floor-rotate" onClick={() => set(rotatedFloor)}>
          סיבוב 90°
        </button>
        <button type="button" className="btn small" data-testid="floor-mirror" onClick={() => set(mirroredFloor)}>
          שיקוף
        </button>
        <button type="button" className="btn small" data-testid="floor-realign" onClick={() => set((x) => realignedFloor(x, ground))}>
          הצבה אוטומטית
        </button>
      </div>
      <div className="facade-row">
        <label>
          <span>סוג המפלס</span>
          <select value={f.kind ?? 'floor'} data-testid="floor-kind" onChange={(e) => set((x) => ({ ...x, kind: e.target.value as StoreyKind }))}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {STOREY_TEXT[k]}
              </option>
            ))}
          </select>
        </label>
        {(f.kind ?? 'floor') !== 'roof' && (
          <label>
            <span>גובה המפלס במטרים</span>
            <input
              className="input"
              type="number"
              step={0.05}
              min={2}
              max={6}
              placeholder="אוטומטי"
              data-testid="floor-height"
              value={f.height ?? ''}
              onChange={(e) => {
                const v = Number(e.target.value)
                set((x) => ({ ...x, height: e.target.value && v >= 2 && v <= 6 ? v : undefined }))
              }}
            />
          </label>
        )}
      </div>
      <div className="facade-row">
        <span style={{ fontSize: 13 }}>
          שטח <b>{fmtNum(f.area)} מ"ר</b> · <b>{f.openings.length}</b> פתחים
        </span>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            if (window.confirm(`להסיר את "${f.title || 'המפלס'}" מהמודל?`)) {
              removeFloor(projectId, f.id)
              toast('המפלס הוסר')
            }
          }}
        >
          הסרה
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        {f.how}.
      </div>
    </div>
  )
}

function FloorSvg({ f, ground, onMove }: { f: FloorPlan; ground: Pt[][]; onMove: (dx: number, dy: number) => void }) {
  const ref = useRef<SVGSVGElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  // התחום נקבע לפי הקרקע בלבד, כדי שהאיור לא יקפוץ בזמן גרירה
  const base = ground.flat().length ? ground.flat() : f.footprints.flat()
  if (!base.length) return null
  const pad = 4
  const x0 = Math.min(...base.map((p) => p.x)) - pad
  const y0 = Math.min(...base.map((p) => p.y)) - pad
  const w = Math.max(...base.map((p) => p.x)) + pad - x0
  const h = Math.max(...base.map((p) => p.y)) + pad - y0
  const pts = (p: Pt[]) => p.map((v) => `${v.x - x0},${v.y - y0}`).join(' ')
  const mPerPx = () => {
    const r = ref.current?.getBoundingClientRect()
    return r ? Math.max(w / r.width, h / r.height) : 0
  }
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${w} ${h}`}
      className="floor-svg"
      role="img"
      aria-label={`${f.title}: המפלס מעל קו המתאר של הקרקע. גוררים כדי להזיז`}
      data-testid="floor-svg"
      style={{ touchAction: 'none', cursor: 'grab' }}
      onPointerDown={(e) => {
        last.current = { x: e.clientX, y: e.clientY }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!last.current) return
        const k = mPerPx()
        const dx = (e.clientX - last.current.x) * k
        const dy = (e.clientY - last.current.y) * k
        if (Math.abs(dx) + Math.abs(dy) < 0.05) return
        last.current = { x: e.clientX, y: e.clientY }
        onMove(dx, dy)
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
    >
      {ground.map((g, i) => (
        <polygon key={`g${i}`} points={pts(g)} fill="#e4e2dc" stroke="#9a968c" strokeWidth={0.08} strokeDasharray="0.3 0.2" />
      ))}
      {f.footprints.map((g, i) => (
        <polygon key={`f${i}`} points={pts(g)} fill="rgba(47,93,74,0.28)" stroke="#2f5d4a" strokeWidth={0.12} />
      ))}
      {f.openings.map((o, i) => (
        <line key={`o${i}`} x1={o.a.x - x0} y1={o.a.y - y0} x2={o.b.x - x0} y2={o.b.y - y0} stroke={o.type === 'window' ? '#3b8fc4' : '#e0763a'} strokeWidth={0.35} />
      ))}
    </svg>
  )
}
