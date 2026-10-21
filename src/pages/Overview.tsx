import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import { updateProject, updateVariant } from '../lib/store'
import { CheckGroup, Field, NumField, Tag, toast } from '../components/ui'
import { PageIntro } from '../components/PageIntro'
import { IconBtn } from '../components/EditIcons'
import { NO_BASIS, fmtNum, hasBasis } from '../lib/bom'
import { FUNCTIONS, defaultZones } from '../lib/designer'
import { STYLES } from '../data/gardenGuide'
import { addVariants, budgetLevel, fnsFromText, makeBlankVariant, makeDesignVariant, rankStyles } from '../lib/variants'
import type { Project } from '../lib/types'

const PLANT_OPTS = ['חסכונית במים', 'ים-תיכונית', 'צמחי ארץ ישראל', 'פורחת וצבעונית', 'עצי פרי', 'ירקות ותבלינים', 'צל ועצים גדולים', 'ירוקה כל השנה', 'מושכת פרפרים ודבורים']
const MATERIAL_OPTS = ['אבן טבעית', 'אבן משתלבת', 'דק עץ', 'בטון', 'חצץ', 'חלוקי נחל', 'דשא', 'דשא סינתטי', 'אריחים']
const CONSTRAINT_OPTS = ['גישה צרה לחצר', 'עצים קיימים לשימור', 'שיפוע בשטח', 'שכנים קרובים', 'ילדים קטנים', 'כלב', 'צל כבד', 'רוחות חזקות', 'מגבלת מים']

type ExKey = keyof NonNullable<Project['extracted']>

export default function Overview() {
  const { project, variant } = useProject()
  const nav = useNavigate()
  const els = variant.elements
  const pending = els.filter((e) => !e.approved).length
  const surfaces = els.filter((e) => e.kind === 'surface').length
  const req = variant.requirements
  const ex = project.extracted ?? {}
  // עריכה ידנית של שדה שחולץ מסירה את הסימון "חולץ"
  const setP = (patch: Partial<Project>, field?: ExKey) =>
    updateProject(project.id, (p) => {
      const extracted = { ...p.extracted }
      if (field) delete extracted[field]
      return { ...p, ...patch, extracted }
    })
  const setR = (patch: Partial<typeof req>) => updateVariant(project.id, (v) => ({ ...v, requirements: { ...v.requirements, ...patch } }), 'req')

  const next = !project.address.trim()
    ? { to: '', t: 'הזנת כתובת הפרויקט' }
    : !project.permit
      ? { to: 'permit', t: 'העלאת היתר' }
      : !hasBasis(project)
        ? { to: 'dims', t: 'קביעת קנה מידה' }
        : pending
          ? { to: 'plan', t: `בדיקת ${pending} אלמנטים שלא אושרו` }
          : surfaces === 0
            ? { to: 'design', t: 'תכנון הגינה' }
            : { to: 'bom', t: 'כתב כמויות' }

  // חלופות תכנון בסוף הדרישות
  const fns = fnsFromText(req.functions)
  const budget = budgetLevel(req.budget)
  const ranked = rankStyles(fns, budget, `${req.plants} ${req.constraints}`)
  const [picked, setPicked] = useState<string[]>(() => ranked.slice(0, 3).map((s) => s.id))
  const zones = defaultZones(els)
  const createProposals = () => {
    const made = []
    for (const id of picked) {
      const st = STYLES.find((s) => s.id === id)
      if (!st) continue
      const r = makeDesignVariant(variant, st, fns, budget)
      if (r.variant) made.push(r.variant)
    }
    if (!made.length) {
      toast('לא נוצרו חלופות. צריך אזור גינה בתוכנית (משטח דשא או ערוגה).')
      return
    }
    addVariants(project.id, made)
    toast(`נוצרו ${made.length} חלופות. האחרונה פעילה, ואפשר לעבור ביניהן`)
  }
  const createBlank = () => {
    addVariants(project.id, [makeBlankVariant(project, variant)])
    toast('נוצרה חלופה ריקה לתכנון מאפס')
    nav('plan')
  }
  const openVariant = (id: string, to: string) => {
    updateProject(project.id, (p) => ({ ...p, activeVariantId: id }))
    nav(to)
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageIntro
        art="overview"
        title="פרטי הפרויקט, דרישות הלקוח וחלופות התכנון"
        points={[
          <>
            <b>פרטי הפרויקט:</b> כתובת היא שדה חובה. כל כתובת היא פרויקט אחד.
          </>,
          <>
            <b>נתונים מההיתר:</b> כיוון צפון, מפלסים ושטח המגרש מתמלאים לבד ומסומנים "חולץ".
          </>,
          <>
            <b>דרישות הלקוח:</b> מסמנים בתיבות, ומוסיפים טקסט חופשי רק כשצריך.
          </>,
          <>
            <b>חלופות:</b> בסוף הדרישות יוצרים הצעות תכנון לפי סגנון, או חלופה ריקה לתכנון מאפס.
          </>,
        ]}
        insights={[
          { k: 'הצעד הבא', v: next.t, tone: 'warn' },
          {
            k: 'קנה מידה',
            v:
              project.permit?.scale.source === 'dimensions'
                ? project.permit.sourceType === 'image'
                  ? 'מהמידות'
                  : `1:${project.permit.scale.den} מהמידות`
                : project.permit?.scale.den
                  ? `1:${project.permit.scale.den}`
                  : project.permit?.scale.source === 'calibrated'
                    ? 'כויל ידנית'
                    : project.permit?.scale.source === 'manual-only'
                      ? 'מידות ידניות'
                      : NO_BASIS,
            tone: hasBasis(project) ? 'good' : 'warn',
            label: project.permit?.scale.source === 'text' || project.permit?.scale.source === 'dimensions' ? 'measured' : project.permit?.scale.source === 'calibrated' ? 'estimated' : undefined,
          },
          { k: 'חלופות', v: project.variants.length },
          { k: 'ממתינים לאישור', v: pending, tone: pending ? 'warn' : 'good' },
        ]}
      >
        {next.to && (
          <div className="row" style={{ marginTop: 12 }}>
            <Link className="btn primary" to={next.to}>
              להמשך: {next.t}
            </Link>
          </div>
        )}
      </PageIntro>

      <section className="card">
        <h3 className="h-section" style={{ margin: '0 0 10px' }}>
          1. פרטי הפרויקט
        </h3>
        <div className="form-grid">
          <Field label="כתובת" required>
            <input className="input" value={project.address} onChange={(e) => setP({ address: e.target.value })} placeholder="רחוב, מספר, עיר" />
          </Field>
          <Field label="שם הפרויקט">
            <input className="input" value={project.name} onChange={(e) => setP({ name: e.target.value })} placeholder="למשל: גינת משפחת לוי" />
          </Field>
          <NumField label="כיוון צפון (מעלות, 0 = למעלה בתוכנית)" value={project.north} step={1} decimals={0} required={false} extracted={ex.north} onChange={(n) => setP({ north: n, northSet: true }, 'north')} />
          <NumField label='±0.00 במפלס מוחלט (מ")' value={project.baseLevel ?? 0} step={0.01} required={false} extracted={ex.baseLevel} onChange={(n) => setP({ baseLevel: n }, 'baseLevel')} />
          <NumField label='שטח המגרש (מ"ר)' value={project.plotArea ?? 0} step={1} required={false} extracted={ex.plotArea} onChange={(n) => setP({ plotArea: n }, 'plotArea')} />
          <Field label="סוג קרקע">
            <select className="input" value={project.soil} onChange={(e) => setP({ soil: e.target.value })}>
              <option value="">לא ידוע</option>
              <option value="חמרה">חמרה</option>
              <option value="חולית">חולית</option>
              <option value="חרסיתית">חרסיתית</option>
              <option value="סלעית">סלעית</option>
              <option value="מילוי">מילוי</option>
            </select>
          </Field>
          <Field label="מפלסים ידועים" extracted={ex.levelsNote} wide>
            <input className="input" value={project.levelsNote} onChange={(e) => setP({ levelsNote: e.target.value }, 'levelsNote')} placeholder="למשל: ±0.00 = 42.30, חצר אחורית 0.45-" />
          </Field>
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          נתוני גשם, ניקוז ומי תהום: לא זמינים בשלב זה.
          <br />
          ניקוז לבית: דורש מהנדס מוסמך.
        </div>
      </section>

      <section className="card">
        <h3 className="h-section" style={{ margin: '0 0 4px' }}>
          2. דרישות הלקוח
        </h3>
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          נשמרות בחלופה "{variant.name}". מסמנים מה שמתאים, ומוסיפים בכתב רק את מה שחסר.
        </div>
        <div className="form-grid">
          <Field label="מה הגינה צריכה לתת" wide>
            <CheckGroup label="פונקציות לגינה" options={FUNCTIONS.map((f) => f.text)} value={req.functions} onChange={(v) => setR({ functions: v })} />
          </Field>
          <Field label="צמחייה" wide>
            <CheckGroup label="צמחייה" options={PLANT_OPTS} value={req.plants} onChange={(v) => setR({ plants: v })} />
          </Field>
          <Field label="חומרים מועדפים" wide>
            <CheckGroup label="חומרים" options={MATERIAL_OPTS} value={req.materials} onChange={(v) => setR({ materials: v })} />
          </Field>
          <Field label="מגבלות" wide>
            <CheckGroup label="מגבלות" options={CONSTRAINT_OPTS} value={req.constraints} onChange={(v) => setR({ constraints: v })} />
          </Field>
          <Field label="תקציב לקוח (₪)" hint={<>הערכה של הלקוח <Tag label="assumed" /></>}>
            <input className="input num" type="number" inputMode="numeric" value={req.budget ?? ''} placeholder="למשל 80000" onChange={(e) => setR({ budget: e.target.value === '' ? null : Number(e.target.value) })} />
          </Field>
        </div>
      </section>

      <section className="card" data-testid="variant-options">
        <h3 className="h-section" style={{ margin: '0 0 4px' }}>
          3. חלופות תכנון
        </h3>
        {!hasBasis(project) ? (
          <div className="notice">
            {NO_BASIS}: קודם מעלים היתר וקובעים קנה מידה. <Link to="permit">להיתר</Link>
          </div>
        ) : (
          <>
            <ol className="steps-list">
              <li>
                <b>הצעות לפי הדרישות:</b> בוחרים סגנונות. כל סגנון הופך לחלופה מתוכננת, וכל אלמנט בה ניתן לעריכה.
              </li>
              <li>
                <b>תכנון מאפס:</b> חלופה עם הבית וגבול המגרש בלבד, לשרטוט ידני.
              </li>
            </ol>
            <div className="check-group" style={{ margin: '10px 0' }} role="group" aria-label="סגנונות להצעות">
              {ranked.map((s, i) => {
                const on = picked.includes(s.id)
                return (
                  <label key={s.id} className={`check ${on ? 'on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => setPicked(on ? picked.filter((x) => x !== s.id) : [...picked, s.id])} />
                    <span>
                      {s.name}
                      {i < 3 && <span className="muted"> · מתאים לדרישות</span>}
                    </span>
                  </label>
                )
              })}
            </div>
            {zones.length === 0 && <div className="notice">אין אזור גינה בתוכנית. משרטטים משטח דשא או ערוגה בגבולות הגינה, או מתחילים מאפס.</div>}
            <div className="row">
              <IconBtn icon="wand" label={`יצירת ${picked.length} הצעות לפי הדרישות`} className="primary" onClick={createProposals} disabled={!picked.length || !zones.length} testId="make-proposals" />
              <IconBtn icon="plan" label="חלופה ריקה: תכנון מאפס" onClick={createBlank} testId="make-blank" />
              <span className="muted" style={{ fontSize: 13 }}>
                {zones.length} אזורי גינה · {fmtNum(zones.reduce((a, z) => a + z.w * z.d, 0))} מ"ר במלבן החוסם
              </span>
            </div>
            <div className="variant-rows">
              {project.variants.map((v) => (
                <div key={v.id} className={`variant-row ${v.id === project.activeVariantId ? 'on' : ''}`}>
                  <b>{v.name}</b>
                  <span className="muted">{v.elements.length} אלמנטים</span>
                  {v.id === project.activeVariantId && <span className="lbl measured">פעילה</span>}
                  <span className="spacer" />
                  <IconBtn icon="edit" label="עריכה בתוכנית" onClick={() => openVariant(v.id, 'plan')} />
                  <IconBtn icon="layers" label="מודל" onClick={() => openVariant(v.id, 'model')} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
