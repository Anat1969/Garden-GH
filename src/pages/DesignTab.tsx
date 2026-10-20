import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import { STYLES, type StyleId } from '../data/gardenGuide'
import { FUNCTIONS, defaultZones, designGarden, type FunctionId } from '../lib/designer'
import { newVariant, uid, updateProject } from '../lib/store'
import { MATERIALS } from '../lib/garden'
import { textureUrl } from '../lib/textures'
import { surfacePoly } from '../lib/elementGeom'
import { polyArea } from '../lib/geom'
import { NO_BASIS, fmtNum, hasBasis } from '../lib/bom'
import { PageIntro } from '../components/PageIntro'
import { PromptBox } from '../components/CopyBox'
import { IconBtn } from '../components/EditIcons'
import { Empty, Tag, toast } from '../components/ui'
import { projectPrompt } from '../lib/prompts'
import type { Wall } from '../lib/types'

const BUDGETS = [
  { id: 'low' as const, t: 'חסכוני' },
  { id: 'mid' as const, t: 'בינוני' },
  { id: 'high' as const, t: 'גבוה' },
]

export default function DesignTab() {
  const { project, variant } = useProject()
  const nav = useNavigate()
  const zones = useMemo(() => defaultZones(variant.elements), [variant.elements])
  const [styleId, setStyleId] = useState<StyleId>((variant.requirements.style as StyleId) || 'mediterranean')
  const [fns, setFns] = useState<FunctionId[]>(() => {
    const t = variant.requirements.functions
    const pre = FUNCTIONS.filter((f) => t.includes(f.text.split(' ')[0])).map((f) => f.id)
    return pre.length ? pre : ['dining', 'shade']
  })
  const [budget, setBudget] = useState<'low' | 'mid' | 'high'>(variant.requirements.budget !== null && variant.requirements.budget < 40000 ? 'low' : variant.requirements.budget !== null && variant.requirements.budget > 120000 ? 'high' : 'mid')
  const [zoneIds, setZoneIds] = useState<string[]>(() => zones.slice(0, 3).map((z) => z.id))
  const [notes, setNotes] = useState<string[]>([])
  const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0]
  const isProposal = variant.name.startsWith('הצעה')

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

  const run = () => {
    const picked = zones.filter((z) => zoneIds.includes(z.id))
    if (!picked.length) {
      toast('בוחרים לפחות אזור גינה אחד')
      return
    }
    const walls = variant.elements.filter((e): e is Wall => e.kind === 'wall')
    let res: ReturnType<typeof designGarden>
    try {
      res = designGarden({ zones: picked, walls, style, functions: fns, budget, uid })
    } catch (e) {
      console.warn(e)
      toast('התכנון נכשל באחד האזורים. נסו לבחור אזורים אחרים.')
      return
    }
    setNotes(res.notes)
    if (!res.elements.length) {
      toast('לא נוצרה הצעה. בדקו את גודל האזורים')
      return
    }
    // הצעה נשמרת כחלופה חדשה: התכנון הידני נשאר כמו שהוא, ואפשר לעבור בין החלופות
    const base = newVariant(`הצעה: ${style.name}`, variant)
    base.elements = [...base.elements.filter((e) => !zoneIds.includes(e.id)), ...res.elements]
    base.requirements = { ...base.requirements, style: style.id, functions: FUNCTIONS.filter((f) => fns.includes(f.id)).map((f) => f.text).join(', ') }
    base.note = `נוצרה אוטומטית בסגנון ${style.name}. ${res.notes.join(' ')}`
    updateProject(project.id, (p) => ({ ...p, variants: [...p.variants, base], activeVariantId: base.id }))
    toast(`נוצרה חלופה "${base.name}" עם ${res.elements.length} אלמנטים`)
    nav('../plan')
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageIntro
        art="design"
        title="שתי דרכים לתכנן את הגינה"
        points={[
          <><b>תכנון ידני:</b> משרטטים בעצמך בספריית הגינה, משטח אחרי משטח.</>,
          <><b>תכנון לפי דרישות הלקוח:</b> בוחרים סגנון, פונקציות ותקציב, והאפליקציה משרטטת הצעה שלמה.</>,
          <>ההצעה נשמרת כ<b>חלופה חדשה</b>. כל אלמנט בה ניתן לעריכה, הזזה, החלפת חומר ומחיקה.</>,
        ]}
        insights={[
          { k: 'אזורי גינה לתכנון', v: zones.length, tone: zones.length ? 'good' : 'warn', note: zones.length ? `${fmtNum(zones.reduce((a, z) => a + Math.abs(polyArea(surfacePoly(z))), 0))} מ"ר` : 'צריך לשרטט אזור' },
          { k: 'חלופה פעילה', v: variant.name, note: isProposal ? 'הצעה אוטומטית' : 'תכנון ידני' },
        ]}
      />

      <div className="paths">
        <div className="card path-card">
          <div className="eyebrow">דרך 1</div>
          <div className="h-section">תכנון ידני</div>
          <p className="muted">
            כלים חופשיים: <b>משטחים</b> מלבניים, מצולעים ובציור, <b>פריטים</b> מהספרייה, <b>קווים</b> כמו שביל וגדר חיה, ו<b>שרטוט חופשי</b> לסקיצה. הצמדה, מידות על התוכנית וביטול פעולה.
          </p>
          <Link className="btn" to="../plan">
            לתוכנית ולספריית הגינה
          </Link>
        </div>
        <div className="card path-card on">
          <div className="eyebrow">דרך 2</div>
          <div className="h-section">תכנון לפי דרישות הלקוח</div>
          <p className="muted">
            בוחרים <b>סגנון</b>, <b>פונקציות</b> ו<b>תקציב</b>. נוצרת חלופה עם פטיו צמוד לבית, ערוגות היקפיות, משטח מרכזי, עצים, ריהוט, שביל ותאורה, לפי כללי האצבע במדריך.
          </p>
          <a className="btn primary" href="#auto">
            לתכנון האוטומטי
          </a>
        </div>
      </div>

      <section className="card" id="auto" data-testid="auto-design">
        <div className="h-section" style={{ marginBottom: 4 }}>
          1. סגנון
        </div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>
          כל סגנון קובע חומרים, צורה (ישרה או אורגנית), יחס דשא ופריטים טיפוסיים. הסבר מלא ופרומפט להמחשה ב<Link to="/guide">מדריך הגינות</Link>.
        </p>
        <div className="style-grid" role="radiogroup" aria-label="סגנון הגינה">
          {STYLES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={s.id === styleId} className={`style-card ${s.id === styleId ? 'on' : ''}`} onClick={() => setStyleId(s.id)}>
              <span className="style-sw">
                {[s.plan.hard, s.plan.soft, s.plan.beds].map((m) => (
                  <i key={m} style={{ backgroundImage: `url(${textureUrl(m, undefined, 64)})` }} title={MATERIALS[m].text} />
                ))}
              </span>
              <b>{s.name}</b>
              <span className="muted">{s.tagline}</span>
              <span className="style-meta">
                תחזוקה {s.maintenance} · מים {s.water} · תקציב {s.budget}
              </span>
            </button>
          ))}
        </div>

        <div className="h-section" style={{ margin: '18px 0 8px' }}>
          2. מה הלקוח צריך
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
        <div className="row" style={{ gap: 6, marginTop: 10 }} role="radiogroup" aria-label="רמת תקציב">
          <span className="muted">תקציב:</span>
          {BUDGETS.map((b) => (
            <button key={b.id} type="button" role="radio" aria-checked={budget === b.id} className={`chip ${budget === b.id ? 'on' : ''}`} onClick={() => setBudget(b.id)}>
              {b.t}
            </button>
          ))}
        </div>

        <div className="h-section" style={{ margin: '18px 0 8px' }}>
          3. איפה לתכנן
        </div>
        {zones.length === 0 ? (
          <div className="notice">
            אין עדיין אזור גינה. משרטטים בתוכנית משטח <b>דשא</b> או <b>ערוגה</b> בגבולות הגינה, והוא יופיע כאן.{' '}
            <Link to="../plan?tool=rect">לשרטוט אזור</Link>
          </div>
        ) : (
          <div className="zone-list">
            {zones.map((z) => {
              const on = zoneIds.includes(z.id)
              return (
                <label key={z.id} className={`zone-item ${on ? 'on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => setZoneIds(on ? zoneIds.filter((x) => x !== z.id) : [...zoneIds, z.id])} />
                  <i style={{ backgroundImage: `url(${textureUrl(z.material, z.color, 64)})` }} />
                  <span>
                    {MATERIALS[z.material].text} · {fmtNum(Math.abs(polyArea(surfacePoly(z))))} מ"ר · {fmtNum(z.w)}×{fmtNum(z.d)} מ'
                  </span>
                  <Tag label={z.label} />
                </label>
              )
            })}
          </div>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <IconBtn icon="wand" label="תכנון הצעה" className="primary" onClick={run} disabled={!zones.length} testId="run-design" />
          <span className="muted" style={{ fontSize: 13 }}>
            האזורים שנבחרו מוחלפים בתכנון, בחלופה חדשה. החלופה "{variant.name}" נשארת כמו שהיא.
          </span>
        </div>
        {notes.length > 0 && (
          <ul className="muted" style={{ fontSize: 13 }}>
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="h-section" style={{ marginBottom: 8 }}>
          המחשה ללקוח
        </div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>
          פרומפט שנבנה מהחלופה הפעילה: <b>החומרים והפריטים שבתוכנית</b>, הסגנון, והאור מדרום-מערב. מדביקים בכלי יצירת תמונות.
        </p>
        <PromptBox prompt={projectPrompt(variant, STYLES.find((s) => s.id === variant.requirements.style) ?? style)} title={`פרומפט לחלופה "${variant.name}"`} imageKey={`project:${project.id}:${variant.id}`} />
      </section>
    </div>
  )
}
