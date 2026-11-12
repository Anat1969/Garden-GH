import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import { useApp, updateVariant } from '../lib/store'
import { CATEGORY_TEXT, DISCLAIMER, NO_BASIS, PHASES, VAT, computeBom, hasBasis, sumRange, fmtMoney, fmtNum, type BomLine } from '../lib/bom'
import { upsertElement } from '../lib/store'
import { exportBomCsv } from '../lib/bomCsv'
import { printPage } from '../lib/printing'
import { PrintVisuals } from '../components/PrintVisuals'
import { BomPrintTable } from '../components/BomPrintTable'
import type { Element } from '../lib/types'
import { LABEL_TEXT } from '../lib/types'
import { PageIntro, type Insight } from '../components/PageIntro'
import { DataTable } from '../components/DataTable'
import { IconBtn } from '../components/EditIcons'
import type { Label, PriceItem } from '../lib/types'
import { UNIT_TEXT } from '../lib/types'
import { Empty, Num, Tag } from '../components/ui'

const phaseOf = (l: BomLine) => PHASES.find((p) => p.categories.includes(l.category))?.name ?? 'אחר'
const rangeSum = (rs: BomLine[]) => {
  const r = sumRange(rs)
  return r.max > 0 ? <span className="num">{fmtMoney(r.min)} עד {fmtMoney(r.max)}</span> : null
}

export const priceLabel = (i: PriceItem): Label => (i.verified ? 'estimated' : 'assumed')
const RANK: Record<Label, number> = { measured: 0, estimated: 1, assumed: 2 }
export const weakest = (a: Label, b: Label): Label => (RANK[a] >= RANK[b] ? a : b)

export function lineLabel(l: BomLine): Label {
  return l.item ? weakest(l.qtyLabel, priceLabel(l.item)) : l.qtyLabel
}

export default function BomTab() {
  const { project, variant } = useProject()
  const prices = useApp((s) => s.prices)
  const lines = useMemo(() => computeBom(variant, prices), [variant, prices])
  const sum = sumRange(lines)
  const budget = variant.requirements.budget

  if (!hasBasis(project)) {
    return (
      <div className="card">
        <Empty title={NO_BASIS}>
          <div>קנה המידה לא נקבע, לכן לא מחושבות כמויות.</div>
          <Link className="btn primary" to="../permit">
            קביעת קנה מידה
          </Link>
        </Empty>
        <div className="disclaimer">{DISCLAIMER}</div>
      </div>
    )
  }

  const assign = (key: string, code: string) =>
    updateVariant(project.id, (v) => {
      const a = { ...v.assignments }
      if (code) a[key] = code
      else delete a[key]
      return { ...v, assignments: a }
    })

  const toggleExisting = (id: string, on: boolean) => {
    const el = variant.elements.find((e) => e.id === id)
    if (el) upsertElement(project.id, { ...el, existing: on } as Element)
  }

  const houseCount = variant.elements.filter((e) => e.kind === 'wall' && e.scope === 'house').length

  // תובנות לראש העמוד: טווח כולל, מה מייקר, ועד כמה הכמויות מדודות
  const byCat = new Map<string, number>()
  for (const l of lines) if (l.max) byCat.set(CATEGORY_TEXT[l.category], (byCat.get(CATEGORY_TEXT[l.category]) ?? 0) + l.max)
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const measured = lines.filter((l) => l.qtyLabel === 'measured').length
  const insights: Insight[] = [
    { k: 'טווח עלות כולל', v: sum.max ? `${fmtMoney(sum.min)} עד ${fmtMoney(sum.max)}` : 'אין מחירים', label: sum.max ? (lines.some((l) => l.item && lineLabel(l) === 'assumed') ? 'assumed' : 'estimated') : undefined },
    { k: 'מה הכי מייקר', v: top.length ? top[0][0] : 'אין', note: top.length ? top.map(([c, v]) => `${c} עד ${fmtMoney(v)}${sum.max ? ` (${Math.round((v / sum.max) * 100)}%)` : ''}`).join(' · ') : undefined },
    { k: 'כמויות מדודות מהיתר', v: `${measured} מתוך ${lines.length}`, tone: lines.length && measured / lines.length >= 0.6 ? 'good' : 'warn', note: 'השאר מוערך או הונח' },
  ]
  if (sum.max) insights.push({ k: 'כולל מע"מ 18%', v: `${fmtMoney(sum.min * (1 + VAT))} עד ${fmtMoney(sum.max * (1 + VAT))}`, note: 'המחירון והטבלה ללא מע"מ' })
  const existingCount = new Set(lines.filter((l) => l.existing).map((l) => l.elementId)).size
  if (existingCount) insights.push({ k: 'קיים, לא מתומחר', v: existingCount, note: 'למשל גדר גבול המגרש. אפשר לשנות בטבלה' })
  if (sum.missing) insights.push({ k: 'שורות בלי מחיר', v: sum.missing, tone: 'warn' })
  if (budget !== null && sum.max)
    insights.push({ k: 'מול תקציב הלקוח', v: fmtMoney(budget), tone: sum.max <= budget ? 'good' : sum.min > budget ? 'bad' : 'warn', note: sum.max <= budget ? 'גם הטווח העליון בתוך התקציב' : sum.min > budget ? 'גם הטווח התחתון חורג' : 'סיכון לחריגה' })

  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageIntro
        art="bom"
        title="כמה זה יעלה, ומה מייקר"
        points={[
          <>כל <b>אלמנט בתוכנית</b> הופך לשורת עבודה: כמות, סעיף מחירון וטווח עלות.</>,
          <>מתחילים מה<b>תובנות</b> למטה, ובודקים שורות שמסומנות "הונח" או "מוערך".</>,
          <>אפשר <b>לקבץ</b> לפי סעיף או שלב, <b>למיין</b> בכל עמודה, ולסמן שורות לסיכום.</>,
        ]}
        legend
        insights={insights}
      />
      <div className="disclaimer">{DISCLAIMER}</div>
      {prices.length === 0 && (
        <div className="notice">
          מחירון לא נטען. הכמויות מחושבות, אבל אין מחירים.{' '}
          <Link to="/prices" style={{ fontWeight: 600 }}>
            טעינת מחירון
          </Link>
        </div>
      )}

      {lines.length === 0 ? (
        <div className="card">
          <Empty title="אין שורות בכתב הכמויות">
            <div>כתב הכמויות נבנה ממשטחים, גדרות וקירות גינה. {houseCount ? `${houseCount} קירות הבית משמשים כרקע ולא מתומחרים.` : ''}</div>
            <Link className="btn primary" to="../plan?tool=surface">
              שרטוט משטח גינה
            </Link>
          </Empty>
        </div>
      ) : (
        <>
        <BomPrintTable lines={lines} />
        <div className="no-print">
        <DataTable<BomLine>
          testId="bom-table"
          caption="כתב כמויות"
          rows={lines}
          rowKey={(l) => l.key}
          defaultGroup="category"
          groups={[
            { key: 'category', label: 'סעיף', value: (l) => CATEGORY_TEXT[l.category] },
            { key: 'phase', label: 'שלב ביצוע', value: phaseOf },
            { key: 'label', label: 'תווית כמות', value: (l) => LABEL_TEXT[l.qtyLabel] },
            { key: 'element', label: 'אלמנט', value: (l) => l.elementName },
            { key: 'state', label: 'חדש או קיים', value: (l) => (l.existing ? 'קיים, לא מתומחר' : 'עבודה חדשה') },
          ]}
          cols={[
            {
              key: 'el',
              label: 'אלמנט',
              sort: (l) => l.elementName,
              render: (l) => (
                <>
                  {l.elementName}
                  {l.warning && <div className="lbl assumed" style={{ display: 'block', marginTop: 4, whiteSpace: 'normal' }}>{l.warning}</div>}
                  <label className="existing-toggle no-print">
                    <input type="checkbox" checked={l.existing} onChange={(e) => toggleExisting(l.elementId, e.target.checked)} /> קיים בשטח
                  </label>
                </>
              ),
            },
            { key: 'cat', label: 'סעיף', sort: (l) => CATEGORY_TEXT[l.category], render: (l) => CATEGORY_TEXT[l.category] },
            { key: 'qty', label: 'כמות', sort: (l) => l.qty, render: (l) => <Num value={l.qty} unit={UNIT_TEXT[l.unit]} label={l.qtyLabel} digits={l.unit === 'unit' ? 0 : 2} /> },
            {
              key: 'item',
              label: 'סעיף מחירון',
              sort: (l) => l.item?.code ?? null,
              minWidth: 180,
              render: (l) => {
                const options = prices.filter((p) => p.category === l.category || p.unit === l.unit)
                return (
                  <>
                    {prices.length ? (
                      <select className="input" value={variant.assignments[l.key] ?? l.item?.code ?? ''} onChange={(e) => assign(l.key, e.target.value)} aria-label={`סעיף מחירון ל${l.elementName}`}>
                        <option value="">ללא</option>
                        {options.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.code} · {p.description}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="muted">מחירון לא נטען</span>
                    )}
                    {l.unitMismatch && <div className="lbl estimated" style={{ marginTop: 4 }}>יחידת הסעיף לא תואמת</div>}
                  </>
                )
              },
            },
            {
              key: 'calc',
              label: 'איך חושב',
              minWidth: 200,
              render: (l) => (
                <div className="calc-cell">
                  <div>{l.how}</div>
                  {l.existing ? (
                    <div className="muted">קיים בשטח, לא נכנס לעלות</div>
                  ) : l.item && l.total !== null ? (
                    <div className="num" dir="ltr" style={{ textAlign: 'right' }}>
                      {fmtNum(l.qty, l.unit === 'unit' ? 0 : 2)} × {fmtMoney(l.item.price)} = {fmtMoney(l.total)}
                    </div>
                  ) : null}
                </div>
              ),
            },
            { key: 'price', label: 'מחיר יחידה', sort: (l) => l.item?.price ?? null, render: (l) => (l.item ? <Num value={l.item.price} money label={priceLabel(l.item)} /> : <span className="muted">אין</span>) },
            {
              key: 'range',
              label: 'טווח עלות',
              sort: (l) => l.max,
              render: (l) =>
                l.min !== null && l.max !== null ? (
                  <span className="numwrap">
                    <span className="num">
                      {fmtMoney(l.min)} עד {fmtMoney(l.max)}
                    </span>
                    <Tag label={lineLabel(l)} />
                  </span>
                ) : (
                  <span className="muted">אין</span>
                ),
              sum: rangeSum,
            },
          ]}
        />
        </div>
        </>
      )}

      <div className="row no-print">
        <IconBtn icon="download" label="ייצוא CSV" onClick={() => exportBomCsv(project, variant.name, lines)} disabled={!lines.length} />
        <IconBtn icon="print" label="הדפסה" onClick={printPage} />
      </div>
      <section className="card how-calc print-page" data-testid="how-calc">
        <h2 className="h-section">איך מחושב כתב הכמויות</h2>
        <ol className="steps-list">
          <li><b>כמות:</b> לכל אלמנט בתוכנית מחושבת כמות מהגיאומטריה שלו. משטח לפי שטח המצולע, גדר ושביל לפי אורך, קיר לפי אורך כפול גובה, ופריט כיחידה.</li>
          <li><b>עבודות נלוות:</b> מתחת למשטח נוספות שורות לפי עומק מקובל. ריצוף: חפירה 0.30 מ' ומצע 0.15 מ'. דשא: אדמה גננית 0.10 מ' ומתזים. ערוגה: אדמה 0.30 מ' וטפטוף.</li>
          <li><b>מחיר יחידה:</b> מסעיף המחירון שמתאים לסעיף ולתאריך. אפשר להחליף סעיף בכל שורה, והבחירה נשמרת.</li>
          <li><b>עלות:</b> כמות × מחיר יחידה. העמודה "איך חושב" מציגה את התרגיל לכל שורה.</li>
          <li><b>טווח:</b> העלות מורחבת לפי אי הוודאות. בכמות: מדוד 3%, מוערך 10%, הונח 25%. במחיר: סעיף מאומת 5%, לא מאומת 20%.</li>
          <li><b>קיים בשטח:</b> אלמנט קיים, כמו גדר גבול המגרש מההיתר, מוצג בלי עלות. מסמנים או מבטלים בטבלה.</li>
          <li><b>מע"מ:</b> המחירון והטבלה ללא מע"מ. הסכום כולל מע"מ 18% מופיע בתובנות.</li>
        </ol>
      </section>
      <PrintVisuals project={project} />
    </div>
  )
}
