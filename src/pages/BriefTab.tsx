// אתגרים והצעה תכנונית: מהנתונים שחולצו (מיקום, אקלים, היתר) לתיאור האתגרים, ואז הצעה: קודם למצב האובייקטיבי, אחר כך לדרישות הלקוח.
// בצד: תמונת מצב של תהליך העבודה.
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import { computeClimate3 } from '../lib/climateScores'
import { briefText, buildBrief } from '../lib/brief'
import { SITE_FIELDS, siteField } from '../lib/siteData'
import { fmtNum } from '../lib/bom'
import { updateProject } from '../lib/store'
import { STYLES } from '../data/gardenGuide'
import { addVariants, budgetLevel, fnsFromText, makeDesignVariant, rankStyles } from '../lib/variants'
import { PageIntro } from '../components/PageIntro'
import { ProcessSnapshot } from '../components/ProcessSnapshot'
import { IconBtn } from '../components/EditIcons'
import { Rich, Tag, toast } from '../components/ui'

const KEY_SITE = ['region', 'elevation', 'coastKm', 'augMax', 'janMin', 'frostDays', 'rainYear', 'waterDeficit', 'windWinter', 'windSummer', 'soilTypical'] as const

export default function BriefTab() {
  const { project, variant } = useProject()
  const nav = useNavigate()
  const climate = useMemo(() => {
    try {
      return computeClimate3(project, variant.elements)
    } catch {
      return null
    }
  }, [project.id, project.north, project.location?.lat, project.location?.lon, project.baseLevel, variant.elements]) // eslint-disable-line react-hooks/exhaustive-deps
  const brief = useMemo(() => buildBrief(project, variant, climate), [project, variant, climate])
  const text = useMemo(() => briefText(project, brief), [project, brief])
  const hi = brief.challenges.filter((c) => c.level === 'גבוה').length
  const req = variant.requirements
  const fns = fnsFromText(req.functions)
  const style = rankStyles(fns, budgetLevel(req.budget), `${req.plants} ${req.constraints}`)[0]

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast('התיאור וההצעה הועתקו')
    } catch {
      window.prompt('העתקה', text)
    }
  }
  const save = () => {
    updateProject(project.id, (p) => ({ ...p, brief: { at: new Date().toISOString(), text } }))
    toast('התיאור נשמר בפרויקט')
  }
  const makeProposal = () => {
    const st = STYLES.find((s) => s.id === style?.id)
    if (!st) return
    const r = makeDesignVariant(variant, st, fns, budgetLevel(req.budget))
    if (!r.variant) {
      toast('לא נוצרה הצעה. צריך אזור גינה בתוכנית (משטח דשא או ערוגה).')
      return
    }
    r.variant.note = `${r.variant.note} נשענת על תיאור האתגרים.`
    addVariants(project.id, [r.variant])
    toast(`נוצרה חלופה בסגנון ${st.name}`)
    nav(`/p/${project.id}/plan`)
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageIntro
        art="design"
        compact
        title="אתגרי הגינה והצעה תכנונית"
        why={<Rich text={brief.summary} />}
        points={[
          <>
            <b>הנתונים:</b> מהמיקום על המפה (אקלים, מים, רוח, קרקע) ומההיתר (צפון, מידות, העמדה, מפלסים).
          </>,
          <>
            <b>האתגרים:</b> כל אתגר עם חשיבות והנתון שעליו הוא נשען.
          </>,
          <>
            <b>ההצעה:</b> קודם מענה למצב האובייקטיבי, ואז לדרישות הלקוח ולמתחים ביניהם.
          </>,
          <>
            <b>בצד:</b> תמונת מצב של התהליך, מה קיים ומה חסר.
          </>,
        ]}
        insights={[
          { k: 'אתגרים', v: brief.challenges.length },
          { k: 'בחשיבות גבוהה', v: hi, tone: hi ? 'warn' : 'good' },
          { k: 'מתחים מול הלקוח', v: brief.conflicts.length, tone: brief.conflicts.length ? 'warn' : 'good' },
          { k: 'סגנון מתאים', v: brief.styleName ?? 'לא נקבע' },
        ]}
      />

      <div className="brief-layout">
        <div className="brief-main stack" style={{ gap: 18 }}>
          <section className="card" data-testid="brief-data">
            <h3 className="h-section" style={{ margin: '0 0 10px' }}>
              1. הנתונים
            </h3>
            <div className="brief-data">
              <div>
                <b className="site-group-t">מהאתר והאקלים</b>
                <dl className="facts">
                  {KEY_SITE.map((k) => {
                    const f = siteField(project, k)
                    const d = SITE_FIELDS.find((x) => x.k === k)!
                    if (!f) return null
                    return (
                      <div key={k}>
                        <dt>{d.t}</dt>
                        <dd>
                          <b>{typeof f.v === 'number' ? fmtNum(f.v, d.digits ?? 2) : f.v}</b> {d.unit} <Tag label={f.label} />
                        </dd>
                      </div>
                    )
                  })}
                </dl>
                {!project.site && <div className="notice">נתוני האתר עוד לא חולצו ונשמרו. <Link to={`/p/${project.id}`}>לפרטים ודרישות</Link></div>}
              </div>
              <div>
                <b className="site-group-t">מההיתר והתוכנית</b>
                <dl className="facts">
                  {brief.facts.map((f) => (
                    <div key={f.k} className={f.missing ? 'missing' : ''}>
                      <dt>{f.k}</dt>
                      <dd>
                        <b>{f.v}</b> {f.label && <Tag label={f.label} />}
                        {f.note && <span className="muted"> · {f.note}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </section>

          <section className="card" data-testid="brief-challenges">
            <h3 className="h-section" style={{ margin: '0 0 10px' }}>
              2. האתגרים שהגינה צריכה לעמוד בהם
            </h3>
            <ol className="challenges">
              {brief.challenges.map((c) => (
                <li key={c.id} className={`challenge lv-${c.level === 'גבוה' ? 'hi' : c.level === 'בינוני' ? 'mid' : 'lo'}`} data-testid="challenge">
                  <div className="ch-head">
                    <b>{c.title}</b>
                    <span className="ch-area">{c.area}</span>
                    <span className="ch-level">חשיבות {c.level}</span>
                  </div>
                  <p>
                    <Rich text={c.text} />
                  </p>
                  <span className="ch-ev">נשען על: {c.evidence}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="card" data-testid="brief-proposal">
            <h3 className="h-section" style={{ margin: '0 0 4px' }}>
              3. הצעה תכנונית
            </h3>
            <div className="proposal-cols">
              <div>
                <b className="prop-t">3.1 מענה למצב האובייקטיבי</b>
                <ol className="steps-list">
                  {brief.objective.map((o) => (
                    <li key={o.title}>
                      <b>{o.title}:</b> <Rich text={o.text} />
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <b className="prop-t">3.2 מענה לדרישות הלקוח</b>
                {brief.client.length ? (
                  <ol className="steps-list" data-testid="client-proposal">
                    {brief.client.map((o) => (
                      <li key={o.title}>
                        <b>{o.title}:</b> <Rich text={o.text} />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="notice">
                    עוד לא הוגדרו דרישות לקוח. <Link to={`/p/${project.id}`}>להגדרת הדרישות</Link>
                  </div>
                )}
                {brief.conflicts.length > 0 && (
                  <>
                    <b className="prop-t" style={{ marginTop: 10 }}>
                      מתחים בין הדרישות לאתר
                    </b>
                    <ol className="steps-list">
                      {brief.conflicts.map((o) => (
                        <li key={o.title}>
                          <b>{o.title}:</b> <Rich text={o.text} />
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              {style && <IconBtn icon="wand" className="primary" label={`יצירת חלופה בסגנון ${style.name}`} onClick={makeProposal} testId="brief-make-variant" />}
              <Link className="btn" to={`/p/${project.id}/design`}>
                לתכנון הגינה
              </Link>
              <Link className="btn ghost" to={`/p/${project.id}/model`}>
                לבדיקת האקלים במודל
              </Link>
            </div>
          </section>

          <section className="card" data-testid="brief-text">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3 className="h-section" style={{ margin: 0 }}>
                4. נוסח מוכן להעתקה
              </h3>
              <div className="row">
                <IconBtn icon="copy" label="העתקה" onClick={copy} testId="brief-copy" />
                <IconBtn icon="approve" label="שמירה בפרויקט" className="primary" onClick={save} testId="brief-save" />
              </div>
            </div>
            <div className="muted" style={{ fontSize: 13, margin: '4px 0 8px' }} data-testid="brief-saved">
              {project.brief ? `נשמר ${new Date(project.brief.at).toLocaleString('he-IL')}${project.brief.text !== text ? '. הנתונים השתנו מאז, אפשר לשמור מחדש.' : '.'}` : 'עוד לא נשמר בפרויקט.'}
            </div>
            <pre className="brief-pre">{text}</pre>
          </section>
        </div>
        <ProcessSnapshot project={project} variant={variant} />
      </div>
    </div>
  )
}
