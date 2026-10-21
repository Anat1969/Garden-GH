import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import { STYLES, type StyleId } from '../data/gardenGuide'
import { FUNCTIONS, designGarden, type FunctionId } from '../lib/designer'
import { newVariant, uid, updateProject, updateVariant } from '../lib/store'
import { MATERIALS } from '../lib/garden'
import { textureUrl } from '../lib/textures'
import { surfacePoly } from '../lib/elementGeom'
import { polyArea } from '../lib/geom'
import { NO_BASIS, fmtNum, hasBasis } from '../lib/bom'
import { PageIntro } from '../components/PageIntro'
import { PromptBox } from '../components/CopyBox'
import { IconBtn } from '../components/EditIcons'
import { Empty, toast } from '../components/ui'
import { ZonePicker, pickable } from '../components/ZonePicker'
import { projectPrompt } from '../lib/prompts'
import { resetElements } from '../lib/reset'
import type { Element, Surface, Wall } from '../lib/types'

const BUDGETS = [
  { id: 'low' as const, t: 'חסכוני' },
  { id: 'mid' as const, t: 'בינוני' },
  { id: 'high' as const, t: 'גבוה' },
]

type Mode = 'auto' | 'manual'

export default function DesignTab() {
  const { project, variant } = useProject()
  const nav = useNavigate()
  const zones = useMemo(() => pickable(variant.elements), [variant.elements])
  const [mode, setMode] = useState<Mode>('auto')
  const [styleId, setStyleId] = useState<StyleId | null>((variant.requirements.style as StyleId) || null)
  const [fns, setFns] = useState<FunctionId[]>(() => {
    const t = variant.requirements.functions
    const pre = FUNCTIONS.filter((f) => t.includes(f.text.split(' ')[0])).map((f) => f.id)
    return pre.length ? pre : ['dining', 'shade']
  })
  const [budget, setBudget] = useState<'low' | 'mid' | 'high'>(variant.requirements.budget !== null && variant.requirements.budget < 40000 ? 'low' : variant.requirements.budget !== null && variant.requirements.budget > 120000 ? 'high' : 'mid')
  const [picked, setPicked] = useState<string[]>([])
  const style = STYLES.find((s) => s.id === styleId) ?? null
  const pickedZones = zones.filter((z) => picked.includes(z.id))
  const pickedArea = pickedZones.reduce((a, z) => a + Math.abs(polyArea(surfacePoly(z))), 0)

  // תצוגה מקדימה: לחיצה על סגנון מתכננת מיד את המשטחים שנבחרו, לפני שמירה
  const preview = useMemo(() => {
    if (mode !== 'auto' || !style || !pickedZones.length) return null
    try {
      const walls = variant.elements.filter((e): e is Wall => e.kind === 'wall')
      return designGarden({ zones: pickedZones as Surface[], walls, style, functions: fns, budget, uid })
    } catch (e) {
      console.warn(e)
      return { elements: [] as Element[], notes: ['התכנון נכשל באחד המשטחים. נסו משטח אחר.'] }
    }
  }, [mode, style, picked.join(','), fns.join(','), budget, variant.elements]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!hasBasis(project)) {
    return (
      <div className="card">
        <Empty title={NO_BASIS}>
          <div>התכנון נשען על מידות: קודם קובעים קנה מידה מההיתר, או עובדים במידות ידניות.</div>
          <Link className="btn primary" to="../permit">
            להיתר
          </Link>
        </Empty>
      </div>
    )
  }

  const toggle = (id: string) => setPicked(mode === 'manual' ? (picked.includes(id) ? [] : [id]) : picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  const save = (to: 'plan' | 'model') => {
    if (!style || !preview || !preview.elements.length) {
      toast(!pickedZones.length ? 'קודם לוחצים על משטח בתוכנית' : 'בוחרים סגנון')
      return
    }
    const v = newVariant(`הצעה: ${style.name}`, variant)
    v.elements = [...v.elements.filter((e) => !picked.includes(e.id)), ...preview.elements]
    v.requirements = { ...v.requirements, style: style.id, functions: FUNCTIONS.filter((f) => fns.includes(f.id)).map((f) => f.text).join(', ') }
    v.note = `נוצרה אוטומטית בסגנון ${style.name} על ${pickedZones.length} משטחים (${fmtNum(pickedArea)} מ"ר). ${preview.notes.join(' ')}`
    v.lastChange = { at: new Date().toISOString(), text: `תכנון בסגנון ${style.name} על ${fmtNum(pickedArea)} מ"ר` }
    updateProject(project.id, (p) => ({ ...p, variants: [...p.variants, v], activeVariantId: v.id }))
    toast(`נוצרה חלופה ${project.variants.length + 1}: "${v.name}". כל אלמנט ניתן לעריכה`)
    nav(`../${to}`)
  }

  const reset = (m: 'permit' | 'empty') => {
    const msg = m === 'permit' ? 'להחזיר את הגינה בחלופה הזו למצב שנקרא מההיתר? הבית, הפתחים, הגבולות והמדרגות נשארים.' : 'לרוקן את הגינה בחלופה הזו? הבית, הפתחים, הגבולות והמדרגות נשארים.'
    if (!window.confirm(msg)) return
    updateVariant(project.id, (v) => ({ ...v, elements: resetElements(project, v, m) }))
    setPicked([])
    toast('התכנון אופס. אפשר לבטל ב-Ctrl+Z בתוכנית')
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageIntro
        art="design"
        title="תכנון על המשטח שבוחרים"
        points={[
          <><b>לוחצים על משטח</b> בתוכנית כדי לבחור איפה מתכננים.</>,
          <><b>ידני:</b> המשטח נפתח בתוכנית לעריכה. <b>אוטומטי:</b> לחיצה על סגנון מציגה מיד הצעה על המשטח.</>,
          <>הצעה נשמרת כ<b>חלופה חדשה</b>, וכל אלמנט בה ניתן לעריכה בתוכנית ובמודל.</>,
          <><b>איפוס</b> מחזיר את הגינה למצב ההיתר או לגינה ריקה, כדי לתכנן מחדש.</>,
        ]}
        insights={[
          { k: 'משטחים לבחירה', v: zones.length, tone: zones.length ? 'good' : 'warn', note: zones.length ? `${fmtNum(zones.reduce((a, z) => a + Math.abs(polyArea(surfacePoly(z))), 0))} מ"ר` : 'צריך לשרטט משטח' },
          { k: 'נבחרו', v: picked.length, note: picked.length ? `${fmtNum(pickedArea)} מ"ר` : 'לוחצים על התוכנית' },
        ]}
      />

      <div className="paths" role="radiogroup" aria-label="דרך התכנון">
        {(
          [
            { id: 'manual', t: 'תכנון ידני', d: 'בוחרים משטח, והוא נפתח בתוכנית עם ספריית הגינה: חומרים, פריטים, קווים ושרטוט חופשי.' },
            { id: 'auto', t: 'תכנון אוטומטי לפי דרישות', d: 'בוחרים משטחים וסגנון. ההצעה מוצגת מיד על התוכנית, ונשמרת כחלופה שאפשר לערוך.' },
          ] as const
        ).map((x, i) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={mode === x.id}
            className={`card path-card ${mode === x.id ? 'on' : ''}`}
            onClick={() => {
              setMode(x.id)
              setPicked(x.id === 'manual' ? picked.slice(0, 1) : picked)
            }}
          >
            <span className="eyebrow">דרך {i + 1}</span>
            <span className="h-section">{x.t}</span>
            <span className="muted">{x.d}</span>
          </button>
        ))}
      </div>

      <section className="card design-board" data-testid="auto-design">
        <div className="design-pick">
          <div className="h-section" style={{ marginBottom: 6 }}>
            1. דוקרים את המשטח לתכנון
          </div>
          <ZonePicker project={project} variant={variant} picked={picked} onToggle={toggle} preview={mode === 'auto' ? (preview?.elements ?? null) : null} multi={mode === 'auto'} />
          {zones.length === 0 && (
            <div className="notice" style={{ marginTop: 8 }}>
              אין משטח לתכנון. משרטטים משטח בתוכנית, או מאפסים למצב ההיתר.{' '}
              <Link to="../plan?tool=rect">לשרטוט משטח</Link>
            </div>
          )}
        </div>

        <div className="design-controls">
          {mode === 'manual' ? (
            <>
              <div className="h-section">2. עריכה ידנית</div>
              <p className="muted" style={{ fontSize: 14 }}>
                המשטח שנבחר נפתח בתוכנית כשהוא <b>מסומן וממוקד</b>. משנים חומר מהספרייה, מוסיפים פריטים וקווים, ועורכים קודקודים.
              </p>
              <IconBtn icon="plan" label="פתיחת המשטח בתוכנית" className="primary" disabled={!picked.length} onClick={() => nav(`../plan?el=${picked[0]}`)} testId="manual-open" />
            </>
          ) : (
            <>
              <div className="h-section">2. סגנון: לחיצה מציגה הצעה</div>
              <div className="style-grid compact" role="radiogroup" aria-label="סגנון הגינה">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={s.id === styleId}
                    className={`style-card ${s.id === styleId ? 'on' : ''}`}
                    onClick={() => {
                      setStyleId(s.id)
                      if (!picked.length) {
                        // בלי משטח נבחר: המשטח הגדול ביותר נבחר אוטומטית, ומוצג כבחירה שאפשר לשנות
                        if (zones[0]) {
                          setPicked([zones[0].id])
                          toast('נבחר המשטח הגדול ביותר. אפשר לבחור אחר בלחיצה על התוכנית')
                        } else toast('קודם משרטטים משטח בתוכנית')
                      }
                    }}
                  >
                    <span className="style-sw">
                      {[s.plan.hard, s.plan.soft, s.plan.beds].map((m) => (
                        <i key={m} style={{ backgroundImage: `url(${textureUrl(m, undefined, 64)})` }} title={MATERIALS[m].text} />
                      ))}
                    </span>
                    <b>{s.name}</b>
                    <span className="muted">{s.tagline}</span>
                  </button>
                ))}
              </div>
              <div className="h-section" style={{ margin: '14px 0 6px' }}>
                3. דרישות הלקוח
              </div>
              <div className="row" style={{ gap: 6 }} role="group" aria-label="פונקציות">
                {FUNCTIONS.map((f) => {
                  const on = fns.includes(f.id)
                  return (
                    <button key={f.id} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setFns(on ? fns.filter((x) => x !== f.id) : [...fns, f.id])}>
                      {f.text}
                    </button>
                  )
                })}
              </div>
              <div className="row" style={{ gap: 6, marginTop: 8 }} role="radiogroup" aria-label="רמת תקציב">
                <span className="muted">תקציב:</span>
                {BUDGETS.map((b) => (
                  <button key={b.id} type="button" role="radio" aria-checked={budget === b.id} className={`chip ${budget === b.id ? 'on' : ''}`} onClick={() => setBudget(b.id)}>
                    {b.t}
                  </button>
                ))}
              </div>
              <div className="preview-box" data-testid="design-preview" aria-live="polite">
                {preview && preview.elements.length ? (
                  <>
                    <b>
                      הצעה בסגנון {style?.name}: {preview.elements.length} אלמנטים על {fmtNum(pickedArea)} מ"ר
                    </b>
                    <span className="muted">מוצגת על התוכנית. עוד לא נשמרה.</span>
                  </>
                ) : (
                  <span className="muted">{!picked.length ? 'לוחצים על משטח בתוכנית.' : !style ? 'לוחצים על סגנון כדי לראות הצעה.' : 'לא נוצרה הצעה למשטח הזה. נסו משטח גדול יותר.'}</span>
                )}
              </div>
              <div className="row" style={{ gap: 6, marginTop: 10 }}>
                <IconBtn icon="plan" label="שמירה כחלופה ועריכה בתוכנית" className="primary" onClick={() => save('plan')} disabled={!preview?.elements.length} testId="run-design" />
                <IconBtn icon="layers" label="שמירה וצפייה במודל" onClick={() => save('model')} disabled={!preview?.elements.length} />
              </div>
              {preview && preview.notes.length > 0 && (
                <ul className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                  {preview.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>

      <section className="card" data-testid="reset-design">
        <div className="h-section" style={{ marginBottom: 4 }}>
          איפוס התכנון
        </div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>
          מאפס את הגינה ב<b>חלופה הפעילה</b> כדי לתכנן מחדש. <b>הבית, הפתחים, גבול המגרש, קירות התמך והמדרגות</b> נשארים. אפשר לבטל ב-Ctrl+Z.
        </p>
        <div className="row" style={{ gap: 6 }}>
          <IconBtn icon="undo" label="חזרה למצב ההיתר" onClick={() => reset('permit')} disabled={!project.permit?.structure} testId="reset-permit" />
          <IconBtn icon="delete" label="גינה ריקה" onClick={() => reset('empty')} testId="reset-empty" />
        </div>
      </section>

      <section className="card">
        <div className="h-section" style={{ marginBottom: 8 }}>
          המחשה ללקוח
        </div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>
          פרומפט שנבנה מהחלופה הפעילה: <b>החומרים והפריטים שבתוכנית</b>, הסגנון, והאור מדרום-מערב. מדביקים בכלי יצירת תמונות.
        </p>
        <PromptBox prompt={projectPrompt(variant, STYLES.find((s) => s.id === variant.requirements.style) ?? style ?? STYLES[0])} title={`פרומפט לחלופה "${variant.name}"`} imageKey={`project:${project.id}:${variant.id}`} />
      </section>
    </div>
  )
}
