// כתב כמויות להדפסה: טבלה פשוטה לפי סעיפים, עם סכום לכל סעיף וסיכום כולל ומע"מ. מוצגת רק בהדפסה.
import { CATEGORY_TEXT, DISCLAIMER, VAT, fmtMoney, fmtNum, sumRange, type BomLine } from '../lib/bom'
import { LABEL_TEXT, UNIT_TEXT } from '../lib/types'

export function BomPrintTable({ lines }: { lines: BomLine[] }) {
  const active = lines.filter((l) => !l.existing)
  const cats = [...new Set(active.map((l) => l.category))]
  const t = sumRange(active)
  const ex = lines.filter((l) => l.existing)
  let n = 0
  return (
    <section className="print-only print-bom">
      <table className="pt">
        <colgroup>
          <col style={{ width: '5%' }} />
          <col style={{ width: '17%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '28%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>מס'</th>
            <th>אלמנט</th>
            <th>כמות</th>
            <th>איך חושב</th>
            <th>סעיף ומחיר</th>
            <th>עלות וטווח</th>
          </tr>
        </thead>
        {cats.map((c) => {
          const g = active.filter((l) => l.category === c)
          const s = sumRange(g)
          return (
            <tbody key={c} className="pt-group">
              <tr className="pt-cat">
                <td colSpan={6}>{CATEGORY_TEXT[c]}</td>
              </tr>
              {g.map((l) => {
                n++
                return (
                  <tr key={l.key}>
                    <td className="num">{n}</td>
                    <td>
                      {l.elementName}
                      {l.warning && <div className="pt-warn">{l.warning}</div>}
                    </td>
                    <td className="num">
                      {fmtNum(l.qty, l.unit === 'unit' ? 0 : 2)} {UNIT_TEXT[l.unit]}
                      <div className="pt-small">{LABEL_TEXT[l.qtyLabel]}</div>
                    </td>
                    <td className="pt-small">{l.how}</td>
                    <td className="pt-small">
                      {l.item ? (
                        <>
                          <b>{l.item.code}</b> {l.item.description}
                          <div className="num">{fmtMoney(l.item.price)} ליחידה</div>
                        </>
                      ) : (
                        'אין סעיף מתאים'
                      )}
                    </td>
                    <td className="num">
                      {l.total !== null ? (
                        <>
                          <b>{fmtMoney(l.total)}</b>
                          <div className="pt-small">
                            {fmtMoney(l.min ?? 0)} עד {fmtMoney(l.max ?? 0)}
                          </div>
                        </>
                      ) : (
                        'אין מחיר'
                      )}
                    </td>
                  </tr>
                )
              })}
              <tr className="pt-sum">
                <td colSpan={5}>סה"כ {CATEGORY_TEXT[c]}</td>
                <td className="num">
                  <b>{fmtMoney(s.total)}</b>
                </td>
              </tr>
            </tbody>
          )
        })}
        <tbody className="pt-group">
          <tr className="pt-total">
            <td colSpan={5}>סה"כ ללא מע"מ</td>
            <td className="num">
              {fmtMoney(t.total)}
              <div className="pt-small">
                {fmtMoney(t.min)} עד {fmtMoney(t.max)}
              </div>
            </td>
          </tr>
          <tr className="pt-total">
            <td colSpan={5}>סה"כ כולל מע"מ {Math.round(VAT * 100)}%</td>
            <td className="num">
              {fmtMoney(t.total * (1 + VAT))}
              <div className="pt-small">
                {fmtMoney(t.min * (1 + VAT))} עד {fmtMoney(t.max * (1 + VAT))}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      {ex.length > 0 && (
        <div className="pt-existing">
          <b>קיים בשטח, לא מתומחר:</b> {ex.map((l) => `${l.elementName} (${fmtNum(l.qty)} ${UNIT_TEXT[l.unit]})`).join(' · ')}
        </div>
      )}
      <div className="disclaimer">{DISCLAIMER}</div>
    </section>
  )
}
