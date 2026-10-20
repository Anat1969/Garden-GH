import { NavLink, Outlet, useOutletContext, useParams, Link } from 'react-router-dom'
import { activeVariant, updateProject, useApp } from '../lib/store'
import type { Project, Variant } from '../lib/types'
import { Empty, Loading } from '../components/ui'

export interface ProjectCtx {
  project: Project
  variant: Variant
}

export const useProject = () => useOutletContext<ProjectCtx>()

const TABS = [
  { to: '', t: 'סקירה', end: true },
  { to: 'permit', t: 'היתר' },
  { to: 'dims', t: 'מידות' },
  { to: 'plan', t: 'תוכנית ועריכה' },
  { to: 'model', t: 'מודל תלת-ממדי' },
  { to: 'bom', t: 'כתב כמויות' },
  { to: 'phases', t: 'שלבים ותקציב' },
  { to: 'variants', t: 'חלופות' },
]

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
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            {t.t}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ project, variant } satisfies ProjectCtx} />
    </div>
  )
}
