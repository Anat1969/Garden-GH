import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addProject, createProject, deleteProject, updateProject, useApp } from '../lib/store'
import type { Project } from '../lib/types'
import { buildShaniProject } from '../data/shaniProject'
import { Empty, Loading, Rise, toast } from '../components/ui'
import { DraftDocs, type DraftDoc } from '../components/Documents'
import { PlanThumb } from '../components/PlanThumb'
import { PageIntro } from '../components/PageIntro'
import { addDocuments, readableAsPermit } from '../lib/docs'

function ProjectCard({ p, delay }: { p: Project; delay: number }) {
  const [edit, setEdit] = useState(false)
  const [name, setName] = useState(p.name)
  const [address, setAddress] = useState(p.address)
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    updateProject(p.id, (x) => ({ ...x, name: name.trim() || x.name, address: address.trim() }))
    setEdit(false)
    toast('הפרויקט עודכן')
  }
  const docs = p.documents?.length ?? 0
  return (
    <Rise delay={delay} className="card project-card">
      <Link to={`/p/${p.id}/plan`} aria-label={`תוכנית ${p.name}`} style={{ display: 'block' }}>
        <PlanThumb project={p} />
      </Link>
      {edit ? (
        <form className="stack" style={{ gap: 8, marginTop: 10 }} onSubmit={save}>
          <label className="field">
            <span>שם הפרויקט</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>כתובת</span>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <div className="row">
            <button className="btn small primary" type="submit">
              שמירה
            </button>
            <button
              className="btn small ghost"
              type="button"
              onClick={() => {
                setName(p.name)
                setAddress(p.address)
                setEdit(false)
              }}
            >
              ביטול
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="eyebrow" style={{ marginTop: 10 }}>
            {new Date(p.updatedAt).toLocaleDateString('he-IL')}
          </div>
          <Link to={`/p/${p.id}`} style={{ textDecoration: 'none' }}>
            <div className="h-section" style={{ marginTop: 4 }}>
              {p.name}
            </div>
          </Link>
          <div className="muted" style={{ fontSize: 14 }}>
            {p.address || 'כתובת לא הוזנה'}
          </div>
          <div className="muted" style={{ fontSize: 14 }}>
            {p.permit ? `היתר: ${p.permit.fileName}` : 'עוד לא הועלה היתר'} · {p.variants.length} חלופות{docs ? ` · ${docs} מסמכים` : ''}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <Link className="btn small primary" to={`/p/${p.id}`}>
              פתיחה
            </Link>
            <button className="btn small" onClick={() => setEdit(true)}>
              עריכה
            </button>
            <button
              className="btn small danger"
              onClick={() => {
                if (window.confirm(`למחוק את "${p.name}"? לא ניתן לשחזר.`)) {
                  void deleteProject(p.id)
                  toast('הפרויקט נמחק')
                }
              }}
            >
              מחיקה
            </button>
          </div>
        </>
      )}
    </Rise>
  )
}

export default function Projects() {
  const projects = useApp((s) => s.projects)
  const ready = useApp((s) => s.ready)
  const cloud = useApp((s) => s.cloud)
  const cloudError = useApp((s) => s.cloudError)
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [q, setQ] = useState('')
  const [drafts, setDrafts] = useState<DraftDoc[]>([])
  const [saving, setSaving] = useState(false)

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const p = createProject(name.trim() || 'פרויקט חדש', address.trim())
    let auto: string | null = null
    if (drafts.length) {
      setSaving(true)
      try {
        const added = await addDocuments(
          p.id,
          drafts.map((d) => ({ file: d.file, kind: d.kind })),
        )
        auto = added.find((d) => d.kind === 'permit' && readableAsPermit(d))?.id ?? null
      } catch {
        toast('חלק מהמסמכים לא נשמרו')
      } finally {
        setSaving(false)
      }
    }
    nav(auto ? `/p/${p.id}/permit?doc=${auto}` : `/p/${p.id}/permit`)
  }

  const list = projects.filter((p) => !q || p.name.includes(q) || p.address.includes(q))

  return (
    <div className="stack" style={{ gap: 24 }}>
      <h1 className="h-page">פרויקטים</h1>
      <PageIntro
        art="projects"
        title="כל גינה היא פרויקט: היתר, מסמכים, תכנון וחלופות"
        why={
          <>
            יוצרים פרויקט עם <b>מסמכים מכל סוג</b>, וההיתר נקרא אוטומטית. בכל כרטיס רואים את <b>תוכנית הבית והגינה</b>, ואפשר <b>לערוך או למחוק</b>.
          </>
        }
        insights={[
          { k: 'פרויקטים', v: projects.length },
          { k: 'עם היתר', v: projects.filter((p) => p.permit).length },
          { k: 'מסמכים', v: projects.reduce((a, p) => a + (p.documents?.length ?? 0), 0) },
        ]}
      />

      <form className="card" onSubmit={(e) => void create(e)}>
        <div className="h-section" style={{ marginBottom: 10 }}>
          פרויקט חדש
        </div>
        <div className="form-grid">
          <label className="field">
            <span>שם הפרויקט</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: גינת משפחת לוי" />
          </label>
          <label className="field">
            <span>כתובת</span>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="רחוב, עיר" />
          </label>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <span>מסמכים לפרויקט</span>
            <DraftDocs docs={drafts} setDocs={setDrafts} />
          </div>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? 'שומרת מסמכים' : 'יצירה והמשך להיתר'}
            </button>
          </div>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button
              className="btn"
              type="button"
              onClick={() => {
                const p = buildShaniProject()
                addProject(p)
                nav(`/p/${p.id}/model`)
              }}
            >
              פרויקט לדוגמה: הבית של שני
            </button>
          </div>
        </div>
      </form>

      {cloudError && <div className="notice danger">{cloudError}</div>}

      <div className="row">
        <input className="input" style={{ maxWidth: 320 }} placeholder="חיפוש לפי שם או כתובת" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש" />
        {cloud === 'syncing' && <span className="muted">מסנכרן עם הענן</span>}
      </div>

      {!ready ? (
        <Loading />
      ) : list.length === 0 ? (
        <div className="card flat">
          <Empty title={projects.length ? 'אין תוצאות לחיפוש' : 'הספרייה ריקה'}>
            {projects.length ? null : <div>יוצרים פרויקט בטופס למעלה.</div>}
          </Empty>
        </div>
      ) : (
        <div className="grid-cards">
          {list.map((p, i) => (
            <ProjectCard key={p.id} p={p} delay={0.03 * i} />
          ))}
        </div>
      )}
    </div>
  )
}
