import type { FloorPlan, Project, Pt } from '../lib/types'
import { removeFloor } from '../lib/floors'
import { unitFootprints } from '../lib/structureToElements'
import { fmtNum } from '../lib/bom'
import { Tag, toast } from './ui'

// הקומות העליונות: כל קומה מהתוכנית שלה, מוצגת מעל קו המתאר של קומת הקרקע כדי שאפשר יהיה לבדוק את ההצבה בעין.

export function FloorsPanel({ project }: { project: Project }) {
  const floors = project.floors ?? []
  const ground = unitFootprints(project)
  return (
    <div className="card" data-testid="floors-panel">
      <div className="h-section" style={{ marginBottom: 4 }}>
        הקומות העליונות
      </div>
      <ol className="muted" style={{ margin: '0 0 12px', paddingInlineStart: 20, fontSize: 14 }}>
        <li>
          כל קומה נבנית <b>מהתוכנית שלה</b>: קו מתאר ופתחים, ולא קופסה מעל קומת הקרקע.
        </li>
        <li>
          הקומות נקראות ב<b>קריאה מלאה של ההיתר</b>, מכל שרטוט שכותרתו תוכנית קומה.
        </li>
        <li>
          באיור: <b>הקרקע באפור</b>, <b>הקומה בירוק</b>, חלונות בכחול ודלתות בכתום. כך בודקים שהקומה יושבת במקומה.
        </li>
      </ol>
      {floors.length === 0 ? (
        <div className="notice info">עוד לא נקראו קומות עליונות. בלי תוכנית קומה, הקומות מוצגות במודל לפי קו המתאר של הקרקע.</div>
      ) : (
        <div className="facade-grid">
          {floors.map((f, i) => (
            <div key={f.id} className="facade-card" data-testid="floor-card">
              <div className="facade-head">
                <b>{f.title || `קומה ${i + 1}`}</b>
                <Tag label="estimated" />
              </div>
              <FloorSvg f={f} ground={ground} />
              <div className="facade-row">
                <span style={{ fontSize: 13 }}>
                  שטח <b>{fmtNum(f.area)} מ"ר</b> · <b>{f.openings.length}</b> פתחים
                </span>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    if (window.confirm(`להסיר את "${f.title || 'הקומה'}" מהמודל?`)) {
                      removeFloor(project.id, f.id)
                      toast('הקומה הוסרה')
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
          ))}
        </div>
      )}
    </div>
  )
}

function FloorSvg({ f, ground }: { f: FloorPlan; ground: Pt[][] }) {
  const all = [...ground.flat(), ...f.footprints.flat()]
  if (!all.length) return null
  const x0 = Math.min(...all.map((p) => p.x)) - 1
  const y0 = Math.min(...all.map((p) => p.y)) - 1
  const w = Math.max(...all.map((p) => p.x)) + 1 - x0
  const h = Math.max(...all.map((p) => p.y)) + 1 - y0
  const pts = (p: Pt[]) => p.map((v) => `${v.x - x0},${v.y - y0}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="floor-svg" role="img" aria-label={`${f.title}: הקומה מעל קו המתאר של הקרקע`}>
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
