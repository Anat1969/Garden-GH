import { Link } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import { updateProject, updateVariant } from '../lib/store'
import { NumField, Tag } from '../components/ui'
import { PAGE_KIND_TEXT } from '../lib/types'
import { NO_BASIS, hasBasis } from '../lib/bom'

export default function Overview() {
  const { project, variant } = useProject()
  const els = variant.elements
  const pending = els.filter((e) => !e.approved).length
  const walls = els.filter((e) => e.kind === 'wall').length
  const openings = els.filter((e) => e.kind === 'opening').length
  const surfaces = els.filter((e) => e.kind === 'surface').length
  const fences = els.filter((e) => e.kind === 'fence').length
  const req = variant.requirements
  const setP = (patch: Partial<typeof project>) => updateProject(project.id, (p) => ({ ...p, ...patch }))
  const setR = (patch: Partial<typeof req>) => updateVariant(project.id, (v) => ({ ...v, requirements: { ...v.requirements, ...patch } }))

  const next = !project.permit
    ? { to: 'permit', t: 'העלאת היתר' }
    : !hasBasis(project)
      ? { to: 'permit', t: 'קביעת קנה מידה' }
      : pending
        ? { to: 'plan', t: `בדיקת ${pending} אלמנטים שלא אושרו` }
        : surfaces === 0
          ? { to: 'plan', t: 'שרטוט משטחי גינה' }
          : { to: 'bom', t: 'כתב כמויות' }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow">הצעד הבא</div>
            <div className="h-section">{next.t}</div>
          </div>
          <Link className="btn primary" to={next.to}>
            המשך
          </Link>
        </div>
      </div>

      <div className="grid-cards">
        <div className="card flat stat">
          <span className="k">היתר</span>
          <span className="v" style={{ fontSize: 18 }}>
            {project.permit ? project.permit.fileName : 'לא הועלה'}
          </span>
          {project.permit && (
            <span className="muted" style={{ fontSize: 13 }}>
              {project.permit.pageCount} עמודים · תוכנית בעמוד {project.permit.planPage} (
              {PAGE_KIND_TEXT[project.permit.pages.find((p) => p.index === project.permit!.planPage)?.kind ?? 'other']})
            </span>
          )}
        </div>
        <div className="card flat stat">
          <span className="k">קנה מידה</span>
          <span className="v">
            {project.permit?.scale.source === 'dimensions' ? (project.permit.sourceType === 'image' ? 'מהמידות' : `1:${project.permit.scale.den} מהמידות`) : project.permit?.scale.den ? `1:${project.permit.scale.den}` : project.permit?.scale.source === 'calibrated' ? 'כויל ידנית' : project.permit?.scale.source === 'manual-only' ? 'מידות ידניות' : NO_BASIS}
          </span>
          {(project.permit?.scale.source === 'text' || project.permit?.scale.source === 'dimensions') && <Tag label="measured" />}
          {project.permit?.scale.source === 'calibrated' && <Tag label="estimated" />}
          {project.permit?.scale.source === 'manual-only' && <Tag label="assumed" />}
        </div>
        <div className="card flat stat">
          <span className="k">אלמנטים בחלופה "{variant.name}"</span>
          <span className="v">
            {walls} קירות · {openings} פתחים
          </span>
          <span className="muted" style={{ fontSize: 13 }}>
            {surfaces} משטחים · {fences} גדרות · {pending} ממתינים לאישור
          </span>
        </div>
      </div>

      <div className="card">
        <div className="h-section" style={{ marginBottom: 10 }}>
          פרטי הפרויקט
        </div>
        <div className="form-grid">
          <label className="field">
            <span>שם</span>
            <input className="input" value={project.name} onChange={(e) => setP({ name: e.target.value })} />
          </label>
          <label className="field">
            <span>כתובת</span>
            <input className="input" value={project.address} onChange={(e) => setP({ address: e.target.value })} />
          </label>
          <NumField label="כיוון צפון (מעלות, 0 = למעלה בתוכנית)" value={project.north} step={1} onChange={(n) => setP({ north: n })} />
          <label className="field">
            <span>סוג קרקע</span>
            <select className="input" value={project.soil} onChange={(e) => setP({ soil: e.target.value })}>
              <option value="">לא ידוע</option>
              <option value="חמרה">חמרה</option>
              <option value="חולית">חולית</option>
              <option value="חרסיתית">חרסיתית</option>
              <option value="סלעית">סלעית</option>
              <option value="מילוי">מילוי</option>
            </select>
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>מפלסים ידועים (כפי שמופיעים בהיתר)</span>
            <input className="input" value={project.levelsNote} onChange={(e) => setP({ levelsNote: e.target.value })} placeholder="למשל: 0.00 = +42.30, חצר אחורית -0.45" />
          </label>
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          נתוני גשם, ניקוז ומי תהום: לא זמינים בשלב זה. ניקוז לבית: דורש מהנדס מוסמך.
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="h-section">דרישות הלקוח · חלופה "{variant.name}"</div>
        </div>
        <div className="form-grid">
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>פונקציות לגינה</span>
            <textarea className="input" value={req.functions} onChange={(e) => setR({ functions: e.target.value })} placeholder="פינת ישיבה, משחק לילדים, ערוגות ירק" />
          </label>
          <label className="field">
            <span>צמחייה</span>
            <input className="input" value={req.plants} onChange={(e) => setR({ plants: e.target.value })} placeholder="חסכונית במים, ים-תיכונית" />
          </label>
          <label className="field">
            <span>חומרים</span>
            <input className="input" value={req.materials} onChange={(e) => setR({ materials: e.target.value })} placeholder="אבן, עץ, חצץ" />
          </label>
          <label className="field">
            <span>
              תקציב לקוח (₪) <Tag label="assumed" />
            </span>
            <input
              className="input num"
              type="number"
              inputMode="numeric"
              value={req.budget ?? ''}
              onChange={(e) => setR({ budget: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>מגבלות</span>
            <input className="input" value={req.constraints} onChange={(e) => setR({ constraints: e.target.value })} placeholder="גישה צרה לחצר, עצים קיימים לשימור" />
          </label>
        </div>
      </div>
    </div>
  )
}
