import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import { useApp, updateVariant } from '../lib/store'
import { CATEGORY_TEXT, DISCLAIMER, NO_BASIS, computeBom, hasBasis, sumRange, fmtMoney, type BomLine } from '../lib/bom'
import type { Label, PriceItem } from '../lib/types'
import { UNIT_TEXT } from '../lib/types'
import { Empty, Num, Tag } from '../components/ui'

export const priceLabel = (i: PriceItem): Label => (i.verified ? 'estimated' : 'assumed')
const RANK: Record<Label, number> = { measured: 0, estimated: 1, assumed: 2 }
export const weakest = (a: Label, b: Label): Label => (RANK[a] >= RANK[b] ? a : b)

export function lineLabel(l: BomLine): Label {
  return l.item ? weakest(l.qtyLabel, priceLabel(l.item)) : l.qtyLabel
}

function exportCsv(name: string, lines: BomLine[]) {
  const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`
  const rows = [
    ['אלמנט', 'סעיף', 'קוד מחירון', 'כמות', 'יחידה', 'תווית כמות', 'מחיר יחידה', 'מינימום', 'מקסימום'].map(esc).join(','),
    ...lines.map((l) =>
      [l.elementName, CATEGORY_TEXT[l.category], l.item?.code ?? '', l.qty, UNIT_TEXT[l.unit], l.qtyLabel === 'measured' ? 'מדוד מהיתר' : l.qtyLabel === 'estimated' ? 'מוערך' : 'הונח', l.item?.price ?? '', l.min !== null ? Math.round(l.min) : '', l.max !== null ? Math.round(l.max) : '']
        .map(esc)
        .join(','),
    ),
    esc(DISCLAIMER),
  ]
  const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `כתב-כמויות-${name}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
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

  const houseCount = variant.elements.filter((e) => e.kind === 'wall' && e.scope === 'house').length

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="disclaimer">{DISCLAIMER}</div>
      {prices.length === 0 && (
        <div className="notice">
          מחירון לא נטען. הכמויות מחושבות, אבל אין מחירים.{' '}
          <Link to="/prices" style={{ fontWeight: 600 }}>
            טעינת מחירון
          </Link>
        </div>
      )}

      <div className="grid-cards">
        <div className="card flat stat">
          <span className="k">טווח עלות · חלופה "{variant.name}"</span>
          <span className="v">{lines.length && sum.max ? `${fmtMoney(sum.min)} עד ${fmtMoney(sum.max)}` : 'אין מחירים'}</span>
          {sum.max > 0 && <Tag label={lines.some((l) => l.item && lineLabel(l) === 'assumed') ? 'assumed' : 'estimated'} />}
        </div>
        <div className="card flat stat">
          <span className="k">שורות</span>
          <span className="v">{lines.length}</span>
          {sum.missing > 0 && <span className="muted" style={{ fontSize: 13 }}>{sum.missing} שורות בלי מחיר</span>}
        </div>
        {budget !== null && (
          <div className="card flat stat">
            <span className="k">תקציב לקוח</span>
            <Num value={budget} money label="assumed" />
            {sum.max > 0 && (
              <span className="muted" style={{ fontSize: 13 }}>
                {sum.max <= budget ? 'גם הטווח העליון בתוך התקציב' : sum.min > budget ? 'גם הטווח התחתון חורג מהתקציב' : 'התקציב בתוך הטווח, יש סיכון לחריגה'}
              </span>
            )}
          </div>
        )}
      </div>

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
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>אלמנט</th>
                <th>סעיף</th>
                <th>כמות</th>
                <th>סעיף מחירון</th>
                <th>מחיר יחידה</th>
                <th>טווח עלות</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const options = prices.filter((p) => p.category === l.category || p.unit === l.unit)
                return (
                  <tr key={l.key}>
                    <td>
                      {l.elementName}
                      {l.warning && <div className="lbl assumed" style={{ display: 'block', marginTop: 4, whiteSpace: 'normal' }}>{l.warning}</div>}
                    </td>
                    <td>{CATEGORY_TEXT[l.category]}</td>
                    <td>
                      <Num value={l.qty} unit={UNIT_TEXT[l.unit]} label={l.qtyLabel} />
                    </td>
                    <td style={{ minWidth: 180 }}>
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
                    </td>
                    <td>{l.item ? <Num value={l.item.price} money label={priceLabel(l.item)} /> : <span className="muted">אין</span>}</td>
                    <td>
                      {l.min !== null && l.max !== null ? (
                        <span className="numwrap">
                          <span className="num">
                            {fmtMoney(l.min)} עד {fmtMoney(l.max)}
                          </span>
                          <Tag label={lineLabel(l)} />
                        </span>
                      ) : (
                        <span className="muted">אין</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {sum.max > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5}>סה"כ</td>
                  <td>
                    <span className="num">
                      {fmtMoney(sum.min)} עד {fmtMoney(sum.max)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <div className="row no-print">
        <button className="btn" onClick={() => exportCsv(project.name, lines)} disabled={!lines.length}>
          ייצוא CSV
        </button>
        <button className="btn" onClick={() => window.print()}>
          הדפסה
        </button>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        טווח העלות משקלל את אי הוודאות בכמות (מדוד 3%, מוערך 10%, הונח 25%) ובמחיר (סעיף מאומת 5%, לא מאומת 20%).
      </div>
    </div>
  )
}
