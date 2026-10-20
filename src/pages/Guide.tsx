import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { APPROACHES, RULES, STYLES } from '../data/gardenGuide'
import { MATERIALS } from '../lib/garden'
import { textureUrl } from '../lib/textures'
import { PageIntro } from '../components/PageIntro'
import { PromptBox } from '../components/CopyBox'

type Tab = 'styles' | 'approaches' | 'rules'
const TABS: { id: Tab; t: string }[] = [
  { id: 'styles', t: 'סגנונות גינה' },
  { id: 'approaches', t: 'גישות תכנון' },
  { id: 'rules', t: 'תובנות וכללי אצבע' },
]

export default function Guide() {
  const loc = useLocation()
  const [tab, setTab] = useState<Tab>(loc.hash.startsWith('#rules') ? 'rules' : loc.hash.startsWith('#approach') ? 'approaches' : 'styles')
  const [open, setOpen] = useState<string | null>(loc.hash.replace('#', '') || null)
  useEffect(() => {
    if (open) document.getElementById(open)?.scrollIntoView({ block: 'start' })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const rulesCount = RULES.reduce((a, g) => a + g.rules.length, 0)

  return (
    <div className="stack" style={{ gap: 18 }}>
      <h1 className="h-page">מדריך גינות</h1>
      <PageIntro
        art="guide"
        title="סגנון, גישה וכללי אצבע, לפני שמשרטטים"
        why={
          <>
            המדריך עוזר <b>לבחור כיוון עם הלקוח</b> ולהסביר אותו: לכל סגנון יש עקרונות, צמחים מתאימים לאקלים בישראל, חומרים, מתי לבחור בו ומתי לא, ו<b>פרומפט להמחשה</b> מוכן להדבקה. <b>כללי האצבע</b> נותנים מספרים לתכנון: רוחב שביל, גודל פינת אוכל, שיפועים ומרחקים. אותם סגנונות משמשים את <b>התכנון האוטומטי</b> בכל פרויקט.
          </>
        }
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
        <div className="guide-grid">
          {STYLES.map((s) => {
            const isOpen = open === s.id
            return (
              <article key={s.id} id={s.id} className={`card guide-card ${isOpen ? 'open' : ''}`}>
                <div className="style-sw big">
                  {[s.plan.hard, s.plan.soft, s.plan.beds, ...(s.plan.accent ? [s.plan.accent] : [])].map((m) => (
                    <i key={m} style={{ backgroundImage: `url(${textureUrl(m, undefined, 96)})` }} title={MATERIALS[m].text} />
                  ))}
                </div>
                <div className="eyebrow">{s.nameEn}</div>
                <h3 className="h-section" style={{ margin: '2px 0 4px' }}>
                  {s.name}
                </h3>
                <p style={{ margin: 0 }}>
                  <b>{s.tagline}</b>
                </p>
                <p className="muted" style={{ margin: '6px 0' }}>
                  {s.summary}
                </p>
                <div className="style-meta">
                  תחזוקה <b>{s.maintenance}</b> · מים <b>{s.water}</b> · תקציב <b>{s.budget}</b>
                </div>
                <button className="btn small" style={{ marginTop: 10 }} onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}>
                  {isOpen ? 'סגירה' : 'עקרונות, צמחים ופרומפט'}
                </button>
                {isOpen && (
                  <div className="stack" style={{ gap: 10, marginTop: 12 }}>
                    <div>
                      <b>עקרונות</b>
                      <ul className="tight">
                        {s.principles.map((p) => (
                          <li key={p}>{p}</li>
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
                      <b>מתי לבחור:</b> {s.fits}
                    </div>
                    <div className="notice">
                      <b>להיזהר:</b> {s.avoid}
                    </div>
                    <PromptBox prompt={s.prompt} title={`פרומפט להמחשה: ${s.name}`} />
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
        <div className="guide-grid">
          {APPROACHES.map((a) => {
            const isOpen = open === `approach-${a.id}`
            return (
              <article key={a.id} id={`approach-${a.id}`} className="card guide-card">
                <h3 className="h-section" style={{ margin: '0 0 4px' }}>
                  {a.name}
                </h3>
                <p className="muted" style={{ margin: 0 }}>
                  {a.summary}
                </p>
                <ul className="tight">
                  {a.how.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
                <button className="btn small" onClick={() => setOpen(isOpen ? null : `approach-${a.id}`)} aria-expanded={isOpen}>
                  {isOpen ? 'סגירה' : 'פרומפט להמחשה'}
                </button>
                {isOpen && (
                  <div style={{ marginTop: 10 }}>
                    <PromptBox prompt={a.prompt} title={`פרומפט: ${a.name}`} />
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {tab === 'rules' && (
        <div className="stack" style={{ gap: 14 }} id="rules">
          {RULES.map((g) => (
            <section key={g.id} className="card">
              <h3 className="h-section" style={{ margin: '0 0 8px' }}>
                {g.title}
              </h3>
              <div className="rules">
                {g.rules.map((r) => (
                  <div key={r.rule} className={`rule ${r.why.includes('מוסמך') ? 'pro' : ''}`}>
                    <div>
                      <b>{r.rule}</b>
                      {r.value && <span className="rule-val mono">{r.value}</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 14 }}>
                      {r.why}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <div className="muted" style={{ fontSize: 13 }}>
            כללי אצבע לתכנון ראשוני בלבד. רגולציה, קירות תומכים, חשמל, גז ולחץ מים: דורש בעל מקצוע מוסמך.
          </div>
        </div>
      )}
    </div>
  )
}
