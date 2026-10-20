import { useRef, useState } from 'react'
import { setPrices, useApp } from '../lib/store'
import { CSV_HEADER, SAMPLE_CSV, parsePriceCsv } from '../lib/csv'
import { CATEGORY_TEXT, DISCLAIMER, type Category } from '../lib/bom'
import { UNIT_TEXT } from '../lib/types'
import { Empty, Num, Rise, toast } from '../components/ui'
import { priceLabel } from './BomTab'

export default function Prices() {
  const prices = useApp((s) => s.prices)
  const [errors, setErrors] = useState<string[]>([])
  const [q, setQ] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = (text: string, what: string) => {
    const r = parsePriceCsv(text)
    setErrors(r.errors)
    if (r.items.length) {
      setPrices(r.items)
      toast(`${what}: נטענו ${r.items.length} סעיפים`)
    }
  }

  const onFile = async (f?: File) => {
    if (!f) return
    load(await f.text(), f.name)
  }

  const downloadTemplate = () => {
    const cats = Object.keys(CATEGORY_TEXT).join(' | ')
    const blob = new Blob(['﻿' + CSV_HEADER + '\n' + `D-0000,תיאור הסעיף,m2,0,paving,false,דקל,2026-10\n`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'תבנית-מחירון.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    toast(`קטגוריות: ${cats}`)
  }

  const list = prices.filter((p) => !q || p.description.includes(q) || p.code.includes(q))

  return (
    <div className="stack" style={{ gap: 18 }}>
      <Rise>
        <div className="eyebrow">price_items</div>
        <h1 className="h-page">מחירון</h1>
        <p className="lead">המחירון נטען מקובץ CSV ולא קבוע בקוד. כל סעיף מקושר לקטגוריה, והקטגוריה מחברת אותו לשורות בכתב הכמויות.</p>
      </Rise>
      <div className="disclaimer">{DISCLAIMER}</div>

      <div className="card">
        <div className="row">
          <button className="btn primary" onClick={() => fileRef.current?.click()}>
            טעינת קובץ CSV
          </button>
          <button className="btn" onClick={downloadTemplate}>
            הורדת תבנית
          </button>
          <button
            className="btn"
            onClick={() => {
              if (prices.length && !window.confirm('להחליף את המחירון הקיים במחירון דוגמה לא מאומת?')) return
              load(SAMPLE_CSV, 'מחירון דוגמה')
            }}
          >
            מחירון דוגמה לא מאומת
          </button>
          {prices.length > 0 && (
            <button
              className="btn danger"
              onClick={() => {
                if (window.confirm('לנקות את המחירון?')) {
                  setPrices([])
                  toast('המחירון נוקה')
                }
              }}
            >
              ניקוי
            </button>
          )}
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => void onFile(e.target.files?.[0])} data-testid="csv-input" />
        </div>
        <div className="muted mono" style={{ fontSize: 12, marginTop: 10, overflowWrap: 'anywhere' }}>
          {CSV_HEADER}
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          יחידות: m2, m, m3, unit (או מ"ר, מ"א, מ"ק, יח'). קטגוריות: {Object.entries(CATEGORY_TEXT).map(([k, t]) => `${k} (${t})`).join(', ')}.
        </div>
      </div>

      {errors.length > 0 && (
        <div className="notice danger">
          {errors.slice(0, 8).map((e) => (
            <div key={e}>{e}</div>
          ))}
          {errors.length > 8 && <div>ועוד {errors.length - 8} שגיאות</div>}
        </div>
      )}

      {prices.length === 0 ? (
        <div className="card">
          <Empty title="מחירון לא נטען">
            <div>עד שנטען מחירון דקל, כתב הכמויות מציג כמויות בלבד.</div>
          </Empty>
        </div>
      ) : (
        <>
          <input className="input" style={{ maxWidth: 320 }} placeholder="חיפוש סעיף" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש סעיף" />
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>קוד</th>
                  <th>תיאור</th>
                  <th>קטגוריה</th>
                  <th>מחיר</th>
                  <th>מקור</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.code + p.description}>
                    <td className="mono">{p.code}</td>
                    <td>{p.description}</td>
                    <td>{CATEGORY_TEXT[p.category as Category] ?? (p.category || 'ללא')}</td>
                    <td>
                      <Num value={p.price} money label={priceLabel(p)} /> <span className="muted">ל{UNIT_TEXT[p.unit]}</span>
                    </td>
                    <td className="muted">
                      {p.source} {p.date}
                      {!p.verified && <div className="lbl assumed">לא מאומת</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
