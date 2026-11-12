import { useRef, useState } from 'react'
import { defaultPrices, setPrices, useApp } from '../lib/store'
import { DEKEL_DATE, DEKEL_SOURCES, sourceOf } from '../data/dekelPrices'
import { PageIntro } from '../components/PageIntro'
import { DataTable } from '../components/DataTable'
import { IconBtn } from '../components/EditIcons'
import type { PriceItem } from '../lib/types'
import { CSV_HEADER, CSV_HEADER_HE, SAMPLE_CSV, parsePriceCsv } from '../lib/csv'
import { CATEGORY_TEXT, DISCLAIMER, type Category } from '../lib/bom'
import { UNIT_TEXT } from '../lib/types'
import { Empty, Num, toast } from '../components/ui'
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
    // תבנית בעברית: יחידות בעברית, קטגוריה בקוד (הרשימה בסוף הקובץ)
    const lines = [CSV_HEADER_HE, 'D-0000,תיאור הסעיף,מ"ר,0,paving,לא,דקל,2026-10', '', 'קטגוריות אפשריות:', ...Object.entries(CATEGORY_TEXT).map(([k, t]) => `${k},${t}`)]
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'תבנית-מחירון.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    toast(`קטגוריות: ${cats}`)
  }

  // חיפוש: כל המילים, בתיאור, בקוד, בקטגוריה ובמקור. ההתאמות מסומנות בטבלה
  const words = q.trim().split(/\s+/).filter(Boolean)
  const hay = (p: PriceItem) => `${p.description} ${p.code} ${CATEGORY_TEXT[p.category as Category] ?? p.category} ${p.source}`
  const list = prices.filter((p) => words.every((w) => hay(p).includes(w)))
  const Hl = ({ text }: { text: string }) => {
    if (!words.length) return <>{text}</>
    const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
    return <>{text.split(re).map((x, i) => (i % 2 ? <mark key={i}><b>{x}</b></mark> : x))}</>
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <h1 className="h-page">מחירון</h1>
      <PageIntro
        art="prices"
        title="המחירון קובע את טווח העלות של כל שורה בכתב הכמויות"
        points={[
          <>כל סעיף מקושר ל<b>קטגוריה</b>, והקטגוריה מחברת אותו לשורות בכתב הכמויות.</>,
          <>כברירת מחדל נטענת <b>טבלה ממקורות ציבוריים</b>: מכרזים שמצטטים את מחירון דקל, ומחירי שוק.</>,
          <>הטבלה <b>לא מאומתת</b> מול מחירון דקל המלא, ולכן כל מחיר מסומן "הונח".</>,
          <>מחירון דקל מעודכן נטען כקובץ CSV.</>,
        ]}
        legend
        insights={[
          { k: 'סעיפים', v: prices.length },
          { k: 'קטגוריות מכוסות', v: `${new Set(prices.map((p) => p.category)).size} מתוך ${Object.keys(CATEGORY_TEXT).length}`, tone: new Set(prices.map((p) => p.category)).size >= Object.keys(CATEGORY_TEXT).length ? 'good' : 'warn' },
          { k: 'מאומתים', v: prices.filter((p) => p.verified).length, tone: prices.some((p) => p.verified) ? 'good' : 'warn', note: 'מול מחירון וספק' },
          { k: 'עם קוד דקל', v: prices.filter((p) => /^4\d\./.test(p.code)).length },
        ]}
      />
      <div className="disclaimer">{DISCLAIMER}</div>

      <div className="card">
        <div className="row">
          <IconBtn icon="upload" label="טעינת קובץ CSV" className="primary" onClick={() => fileRef.current?.click()} />
          <IconBtn icon="download" label="הורדת תבנית" onClick={downloadTemplate} />
          <button
            className="btn"
            onClick={() => {
              if (prices.length && !window.confirm('להחליף את המחירון הקיים בטבלה הציבורית?')) return
              const items = defaultPrices()
              setPrices(items)
              setErrors([])
              toast(`טבלה ציבורית: נטענו ${items.length} סעיפים`)
            }}
          >
            טבלה ציבורית ({DEKEL_DATE})
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
            <div>עד שנטען מחירון, כתב הכמויות מציג כמויות בלבד. אפשר לטעון את הטבלה הציבורית בכפתור למעלה.</div>
          </Empty>
        </div>
      ) : (
        <>
          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <input className="input" type="search" style={{ maxWidth: 320 }} placeholder="חיפוש: מילה, קוד, קטגוריה או מקור" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש סעיף" data-testid="prices-search" />
            {words.length > 0 && (
              <span className="muted" data-testid="prices-found">
                נמצאו <b>{list.length}</b> סעיפים
              </span>
            )}
          </div>
          <DataTable<PriceItem>
            testId="prices-table"
            caption="סעיפי המחירון"
            rows={list}
            rowKey={(p) => p.code + p.description}
            defaultGroup="category"
            groups={[
              { key: 'category', label: 'קטגוריה', value: (p) => CATEGORY_TEXT[p.category as Category] ?? (p.category || 'ללא') },
              { key: 'unit', label: 'יחידה', value: (p) => UNIT_TEXT[p.unit] },
              { key: 'source', label: 'מקור', value: (p) => p.source },
            ]}
            cols={[
              { key: 'code', label: 'קוד', sort: (p) => p.code, render: (p) => <span className="mono"><Hl text={p.code} /></span> },
              { key: 'desc', label: 'תיאור', sort: (p) => p.description, render: (p) => <Hl text={p.description} />, minWidth: 220 },
              { key: 'cat', label: 'קטגוריה', sort: (p) => CATEGORY_TEXT[p.category as Category] ?? p.category, render: (p) => CATEGORY_TEXT[p.category as Category] ?? (p.category || 'ללא') },
              {
                key: 'price',
                label: 'מחיר',
                sort: (p) => p.price,
                render: (p) => (
                  <>
                    <Num value={p.price} money label={priceLabel(p)} /> <span className="muted">ל{UNIT_TEXT[p.unit]}</span>
                  </>
                ),
              },
              {
                key: 'src',
                label: 'מקור',
                sort: (p) => p.source,
                render: (p) => {
                  const src = sourceOf(p.source)
                  return (
                    <span className="price-src">
                      <span className="muted">
                        <Hl text={p.source} /> · {p.date}
                      </span>
                      {src ? (
                        <a href={src.url} target="_blank" rel="noreferrer" className="src-link">
                          למקור: {src.title}
                        </a>
                      ) : (
                        <span className="lbl assumed">הערכה ללא מקור</span>
                      )}
                      {!p.verified && <span className="lbl assumed">לא מאומת</span>}
                    </span>
                  )
                },
              },
            ]}
            selectable={false}
          />
          <details className="card flat">
            <summary>
              <b>מקורות הטבלה הציבורית ({DEKEL_SOURCES.length})</b>
            </summary>
            <ul className="sources">
              {DEKEL_SOURCES.map((src) => (
                <li key={src.title}>
                  {src.url ? (
                    <a href={src.url} target="_blank" rel="noreferrer">
                      {src.title}
                    </a>
                  ) : (
                    <b>{src.title}</b>
                  )}
                  <div className="muted" style={{ fontSize: 13 }}>
                    {src.note}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  )
}
