import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import { useApp } from '../lib/store'
import { CATEGORY_TEXT, DISCLAIMER, NO_BASIS, PHASES, computeBom, fmtMoney, hasBasis, sumRange } from '../lib/bom'
import { Empty, Rise, Tag } from '../components/ui'
import { PageIntro } from '../components/PageIntro'
import { lineLabel } from './BomTab'
import { printPage } from '../lib/printing'
import { PrintVisuals } from '../components/PrintVisuals'
import { IconBtn } from '../components/EditIcons'

export default function PhasesTab() {
  const { project, variant } = useProject()
  const prices = useApp((s) => s.prices)
  const lines = useMemo(() => computeBom(variant, prices), [variant, prices])

  if (!hasBasis(project)) {
    return (
      <div className="card">
        <Empty title={NO_BASIS}>
          <Link className="btn primary" to="../permit">
            קביעת קנה מידה
          </Link>
        </Empty>
      </div>
    )
  }

  const phases = PHASES.map((ph) => {
    const pl = lines.filter((l) => ph.categories.includes(l.category))
    return { ...ph, lines: pl, sum: sumRange(pl) }
  }).filter((p) => p.lines.length)
  const total = sumRange(lines)
  const maxAll = Math.max(1, ...phases.map((p) => p.sum.max))

  const biggest = [...phases].sort((a, b) => b.sum.max - a.sum.max)[0]
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageIntro
        art="phases"
        title="סדר ביצוע ותקציב לכל שלב"
        points={[
          <>מה ש<b>קשה להחזיר לאחור</b> נעשה ראשון: עפר, קירות, תשתיות.</>,
          <><b>שתילה וריהוט</b> בסוף.</>,
          <>לכל שלב יש טווח עלות, לתכנון <b>תזרים ותיאום קבלנים</b>.</>,
        ]}
        insights={[
          { k: 'תקציב כולל', v: total.max ? `${fmtMoney(total.min)} עד ${fmtMoney(total.max)}` : 'אין מחירים', label: total.max ? 'assumed' : undefined },
          { k: 'שלבים', v: phases.length },
          { k: 'השלב היקר', v: biggest ? biggest.name : 'אין', note: biggest && total.max ? `${Math.round((biggest.sum.max / total.max) * 100)}% מהתקציב` : undefined },
        ]}
      />
      <div className="disclaimer">{DISCLAIMER}</div>
      {phases.length === 0 ? (
        <div className="card">
          <Empty title="אין שלבים עדיין">
            <div>השלבים נגזרים מאלמנטי הגינה: משטחים, גדרות וקירות גינה.</div>
            <Link className="btn primary" to="../plan?tool=surface">
              שרטוט משטח
            </Link>
          </Empty>
        </div>
      ) : (
        <>
          <div className="card flat stat">
            <span className="k">תקציב כולל · חלופה "{variant.name}"</span>
            <span className="v">{total.max ? `${fmtMoney(total.min)} עד ${fmtMoney(total.max)}` : 'אין מחירים'}</span>
            {!prices.length && <span className="muted">מחירון לא נטען</span>}
          </div>
          {phases.map((p, i) => (
            <Rise key={p.order} delay={i * 0.05} className="card phase">
              <div className="n">{String(p.order).padStart(2, '0')}</div>
              <div className="stack" style={{ gap: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="h-section">{p.name}</div>
                  <span className={`lbl ${p.reversible ? 'measured' : 'estimated'}`}>{p.reversible ? 'ניתן לשינוי בהמשך' : 'קשה להחזיר לאחור'}</span>
                </div>
                <div className="muted" style={{ fontSize: 14 }}>
                  {[...new Set(p.lines.map((l) => CATEGORY_TEXT[l.category]))].join(' · ')} · {p.lines.length} שורות
                </div>
                {p.sum.max > 0 ? (
                  <>
                    <div className="numwrap">
                      <span className="num">
                        {fmtMoney(p.sum.min)} עד {fmtMoney(p.sum.max)}
                      </span>
                      <Tag label={p.lines.some((l) => lineLabel(l) === 'assumed') ? 'assumed' : 'estimated'} />
                    </div>
                    <div className="bar-track" aria-hidden="true">
                      <div className="bar-fill" style={{ insetInlineStart: `${(p.sum.min / maxAll) * 100}%`, width: `${((p.sum.max - p.sum.min) / maxAll) * 100}%`, opacity: 0.45 }} />
                      <div className="bar-fill" style={{ insetInlineStart: 0, width: `${(p.sum.min / maxAll) * 100}%` }} />
                    </div>
                  </>
                ) : (
                  <span className="muted">אין מחירים לשלב</span>
                )}
                {p.lines.some((l) => l.qtyLabel !== 'measured') && <div className="muted" style={{ fontSize: 13 }}>חלק מהכמויות לא מדודות. הטווח רחב בהתאם.</div>}
                {p.note && <div className="notice pro">{p.note}</div>}
              </div>
            </Rise>
          ))}
        </>
      )}
      <div className="row no-print">
        <IconBtn icon="print" label="הדפסה" onClick={printPage} />
      </div>
      <PrintVisuals project={project} />
    </div>
  )
}
