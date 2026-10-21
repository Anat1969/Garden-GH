import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import { newVariant, updateProject, useApp } from '../lib/store'
import { computeBom, fmtMoney, sumRange } from '../lib/bom'
import { Rich, Rise, toast } from '../components/ui'
import { PageIntro } from '../components/PageIntro'
import { PlanThumb } from '../components/PlanThumb'
import { RequirementsSummary, renameVariant } from '../components/VariantContext'
import { IconBtn } from '../components/EditIcons'
import { explainVariant } from '../lib/variantDiff'
import { lastChangeText } from '../lib/changes'
import { fromProject } from '../lib/sheet/fromProject'
import { renderView } from '../lib/sheet/render3d'
import type { Project, Variant } from '../lib/types'

// הדמיה של חלופה: נוצרת פעם אחת לכל מצב של החלופה ונשמרת בזיכרון
const renders = new Map<string, string>()
const renderKey = (v: Variant) => `${v.id}:${v.lastChange?.at ?? v.createdAt}:${v.elements.length}`

function useVariantRender(project: Project, v: Variant) {
  const key = renderKey(v)
  const [img, setImg] = useState<string | null>(renders.get(key) ?? null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    if (renders.has(key)) {
      setImg(renders.get(key)!)
      return
    }
    setImg(null)
    const t = setTimeout(() => {
      try {
        const model = fromProject({ ...project, activeVariantId: v.id })
        const r = renderView(model.scene, { width: 960, height: 640, view: 'persp' })
        renders.set(key, r.dataUrl)
        setImg(r.dataUrl)
      } catch (e) {
        console.warn(e)
        setErr(true)
      }
    }, 60)
    return () => clearTimeout(t)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { img, err }
}

function VariantRender({ project, v }: { project: Project; v: Variant }) {
  const { img, err } = useVariantRender(project, v)
  if (err) return <div className="variant-render empty">ההדמיה לא נוצרה במכשיר הזה</div>
  if (!img) return <div className="variant-render empty">בונה הדמיה...</div>
  return <img className="variant-render" src={img} alt={`הדמיה: ${v.name}`} />
}

export default function VariantsTab() {
  const { project, variant } = useProject()
  const prices = useApp((s) => s.prices)
  const nav = useNavigate()
  const [name, setName] = useState('')
  const base = project.variants[0]

  const stats = (v: Variant) => {
    const s = sumRange(computeBom(v, prices))
    return { ...s, count: v.elements.length, surfaces: v.elements.filter((e) => e.kind === 'surface').length }
  }
  const baseStats = stats(base)

  const activate = (v: Variant, to?: string) => {
    if (v.id !== project.activeVariantId) {
      updateProject(project.id, (p) => ({ ...p, activeVariantId: v.id }))
      toast(`חלופה ${project.variants.indexOf(v) + 1} פעילה: ${v.name}`)
    }
    if (to) nav(`/p/${project.id}/${to}`)
  }

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    const v = newVariant(name.trim() || `חלופה ${project.variants.length + 1}`, variant)
    v.lastChange = { at: new Date().toISOString(), text: `הועתקה מ"${variant.name}"` }
    updateProject(project.id, (p) => ({ ...p, variants: [...p.variants, v], activeVariantId: v.id }))
    setName('')
    toast(`נוצרה "${v.name}" והיא פעילה`)
  }

  const patch = (id: string, fn: (v: Variant) => Variant) => updateProject(project.id, (p) => ({ ...p, variants: p.variants.map((v) => (v.id === id ? fn(v) : v)) }))
  const activeNo = project.variants.findIndex((v) => v.id === variant.id) + 1

  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageIntro
        art="variants"
        title="כמה כיוונים לאותה גינה, והשוואה ביניהם"
        points={[
          <>כל <b>חלופה</b> היא עותק עצמאי של התכנון: ידני, הצעה בסגנון, או גרסה חסכונית.</>,
          <>לכל חלופה <b>תוכנית ממבט על</b>, <b>הדמיה</b>, הדרישות, ו<b>הסבר במה היא שונה</b> משאר החלופות.</>,
          <><b>לחיצה על התוכנית</b> מפעילה את החלופה.</>,
        ]}
        insights={[
          { k: 'חלופות', v: project.variants.length },
          { k: 'פעילה', v: `${activeNo}. ${variant.name}` },
          { k: 'החלופה הראשית', v: baseStats.max ? `${fmtMoney(baseStats.min)} עד ${fmtMoney(baseStats.max)}` : 'אין מחירים' },
        ]}
      />

      <section className="card variant-focus" data-testid="variant-focus">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div className="h-section">
            חלופה {activeNo}: {variant.name}
          </div>
          <span className="lbl measured">פעילה</span>
        </div>
        <div className="variant-views">
          <figure>
            <PlanThumb project={project} variant={variant} onClick={() => nav(`/p/${project.id}/plan`)} label="פתיחה בתוכנית" />
            <figcaption>תוכנית, מבט על. לחיצה פותחת את התוכנית.</figcaption>
          </figure>
          <figure>
            <button type="button" className="render-btn" onClick={() => nav(`/p/${project.id}/model`)} aria-label="פתיחה במודל">
              <VariantRender project={project} v={variant} />
            </button>
            <figcaption>מודל. לחיצה פותחת את המודל התלת-ממדי.</figcaption>
          </figure>
        </div>
        <div className="variant-why">
          <b>במה היא שונה</b>
          <ul>
            {explainVariant(project, variant).map((t) => (
              <li key={t}>
                <Rich text={t} />
              </li>
            ))}
          </ul>
        </div>
        <RequirementsSummary project={project} variant={variant} />
      </section>

      <form className="card" onSubmit={create}>
        <div className="h-section">חלופה חדשה</div>
        <div className="muted" style={{ fontSize: 14, margin: '4px 0 10px' }}>
          עותק של החלופה הפעילה ("{variant.name}"), לעבודה עם דרישות שונות. ההיתר וקנה המידה משותפים.
        </div>
        <div className="row">
          <input className="input" style={{ maxWidth: 320 }} value={name} onChange={(e) => setName(e.target.value)} placeholder={`חלופה ${project.variants.length + 1}`} aria-label="שם החלופה" />
          <button className="btn primary" type="submit">
            יצירת חלופה
          </button>
        </div>
      </form>

      <div className="grid-cards variant-grid">
        {project.variants.map((v, i) => {
          const s = stats(v)
          const isBase = v.id === base.id
          const isActive = v.id === project.activeVariantId
          const diffCost = s.max && baseStats.max ? (s.min + s.max) / 2 - (baseStats.min + baseStats.max) / 2 : null
          const last = lastChangeText(v)
          return (
            <Rise key={v.id} delay={i * 0.04} className={`card variant-card ${isActive ? 'active' : ''}`} data-testid="variant-card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="eyebrow">
                  חלופה {i + 1}
                  {isBase ? ' · ראשית' : ''}
                </div>
                {isActive && <span className="lbl measured">פעילה</span>}
              </div>
              <PlanThumb project={project} variant={v} onClick={() => activate(v)} label={`הפעלת חלופה ${i + 1}: ${v.name}`} />
              <input className="input" style={{ marginTop: 8, fontWeight: 600 }} value={v.name} onChange={(e) => patch(v.id, (x) => ({ ...x, name: e.target.value }))} onBlur={(e) => !e.target.value.trim() && renameVariant(project, v, '')} aria-label={`שם חלופה ${i + 1}`} />
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                {s.count} אלמנטים · {s.surfaces} משטחים · <b>{s.max ? `${fmtMoney(s.min)} עד ${fmtMoney(s.max)}` : 'אין מחירים'}</b>
              </div>
              {!isBase && diffCost !== null && (
                <div className="muted" style={{ fontSize: 13 }}>
                  {diffCost >= 0 ? 'יקרה ב' : 'זולה ב'}
                  {fmtMoney(Math.abs(diffCost))} מהראשית (אמצע הטווח)
                </div>
              )}
              <ul className="variant-why-list">
                {explainVariant(project, v)
                  .slice(0, 4)
                  .map((t) => (
                    <li key={t}>
                      <Rich text={t} />
                    </li>
                  ))}
              </ul>
              <div className="muted" style={{ fontSize: 12 }}>
                <b>שינוי אחרון:</b> {last ?? 'אין עדיין'}
              </div>
              <textarea className="input" style={{ marginTop: 8, minHeight: 50 }} placeholder="הערה על החלופה" value={v.note} onChange={(e) => patch(v.id, (x) => ({ ...x, note: e.target.value }))} aria-label="הערה" />
              <div className="row" style={{ marginTop: 10, gap: 6 }}>
                <IconBtn icon="plan" label="בתוכנית" onClick={() => activate(v, 'plan')} />
                <IconBtn icon="layers" label="במודל" onClick={() => activate(v, 'model')} />
                {!isBase && (
                  <IconBtn
                    icon="delete"
                    label="מחיקה"
                    className="danger"
                    onClick={() => {
                      if (!window.confirm(`למחוק את "${v.name}"?`)) return
                      updateProject(project.id, (p) => {
                        const variants = p.variants.filter((x) => x.id !== v.id)
                        return { ...p, variants, activeVariantId: p.activeVariantId === v.id ? variants[0].id : p.activeVariantId }
                      })
                    }}
                  />
                )}
              </div>
            </Rise>
          )
        })}
      </div>
    </div>
  )
}
