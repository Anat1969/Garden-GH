import { useState } from 'react'
import { useProject } from './ProjectLayout'
import { newVariant, updateProject, useApp } from '../lib/store'
import { computeBom, fmtMoney, sumRange } from '../lib/bom'
import { Rise, toast } from '../components/ui'
import { PageIntro } from '../components/PageIntro'
import type { Variant } from '../lib/types'

export default function VariantsTab() {
  const { project, variant } = useProject()
  const prices = useApp((s) => s.prices)
  const [name, setName] = useState('')
  const base = project.variants[0]

  const stats = (v: Variant) => {
    const s = sumRange(computeBom(v, prices))
    return { ...s, count: v.elements.length, surfaces: v.elements.filter((e) => e.kind === 'surface').length }
  }
  const baseStats = stats(base)

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    const v = newVariant(name.trim() || `חלופה ${project.variants.length + 1}`, variant)
    updateProject(project.id, (p) => ({ ...p, variants: [...p.variants, v], activeVariantId: v.id }))
    setName('')
    toast(`נוצרה "${v.name}" והיא פעילה`)
  }

  const patch = (id: string, fn: (v: Variant) => Variant) => updateProject(project.id, (p) => ({ ...p, variants: p.variants.map((v) => (v.id === id ? fn(v) : v)) }))

  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageIntro
        art="variants"
        title="כמה כיוונים לאותה גינה, והשוואה ביניהם"
        points={[
          <>כל <b>חלופה</b> היא עותק עצמאי של התכנון: ידני, הצעה בסגנון, או גרסה חסכונית.</>,
          <>ההשוואה מראה <b>הפרש עלות</b> מול החלופה הראשונה.</>,
          <>ההיתר וקנה המידה משותפים לכל החלופות.</>,
        ]}
        insights={[
          { k: 'חלופות', v: project.variants.length },
          { k: 'פעילה', v: variant.name },
          { k: 'החלופה הראשונה', v: baseStats.max ? `${fmtMoney(baseStats.min)} עד ${fmtMoney(baseStats.max)}` : 'אין מחירים' },
        ]}
      />
      <form className="card" onSubmit={create}>
        <div className="h-section">חלופה חדשה</div>
        <div className="muted" style={{ fontSize: 14, margin: '4px 0 10px' }}>
          עותק של החלופה הפעילה ("{variant.name}"), לעבודה עם דרישות שונות. ההיתר וקנה המידה משותפים.
        </div>
        <div className="row">
          <input className="input" style={{ maxWidth: 320 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: חלופה חסכונית" aria-label="שם החלופה" />
          <button className="btn primary" type="submit">
            יצירת חלופה
          </button>
        </div>
      </form>

      <div className="grid-cards">
        {project.variants.map((v, i) => {
          const s = stats(v)
          const isBase = v.id === base.id
          const diffCost = s.max && baseStats.max ? (s.min + s.max) / 2 - (baseStats.min + baseStats.max) / 2 : null
          return (
            <Rise key={v.id} delay={i * 0.04} className="card" style={v.id === project.activeVariantId ? { outline: '2px solid var(--accent)' } : undefined}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="eyebrow">{isBase ? 'החלופה הראשונה' : new Date(v.createdAt).toLocaleDateString('he-IL')}</div>
                {v.id === project.activeVariantId && <span className="lbl measured">פעילה</span>}
              </div>
              <input className="input" style={{ marginTop: 6, fontWeight: 500 }} value={v.name} onChange={(e) => patch(v.id, (x) => ({ ...x, name: e.target.value }))} aria-label="שם חלופה" />
              <div className="muted" style={{ fontSize: 14, marginTop: 8 }}>
                {s.count} אלמנטים · {s.surfaces} משטחים
              </div>
              <div className="num" style={{ marginTop: 4 }}>
                {s.max ? `${fmtMoney(s.min)} עד ${fmtMoney(s.max)}` : 'אין מחירים'}
              </div>
              {!isBase && (
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  הפרש מהחלופה הראשונה: {s.count - baseStats.count >= 0 ? '+' : ''}
                  {s.count - baseStats.count} אלמנטים
                  {diffCost !== null && ` · ${diffCost >= 0 ? 'יקרה ב' : 'זולה ב'}${fmtMoney(Math.abs(diffCost))} (אמצע הטווח)`}
                </div>
              )}
              <textarea className="input" style={{ marginTop: 8, minHeight: 60 }} placeholder="הערה על החלופה" value={v.note} onChange={(e) => patch(v.id, (x) => ({ ...x, note: e.target.value }))} aria-label="הערה" />
              <div className="row" style={{ marginTop: 10 }}>
                {v.id !== project.activeVariantId && (
                  <button className="btn small primary" onClick={() => updateProject(project.id, (p) => ({ ...p, activeVariantId: v.id }))}>
                    הפעלה
                  </button>
                )}
                {!isBase && (
                  <button
                    className="btn small danger"
                    onClick={() => {
                      if (!window.confirm(`למחוק את "${v.name}"?`)) return
                      updateProject(project.id, (p) => {
                        const variants = p.variants.filter((x) => x.id !== v.id)
                        return { ...p, variants, activeVariantId: p.activeVariantId === v.id ? variants[0].id : p.activeVariantId }
                      })
                    }}
                  >
                    מחיקה
                  </button>
                )}
              </div>
            </Rise>
          )
        })}
      </div>
    </div>
  )
}
