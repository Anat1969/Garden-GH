import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createProject, deleteProject, useApp } from '../lib/store'
import { Empty, Loading, Rise, toast } from '../components/ui'

export default function Projects() {
  const projects = useApp((s) => s.projects)
  const ready = useApp((s) => s.ready)
  const cloud = useApp((s) => s.cloud)
  const cloudError = useApp((s) => s.cloudError)
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [q, setQ] = useState('')

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    const p = createProject(name.trim() || 'פרויקט חדש', address.trim())
    nav(`/p/${p.id}/permit`)
  }

  const list = projects.filter((p) => !q || p.name.includes(q) || p.address.includes(q))

  return (
    <div className="stack" style={{ gap: 24 }}>
      <Rise>
        <div className="eyebrow">ספרייה</div>
        <h1 className="h-page">פרויקטים</h1>
      </Rise>

      <form className="card" onSubmit={create}>
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
          <div className="field" style={{ alignSelf: 'end' }}>
            <button className="btn primary" type="submit">
              יצירה והמשך להיתר
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
            <Rise key={p.id} delay={0.03 * i} className="card">
              <div className="eyebrow">{new Date(p.updatedAt).toLocaleDateString('he-IL')}</div>
              <Link to={`/p/${p.id}`} style={{ textDecoration: 'none' }}>
                <div className="h-section" style={{ marginTop: 4 }}>
                  {p.name}
                </div>
              </Link>
              <div className="muted" style={{ fontSize: 14 }}>
                {p.address || 'כתובת לא הוזנה'}
              </div>
              <div className="muted" style={{ fontSize: 14 }}>
                {p.permit ? `היתר: ${p.permit.fileName}` : 'עוד לא הועלה היתר'} · {p.variants.length} חלופות
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <Link className="btn small primary" to={`/p/${p.id}`}>
                  פתיחה
                </Link>
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
            </Rise>
          ))}
        </div>
      )}
    </div>
  )
}
