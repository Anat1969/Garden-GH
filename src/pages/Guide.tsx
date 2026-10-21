import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { APPROACHES, RULES, STYLES } from '../data/gardenGuide'
import { MATERIALS } from '../lib/garden'
import { textureUrl } from '../lib/textures'
import { PageIntro } from '../components/PageIntro'
import { PromptBox, StoredImage } from '../components/CopyBox'
import { GLOSSARY } from '../data/glossary'
import { RuleScene } from '../components/RuleScene'
import { ApproachArt, Emph, MetaIcon } from '../components/GuideArt'
import { MATERIAL_TEXT } from '../lib/garden'

type Tab = 'styles' | 'approaches' | 'rules' | 'glossary'
const TABS: { id: Tab; t: string }[] = [
  { id: 'styles', t: 'סגנונות גינה' },
  { id: 'approaches', t: 'גישות תכנון' },
  { id: 'rules', t: 'תובנות וכללי אצבע' },
  { id: 'glossary', t: 'מילון מונחים' },
]

// סימון ההתאמה לחיפוש
function Hl({ text, q }: { text: string; q: string }) {
  const words = q.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return <>{text}</>
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  return (
    <>
      {text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}
    </>
  )
}

export default function Guide() {
  const loc = useLocation()
  const [tab, setTab] = useState<Tab>(loc.hash.startsWith('#rules') ? 'rules' : loc.hash.startsWith('#glossary') ? 'glossary' : loc.hash.startsWith('#approach') ? 'approaches' : 'styles')
  const [open, setOpen] = useState<string | null>(loc.hash.replace('#', '') || null)
  useEffect(() => {
    if (open) document.getElementById(open)?.scrollIntoView({ block: 'start' })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const rulesCount = RULES.reduce((a, g) => a + g.rules.length, 0)
  const [gq, setGq] = useState('')
  // חיפוש במילון: כל מילות החיפוש צריכות להופיע במונח או בהסבר
  const words = gq.trim().split(/\s+/).filter(Boolean)
  const gList = GLOSSARY.filter((g) => words.every((w) => g.term.includes(w) || g.meaning.includes(w)))
  const [activeGroup, setActiveGroup] = useState(RULES[0].id)
  const [activeRule, setActiveRule] = useState<number | null>(0)
  const pickGroup = (id: string) => {
    setActiveGroup(id)
    setActiveRule(0)
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <h1 className="h-page">מדריך גינות</h1>
      <PageIntro
        art="guide"
        title="סגנון, גישה וכללי אצבע, לפני שמשרטטים"
        points={[
          <><b>סגנונות:</b> עקרונות, צמחים לאקלים בישראל, חומרים, ופרומפט להמחשה.</>,
          <><b>כללי אצבע:</b> מספרים לתכנון, כמו רוחב שביל, גודל פינת אוכל ושיפועים.</>,
          <><b>מילון מונחים:</b> מה פירוש כל מילה באפליקציה.</>,
          <>אותם סגנונות משמשים את <b>התכנון האוטומטי</b> בכל פרויקט.</>,
        ]}
        insights={[
          { k: 'סגנונות', v: STYLES.length },
          { k: 'גישות', v: APPROACHES.length },
          { k: 'כללי אצבע', v: rulesCount },
        ]}
      />

      <div className="palette-groups" role="tablist" aria-label="חלקי המדריך">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`chip ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
            {t.t}
          </button>
        ))}
      </div>

      {tab === 'styles' && (
        <div className="guide-grid" style={{ ['--rows' as string]: 6 }}>
          {STYLES.map((s) => {
            const isOpen = open === s.id
            const extra = [...s.plants, ...s.materials, ...Object.values(MATERIAL_TEXT)]
            return (
              <article key={s.id} id={s.id} className={`card guide-card ${isOpen ? 'open' : ''}`}>
                <div className="gc-media">
                  {!isOpen && <StoredImage storeKey={`style:${s.id}`} alt={`המחשה: ${s.name}`} />}
                  <div className="style-sw big">
                    {[s.plan.hard, s.plan.soft, s.plan.beds, ...(s.plan.accent ? [s.plan.accent] : [])].map((m) => (
                      <i key={m} style={{ backgroundImage: `url(${textureUrl(m, undefined, 96)})` }} title={MATERIALS[m].text} />
                    ))}
                  </div>
                </div>
                <div className="gc-head">
                  <div className="eyebrow">{s.nameEn}</div>
                  <h3 className="h-section" style={{ margin: '2px 0 0' }}>
                    {s.name}
                  </h3>
                </div>
                <p className="gc-tag">
                  <b>{s.tagline}</b>
                </p>
                <p className="muted gc-text">
                  <Emph text={s.summary} extra={extra} />
                </p>
                <div className="style-meta">
                  <span>
                    <MetaIcon kind="maintenance" /> תחזוקה <b>{s.maintenance}</b>
                  </span>
                  <span>
                    <MetaIcon kind="water" /> מים <b>{s.water}</b>
                  </span>
                  <span>
                    <MetaIcon kind="budget" /> תקציב <b>{s.budget}</b>
                  </span>
                </div>
                <div className="gc-foot">
                  <button className="btn small" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}>
                    {isOpen ? 'סגירה' : 'עקרונות, צמחים ופרומפט'}
                  </button>
                </div>
                {isOpen && (
                  <div className="stack gc-open" style={{ gap: 10, marginTop: 12 }}>
                    <div>
                      <b>עקרונות</b>
                      <ul className="tight">
                        {s.principles.map((p) => (
                          <li key={p}>
                            <Emph text={p} extra={extra} />
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <b>צמחים מתאימים</b>
                      <div className="muted" style={{ fontSize: 14 }}>
                        {s.plants.join(' · ')}
                      </div>
                    </div>
                    <div>
                      <b>חומרים</b>
                      <div className="muted" style={{ fontSize: 14 }}>
                        {s.materials.join(' · ')}
                      </div>
                    </div>
                    <div className="notice info">
                      <b>מתי לבחור:</b> <Emph text={s.fits} extra={extra} />
                    </div>
                    <div className="notice">
                      <b>להיזהר:</b> <Emph text={s.avoid} extra={extra} />
                    </div>
                    <PromptBox prompt={s.prompt} title={`פרומפט להמחשה: ${s.name}`} imageKey={`style:${s.id}`} />
                    <div className="muted" style={{ fontSize: 13 }}>
                      לתכנון בסגנון הזה: פותחים פרויקט, לשונית <b>תכנון הגינה</b>, ובוחרים "{s.name}". <Link to="/projects">לפרויקטים</Link>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {tab === 'approaches' && (
        <div className="guide-grid" style={{ ['--rows' as string]: 5 }}>
          {APPROACHES.map((a) => {
            const isOpen = open === `approach-${a.id}`
            return (
              <article key={a.id} id={`approach-${a.id}`} className={`card guide-card ${isOpen ? 'open' : ''}`}>
                <div className="gc-media">
                  <StoredImage storeKey={`approach:${a.id}`} alt={`המחשה: ${a.name}`} />
                  <ApproachArt id={a.id} />
                </div>
                <h3 className="h-section gc-head" style={{ margin: 0 }}>
                  {a.name}
                </h3>
                <p className="muted gc-text">
                  <Emph text={a.summary} />
                </p>
                <ul className="tight">
                  {a.how.map((h) => (
                    <li key={h}>
                      <Emph text={h} />
                    </li>
                  ))}
                </ul>
                <div className="gc-foot">
                  <button className="btn small" onClick={() => setOpen(isOpen ? null : `approach-${a.id}`)} aria-expanded={isOpen}>
                    {isOpen ? 'סגירה' : 'פרומפט להמחשה'}
                  </button>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 10 }}>
                    <PromptBox prompt={a.prompt} title={`פרומפט: ${a.name}`} imageKey={`approach:${a.id}`} />
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {tab === 'glossary' && (
        <section className="card" id="glossary">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <h3 className="h-section" style={{ margin: 0 }}>
              מילון מונחים
            </h3>
            <input className="input" type="search" placeholder="חיפוש לפי מילת מפתח" value={gq} onChange={(e) => setGq(e.target.value)} aria-label="חיפוש במילון" style={{ maxWidth: 280 }} data-testid="glossary-search" />
          </div>
          {gList.length === 0 ? (
            <div className="muted">לא נמצא מונח עם "{gq}". אפשר לנסות מילה אחרת.</div>
          ) : (
            <dl className="glossary">
              {gList.map((g) => (
                <div key={g.term}>
                  <dt>
                    <Hl text={g.term} q={gq} />
                  </dt>
                  <dd>
                    <Hl text={g.meaning} q={gq} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {gq && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>נמצאו {gList.length} מונחים</div>}
        </section>
      )}

      {tab === 'rules' && (
        <div className="rules-layout" id="rules">
          <div className="stack" style={{ gap: 14 }}>
            {RULES.map((g) => (
              <section
                key={g.id}
                className={`card rule-group ${activeGroup === g.id ? 'on' : ''}`}
                onMouseEnter={() => activeGroup !== g.id && pickGroup(g.id)}
                data-group={g.id}
              >
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <h3 className="h-section" style={{ margin: 0 }}>
                    {g.title}
                  </h3>
                  <button type="button" className={`btn small ${activeGroup === g.id ? 'active' : ''}`} onClick={() => pickGroup(g.id)}>
                    המחשה בתלת-ממד
                  </button>
                </div>
                <div className="rules">
                  {g.rules.map((r, i) => (
                    <button
                      type="button"
                      key={r.rule}
                      className={`rule ${r.why.includes('מוסמך') ? 'pro' : ''} ${activeGroup === g.id && activeRule === i ? 'on' : ''}`}
                      onClick={() => {
                        setActiveGroup(g.id)
                        setActiveRule(i)
                      }}
                    >
                      <span className="rule-head">
                        <b>{r.rule}</b>
                        {r.value && <span className="rule-val">{r.value}</span>}
                      </span>
                      <span className="muted" style={{ fontSize: 14 }}>
                        <Emph text={r.why} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <div className="muted" style={{ fontSize: 13 }}>
              כללי אצבע לתכנון ראשוני בלבד. רגולציה, קירות תומכים, חשמל, גז ולחץ מים: דורש בעל מקצוע מוסמך.
            </div>
          </div>
          <aside className="rules-scene-side">
            <RuleScene groupId={activeGroup} highlight={activeRule} />
            <div className="muted" style={{ fontSize: 13 }}>
              לוחצים על כלל ברשימה כדי להדגיש את <b>הפרמטר והערך</b> שלו בהמחשה.
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
