import { NavLink, Outlet, useLocation, useOutletContext, useParams, Link } from 'react-router-dom'
import { hasBasis } from '../lib/bom'
import { activeVariant, updateProject, useApp } from '../lib/store'
import type { Project, Variant } from '../lib/types'
import { Empty, Loading } from '../components/ui'

export interface ProjectCtx {
  project: Project
  variant: Variant
}

export const useProject = () => useOutletContext<ProjectCtx>()

// סדר העבודה: כל לשונית היא שלב ממוספר, עם סימון "הושלם" לפי מצב הפרויקט
const TABS: { to: string; t: string; end?: boolean; done: (p: Project, v: Variant) => boolean }[] = [
  { to: '', t: 'פרטים ודרישות', end: true, done: (p) => Boolean(p.address.trim()) },
  { to: 'permit', t: 'היתר', done: (p) => Boolean(p.permit && p.permit.pageCount >= 0 && p.permit.fileName) },
  { to: 'dims', t: 'מידות', done: (p) => hasBasis(p) },
  { to: 'design', t: 'תכנון הגינה', done: (_p, v) => v.elements.some((e) => e.kind === 'surface' || e.kind === 'object') },
  { to: 'plan', t: 'תוכנית ועריכה', done: (_p, v) => v.elements.length > 0 && v.elements.every((e) => e.approved || e.kind === 'sketch') },
  { to: 'model', t: 'מודל תלת-ממדי', done: (_p, v) => v.elements.length > 0 },
  { to: 'bom', t: 'כתב כמויות', done: (_p, v) => v.elements.some((e) => e.kind === 'surface') },
  { to: 'phases', t: 'שלבים ותקציב', done: (_p, v) => v.elements.some((e) => e.kind === 'surface') },
  { to: 'variants', t: 'חלופות', done: (p) => p.variants.length > 1 },
]

// מעבר לשלב הקודם והבא בתחתית כל לשונית
function StepNav() {
  const loc = useLocation()
  const seg = loc.pathname.split('/')[3] ?? ''
  const i = Math.max(0, TABS.findIndex((t) => t.to === seg))
  const prev = TABS[i - 1]
  const next = TABS[i + 1]
  return (
    <nav className="step-nav no-print" aria-label="מעבר בין שלבים">
      {prev ? (
        <Link className="btn ghost" to={prev.to || '.'} aria-label="מעבר לשלב הקודם">
          שלב קודם: {prev.t}
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link className="btn primary" to={next.to} aria-label="מעבר לשלב הבא">
          השלב הבא: {String(i + 2).padStart(2, '0')} {next.t}
        </Link>
      )}
    </nav>
  )
}

export default function ProjectLayout() {
  const { id } = useParams()
  const project = useApp((s) => s.projects.find((p) => p.id === id))
  const ready = useApp((s) => s.ready)
  const userId = useApp((s) => s.userId)

  if (!project) {
    if (!ready) return <Loading text="טוען פרויקט" />
    return (
      <div className="card">
        <Empty title="הפרויקט לא נמצא">
          <div>{userId ? 'אין פרויקט כזה בחשבון.' : 'הפרויקט לא שמור במכשיר הזה. אם נשמר בענן, צריך להתחבר.'}</div>
          <Link className="btn" to="/projects">
            לספריית הפרויקטים
          </Link>
        </Empty>
      </div>
    )
  }
  const variant = activeVariant(project)

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">
            <Link to="/projects" style={{ textDecoration: 'none' }}>
              פרויקטים
            </Link>{' '}
            / {project.address || 'ללא כתובת'}
          </div>
          <h1 className="h-page" style={{ overflowWrap: 'anywhere' }}>
            {project.name}
          </h1>
        </div>
        <label className="field" style={{ minWidth: 180 }}>
          <span>חלופה פעילה</span>
          <select
            className="input"
            value={project.activeVariantId}
            onChange={(e) => updateProject(project.id, (p) => ({ ...p, activeVariantId: e.target.value }))}
          >
            {project.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <nav className="tabs no-print" aria-label="לשוניות פרויקט">
        {TABS.map((t, i) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab step-tab ${isActive ? 'active' : ''} ${t.done(project, variant) ? 'done' : ''}`}>
            <span className="step-n" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            {t.t}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ project, variant } satisfies ProjectCtx} />
      <StepNav />
    </div>
  )
}
