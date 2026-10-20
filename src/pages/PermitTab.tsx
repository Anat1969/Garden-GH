import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProject } from './ProjectLayout'
import { analyzePages, detectWalls, extractSegments, openPdf, pickPlanPage, PT_TO_M_AT_1, renderPage } from '../lib/pdf'
import { savePdf } from '../lib/idb'
import { uid, updateProject, updateVariant, uploadPermitToCloud } from '../lib/store'
import { usePermitDoc } from '../lib/usePermit'
import type { PageKind, Permit, ScaleInfo } from '../lib/types'
import { PAGE_KIND_TEXT } from '../lib/types'
import { NO_BASIS } from '../lib/bom'
import { ErrorState, Loading, Rise, Tag, toast } from '../components/ui'

const VECTOR_SRC = 'זיהוי וקטורי'

export default function PermitTab() {
  const { project, variant } = useProject()
  const nav = useNavigate()
  const [version, setVersion] = useState(0)
  const { doc, status } = usePermitDoc(project, version)
  const [declared, setDeclared] = useState<'vector' | 'scan'>(project.permit?.declaredType ?? 'vector')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [thumbs, setThumbs] = useState<Record<number, string>>({})
  const [result, setResult] = useState<{ walls: number; openings: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const permit = project.permit

  useEffect(() => {
    if (!doc || !permit) return
    let alive = true
    setThumbs({})
    ;(async () => {
      for (const pg of permit.pages.slice(0, 24)) {
        const url = await renderPage(doc, pg.index, 320)
        if (!alive) return
        setThumbs((t) => ({ ...t, [pg.index]: url }))
      }
    })().catch(() => undefined)
    return () => {
      alive = false
    }
  }, [doc, permit?.fileName, permit?.pageCount])

  const ingest = async (bytes: ArrayBuffer, fileName: string) => {
    setError(null)
    setResult(null)
    try {
      setBusy('פותחת את הקובץ')
      const d = await openPdf(bytes)
      const pages = await analyzePages(d, (i) => setBusy(`מנתחת עמוד ${i} מתוך ${d.numPages}`))
      const planPage = pickPlanPage(pages)
      const den = pages.find((p) => p.index === planPage)?.scaleDen ?? null
      const scale: ScaleInfo = den ? { den, metersPerPt: den * PT_TO_M_AT_1, source: 'text' } : { den: null, metersPerPt: null, source: null }
      await savePdf(project.id, bytes)
      const cloudPath = (await uploadPermitToCloud(project.id, bytes)) ?? undefined
      const newPermit: Permit = { fileName, declaredType: declared, pageCount: d.numPages, pages, planPage, scale, cloudPath }
      updateProject(project.id, (p) => ({ ...p, permit: newPermit }))
      setVersion((v) => v + 1)
      toast(`נטענו ${d.numPages} עמודים`)
    } catch (e) {
      console.error(e)
      setError('לא הצלחתי לקרוא את הקובץ. ודאי שזה PDF תקין ולא מוגן בסיסמה.')
    } finally {
      setBusy(null)
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    if (f.type && f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setError('יש להעלות קובץ PDF')
      return
    }
    if (f.size > 60 * 1024 * 1024) {
      setError('הקובץ גדול מ-60MB. כדאי לפצל את ההיתר.')
      return
    }
    await ingest(await f.arrayBuffer(), f.name)
  }

  const loadSample = async () => {
    try {
      setBusy('טוענת היתר לדוגמה')
      const res = await fetch('/sample-permit.pdf')
      if (!res.ok) throw new Error()
      await ingest(await res.arrayBuffer(), 'היתר לדוגמה.pdf')
    } catch {
      setBusy(null)
      setError('טעינת ההיתר לדוגמה נכשלה')
    }
  }

  const setPermit = (fn: (p: Permit) => Permit) => updateProject(project.id, (p) => (p.permit ? { ...p, permit: fn(p.permit) } : p))

  const setPageKind = (index: number, kind: PageKind) => setPermit((p) => ({ ...p, pages: p.pages.map((pg) => (pg.index === index ? { ...pg, kind } : pg)) }))

  const choosePlan = (index: number) =>
    setPermit((p) => {
      const den = p.pages.find((pg) => pg.index === index)?.scaleDen ?? null
      const scale: ScaleInfo =
        p.scale.source === 'calibrated' || p.scale.source === 'manual-only'
          ? p.scale
          : den
            ? { den, metersPerPt: den * PT_TO_M_AT_1, source: 'text' }
            : { den: null, metersPerPt: null, source: null }
      return { ...p, planPage: index, scale }
    })

  const setDen = (den: number | null) =>
    setPermit((p) => ({ ...p, scale: den ? { den, metersPerPt: den * PT_TO_M_AT_1, source: 'text' } : { den: null, metersPerPt: null, source: null } }))

  const manualOnly = () => setPermit((p) => ({ ...p, scale: { den: null, metersPerPt: null, source: 'manual-only' } }))

  const detect = async () => {
    if (!doc || !permit?.scale.metersPerPt) return
    setBusy('מזהה קירות ופתחים')
    try {
      const page = await doc.getPage(permit.planPage)
      const ex = await extractSegments(page)
      const det = detectWalls(ex, permit.scale.metersPerPt, uid, permit.planPage)
      updateVariant(project.id, (v) => {
        const keepIds = new Set(v.elements.filter((e) => !(e.source.includes(VECTOR_SRC) && !e.approved)).map((e) => e.id))
        const kept = v.elements.filter((e) => keepIds.has(e.id) && !(e.kind === 'opening' && !keepIds.has(e.wallId)))
        return { ...v, elements: [...kept, ...det.walls, ...det.openings] }
      })
      setPermit((p) => ({ ...p, detectedAt: new Date().toISOString(), detection: { walls: det.walls.length, openings: det.openings.length } }))
      setResult({ walls: det.walls.length, openings: det.openings.length })
    } catch (e) {
      console.error(e)
      setError('הזיהוי נכשל בעמוד הזה. אפשר לשרטט ידנית במסך התוכנית.')
    } finally {
      setBusy(null)
    }
  }

  const planPageInfo = permit?.pages.find((p) => p.index === permit.planPage)
  const existingDetected = variant.elements.filter((e) => e.source.includes(VECTOR_SRC)).length

  return (
    <div className="stack" style={{ gap: 18 }}>
      {error && <div className="notice danger">{error}</div>}
      {busy && (
        <div className="card flat">
          <Loading text={busy} />
        </div>
      )}

      {(!permit || status === 'missing') && !busy && (
        <Rise className="card">
          <div className="h-section">{status === 'missing' ? 'קובץ ההיתר לא נמצא במכשיר הזה' : 'העלאת היתר'}</div>
          <p className="muted" style={{ margin: '4px 0 14px' }}>
            {status === 'missing'
              ? 'הנתונים נשמרו, אבל קובץ ה-PDF הועלה ממכשיר אחר. אפשר להעלות אותו שוב.'
              : 'קובץ PDF של ההיתר: תוכניות, חזיתות, חתכים ותשריט. ההיתר נשמר במכשיר, ובענן כשמחוברים.'}
          </p>
          <div className="row" style={{ marginBottom: 14 }} role="radiogroup" aria-label="סוג הקובץ">
            <span className="muted">סוג הקובץ:</span>
            <button className={`btn small ${declared === 'vector' ? 'active' : ''}`} onClick={() => setDeclared('vector')} role="radio" aria-checked={declared === 'vector'}>
              וקטורי (מתוכנת שרטוט)
            </button>
            <button className={`btn small ${declared === 'scan' ? 'active' : ''}`} onClick={() => setDeclared('scan')} role="radio" aria-checked={declared === 'scan'}>
              סרוק
            </button>
          </div>
          {declared === 'scan' && <div className="notice" style={{ marginBottom: 14 }}>בהיתר סרוק אין קווים וקטוריים. הקירות ישורטטו ידנית אחרי כיול קנה מידה.</div>}
          <div
            className={`drop ${over ? 'over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              void onFile(e.dataTransfer.files[0])
            }}
          >
            <div className="h-section">גוררים לכאן PDF</div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => fileRef.current?.click()}>
                בחירת קובץ
              </button>
              <button className="btn" onClick={loadSample}>
                היתר לדוגמה
              </button>
            </div>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => void onFile(e.target.files?.[0])} data-testid="pdf-input" />
          </div>
        </Rise>
      )}

      {permit && status === 'loading' && <Loading text="טוען את ההיתר" />}
      {permit && status === 'error' && <ErrorState>לא ניתן לפתוח את קובץ ההיתר השמור.</ErrorState>}

      {permit && status === 'ready' && !busy && (
        <>
          {result && (
            <Rise className="card" style={{ borderColor: '#ecd29a' }}>
              <div className="eyebrow">תוצאת זיהוי</div>
              <div className="h-section" style={{ margin: '4px 0 8px' }}>
                זיהיתי {result.walls} קירות, {result.openings} פתחים. לבדוק לפני המשך.
              </div>
              <div className="muted" style={{ fontSize: 14, marginBottom: 10 }}>
                כל מה שזוהה מסומן <Tag label="estimated" /> עד שמאשרים אותו במסך התוכנית.
              </div>
              <button className="btn primary" onClick={() => nav('../plan')}>
                לבדיקה ותיקון
              </button>
            </Rise>
          )}

          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="eyebrow">{permit.fileName}</div>
                <div className="h-section">
                  {permit.pageCount} עמודים · {permit.declaredType === 'scan' ? 'סרוק' : 'וקטורי'}
                </div>
              </div>
              <button className="btn" onClick={() => updateProject(project.id, (p) => ({ ...p, permit: null }))}>
                החלפת היתר
              </button>
            </div>
          </div>

          <div className="card">
            <div className="h-section" style={{ marginBottom: 6 }}>
              קנה מידה · עמוד התוכנית {permit.planPage}
            </div>
            {permit.scale.source === 'text' && permit.scale.den ? (
              <div className="row">
                <span className="num" style={{ fontSize: 22 }}>
                  1:{permit.scale.den}
                </span>
                <Tag label="measured" />
                <span className="muted" style={{ fontSize: 14 }}>
                  נמצא בטקסט של העמוד
                </span>
              </div>
            ) : permit.scale.source === 'calibrated' ? (
              <div className="row">
                <span>כויל ידנית מול מידה ידועה</span>
                <Tag label="estimated" />
              </div>
            ) : permit.scale.source === 'manual-only' ? (
              <div className="row">
                <span>עבודה על מידות ידניות בלבד</span>
                <Tag label="assumed" />
              </div>
            ) : (
              <div className="notice danger">{NO_BASIS}. קנה המידה לא נמצא בעמוד. בלי קנה מידה לא מחשבים כמויות.</div>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <label className="field" style={{ width: 170 }}>
                <span>קביעה ידנית מהגיליון</span>
                <select className="input" value={permit.scale.source === 'text' ? String(permit.scale.den) : ''} onChange={(e) => setDen(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">לא נבחר</option>
                  {[50, 100, 200, 250, 500].map((d) => (
                    <option key={d} value={d}>
                      1:{d}
                    </option>
                  ))}
                </select>
              </label>
              <Link className="btn" to="../plan?tool=calibrate" style={{ alignSelf: 'end' }}>
                כיול לפי מידה ידועה
              </Link>
              <button className="btn ghost" onClick={manualOnly} style={{ alignSelf: 'end' }}>
                מידות ידניות בלבד
              </button>
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="h-section">זיהוי קירות ופתחים</div>
                <div className="muted" style={{ fontSize: 14 }}>
                  {planPageInfo?.vectorSegments
                    ? `בעמוד ${permit.planPage} נמצאו ${planPageInfo.vectorSegments.toLocaleString('he-IL')} קווים וקטוריים.`
                    : `בעמוד ${permit.planPage} אין קווים וקטוריים (כנראה סריקה). שרטוט ידני במסך התוכנית.`}
                  {existingDetected > 0 && ` כבר קיימים ${existingDetected} אלמנטים מזיהוי קודם. זיהוי חוזר מחליף רק את מה שלא אושר.`}
                </div>
              </div>
              <button className="btn primary" disabled={!permit.scale.metersPerPt || !planPageInfo?.vectorSegments} onClick={detect}>
                {existingDetected ? 'זיהוי מחדש' : 'זיהוי אוטומטי'}
              </button>
            </div>
            {!permit.scale.metersPerPt && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>הזיהוי דורש קנה מידה.</div>}
          </div>

          <div className="card">
            <div className="h-section" style={{ marginBottom: 10 }}>
              עמודי ההיתר
            </div>
            <div className="pages">
              {permit.pages.map((pg) => (
                <div key={pg.index} className={`page-thumb ${pg.index === permit.planPage ? 'sel' : ''}`}>
                  {thumbs[pg.index] ? <img src={thumbs[pg.index]} alt={`עמוד ${pg.index}`} /> : <div className="skeleton" style={{ aspectRatio: '1/1.1' }} />}
                  <div className="meta">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="mono">עמוד {pg.index}</span>
                      <span className="mono muted">{pg.scaleDen ? `1:${pg.scaleDen}` : 'ללא קנ"מ'}</span>
                    </div>
                    <select className="input" value={pg.kind} onChange={(e) => setPageKind(pg.index, e.target.value as PageKind)} aria-label={`סוג עמוד ${pg.index}`}>
                      {(Object.keys(PAGE_KIND_TEXT) as PageKind[]).map((k) => (
                        <option key={k} value={k}>
                          {PAGE_KIND_TEXT[k]}
                        </option>
                      ))}
                    </select>
                    {pg.index === permit.planPage ? (
                      <span className="lbl measured" style={{ justifySelf: 'start' }}>
                        עמוד העבודה
                      </span>
                    ) : (
                      <button className="btn small" onClick={() => choosePlan(pg.index)}>
                        עבודה על עמוד זה
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
