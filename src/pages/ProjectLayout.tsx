import { NavLink, Outlet, useLocation, useOutletContext, useParams, Link } from 'react-router-dom'
import { hasBasis } from '../lib/bom'
import { activeVariant, updateProject, useApp } from '../lib/store'
import type { Project, Variant } from '../lib/types'
import { Empty, Loading } from '../components/ui'
import { PrintHead } from '../components/PrintVisuals'

export interface ProjectCtx {
  project: Project
  variant: Variant
}

export const useProject = () => useOutletContext<ProjectCtx>()

// סדר העבודה: שישה שלבים, כמו בדף הבית. בכל שלב תחנה אחת או יותר (1.1, 1.2...), עם סימון "הושלם"
export const STAGES = ['פרויקט והיתר', 'תוכנית: קירות ופתחים', 'תכנון הגינה', 'מודל ואקלים', 'כמויות ותקציב', 'הגשה וחלופות']
const TABS: { to: string; t: string; stage: number; end?: boolean; done: (p: Project, v: Variant) => boolean }[] = [
  { to: '', t: 'פרטים ודרישות', stage: 0, end: true, done: (p) => Boolean(p.address.trim()) },
  { to: 'permit', t: 'היתר', stage: 0, done: (p) => Boolean(p.permit && p.permit.pageCount >= 0 && p.permit.fileName) },
  { to: 'dims', t: 'מידות', stage: 0, done: (p) => hasBasis(p) },
  { to: 'plan', t: 'תוכנית ועריכה', stage: 1, done: (_p, v) => v.elements.length > 0 && v.elements.every((e) => e.approved || e.kind === 'sketch') },
  { to: 'design', t: 'תכנון הגינה', stage: 2, done: (_p, v) => v.elements.some((e) => e.kind === 'surface' || e.kind === 'object') },
  { to: 'model', t: 'מודל תלת-ממדי ואקלים', stage: 3, done: (_p, v) => v.elements.length > 0 },
  { to: 'bom', t: 'כתב כמויות', stage: 4, done: (_p, v) => v.elements.some((e) => e.kind === 'surface') },
  { to: 'phases', t: 'שלבים ותקציב', stage: 4, done: (_p, v) => v.elements.some((e) => e.kind === 'surface') },
  { to: 'sheet', t: 'גליון להדפסה', stage: 5, done: (p) => Boolean(p.sheet?.poem || p.sheet?.post) },
  { to: 'variants', t: 'חלופות', stage: 5, done: (p) => p.variants.length > 1 },
]
const tabNo = (t: (typeof TABS)[number]) => `${t.stage + 1}.${TABS.filter((x) => x.stage === t.stage).indexOf(t) + 1}`

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
          השלב הבא: {tabNo(next)} {next.t}
        </Link>
      )}
    </nav>
  )
}

export default function ProjectLayout() {
  const { id } = useParams()
  const loc = useLocation()
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
      {(loc.pathname.split('/')[3] ?? '') !== 'sheet' && <PrintHead project={project} subject={TABS.find((t) => t.to === (loc.pathname.split('/')[3] ?? ''))?.t ?? ''} />}
      <div className="row no-print" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
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
        <div className="row" style={{ gap: 8, alignItems: 'end' }}>
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
      </div>
      <nav className="tabs stage-tabs no-print" aria-label="לשוניות פרויקט">
        {STAGES.map((name, si) => (
          <div key={name} className="stage-group" role="group" aria-label={`שלב ${si + 1}: ${name}`}>
            <span className="stage-name">
              <b>{si + 1}</b> {name}
            </span>
            <div className="stage-row">
              {TABS.filter((t) => t.stage === si).map((t) => (
                <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab step-tab ${isActive ? 'active' : ''} ${t.done(project, variant) ? 'done' : ''}`}>
                  <span className="step-n" aria-hidden="true">
                    {tabNo(t)}
                  </span>
                  {t.t}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <Outlet context={{ project, variant } satisfies ProjectCtx} />
      <StepNav />
    </div>
  )
}
