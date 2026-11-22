import { READ_VERSION } from '../lib/buildHouse'
import { deleteDocBlob } from '../lib/idb'
import { STOREY_TEXT, floorFromStructure, setFloors, storeyDrawings } from '../lib/floors'
import type { FloorPlan } from '../lib/types'
import { addFacade, sideFromTitle } from '../lib/facades'
import { unitFootprints } from '../lib/structureToElements'
import { DataTable } from './DataTable'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Building, Drawing, DrawingKind, Permit, Project } from '../lib/types'
import { DRAWING_KIND_TEXT } from '../lib/types'
import { mapPage, pickGardenDrawing, readHeights, readStructure, renderRegion } from '../lib/permitReader'
import { baseAbs } from '../lib/structureToElements'
import { PT_TO_M_AT_1 } from '../lib/pdf'
import { polyArea } from '../lib/geom'
import { aiAvailable, readPageWithAi } from '../lib/aiRead'
import { attachLines, mergeDims } from '../lib/dims'
import { getState, setPlanScale, uid, updateProject } from '../lib/store'
import { Loading, Modal, NumField, Tag, toast } from './ui'
import { IconBtn } from './EditIcons'
import { buildHouse } from '../lib/buildHouse'

const MEANING_TEXT: Record<string, string> = {
  ground_floor: 'רצפת קומת קרקע',
  first_floor: 'רצפת קומה א',
  second_floor: 'רצפת קומה ב',
  attic: 'עליית גג',
  basement: 'מרתף',
  roof_eave: 'תחילת גג (מרזב)',
  ridge: 'רכס הגג',
  parapet: 'מעקה גג',
  flat_roof: 'גג שטוח',
  natural_ground: 'קרקע טבעית',
  garden: 'גינה',
  street: 'רחוב',
  window: 'חלון',
  other: 'אחר',
}

const ROOF_TEXT: Record<Building['roofType'], string> = { gable: 'גמלון (שני שיפועים)', hip: 'ארבעה שיפועים', flat: 'שטוח', shed: 'שיפוע אחד', mixed: 'משולב' }

export function PermitReader({ project, doc }: { project: Project; doc: PDFDocumentProxy }) {
  const nav = useNavigate()
  const permit = project.permit!
  const [busy, setBusy] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ title: string; lines: string[] } | null>(null)
  const logRef = useRef<string[]>([])
  const drawings = permit.drawings ?? []
  const work = drawings.find((d) => d.id === permit.workDrawingId)

  useEffect(() => {
    let alive = true
    ;(async () => {
      for (const d of drawings.slice(0, 40)) {
        if (thumbs[d.id]) continue
        const { canvas } = await renderRegion(doc, d.page, d.box, 420)
        if (!alive) return
        const url = canvas.toDataURL('image/jpeg', 0.8)
        setThumbs((t) => ({ ...t, [d.id]: url }))
      }
    })().catch(() => undefined)
    return () => {
      alive = false
    }
  }, [doc, drawings.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const setPermit = (fn: (p: Permit) => Permit) => updateProject(project.id, (p) => (p.permit ? { ...p, permit: fn(p.permit) } : p))
  const note = (m: string) => {
    logRef.current.push(m)
    setLog((l) => [...l, m])
  }
  const latest = () => getState().projects.find((p) => p.id === project.id)!

  const useDrawing = (d: Drawing) => {
    setPermit((p) => ({ ...p, planPage: d.page, region: d.box, workDrawingId: d.id }))
    const p = latest().permit!
    // קנה מידה מהכותרת: תקף כשהקובץ בגודל הנייר האמיתי (PDF). בתמונה או בחיתוך, קנה המידה נקבע מהמידות.
    if (d.scaleDen && p.sourceType !== 'image' && p.scale.source !== 'calibrated' && p.scale.source !== 'dimensions') {
      setPlanScale(project.id, { den: d.scaleDen, metersPerPt: d.scaleDen * PT_TO_M_AT_1, source: 'text' })
    }
  }

  const doMap = async () => {
    const all: Drawing[] = []
    for (const pg of permit.pages.slice(0, 12)) {
      const r = await mapPage(doc, pg.index, uid, setBusy)
      all.push(...r.drawings)
      if (r.errors.length) note(`עמוד ${pg.index}: ${r.errors[0]}`)
    }
    setPermit((p) => ({ ...p, drawings: all, mapVersion: READ_VERSION }))
    note(`מופו ${all.length} שרטוטים`)
    return all
  }

  const doStructure = async (d: Drawing) => {
    setBusy(`קוראת מבנה וגינה: ${d.title || 'תוכנית'}`)
    const s = await readStructure(doc, d)
    setPermit((p) => ({ ...p, structure: s }))
    const mpp = latest().permit?.scale.metersPerPt
    const area = mpp && s.plot.length >= 3 ? Math.abs(polyArea(s.plot)) * mpp * mpp : null
    updateProject(project.id, (p) => ({
      ...p,
      north: Math.round(s.northDeg),
      plotArea: area ? Math.round(area * 100) / 100 : p.plotArea,
      extracted: { ...p.extracted, north: 'מחץ הצפון בתוכנית', ...(area ? { plotArea: 'מגבול המגרש בתוכנית' } : {}) },
    }))
    if (s.snap?.snapped) note(`קו המתאר הוצמד לקווי הקיר שבשרטוט עצמו: ${s.snap.snapped} מתוך ${s.snap.edges} צלעות. המיקום מדויק כמו בהיתר.`)
    note(`נקראו ${s.units.length} יחידות, ${s.openings.length} פתחים, ${s.zones.length} אזורי גינה, ${s.levels.length} מפלסים, ${s.trees.length} עצים`)
  }

  const doHeights = async (list: Drawing[]) => {
    // שני חתכים ושתי חזיתות מספיקים למפלסים, והקריאה מהירה פי שניים
    const big = (k: Drawing['kind']) => list.filter((d) => d.kind === k && (d.scaleDen ?? 100) >= 100).sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h).slice(0, 2)
    const targets = [...big('section'), ...big('elevation')]
    if (!targets.length) {
      note('לא נמצאו חתכים או חזיתות לקריאת גבהים')
      return
    }
    const r = await readHeights(doc, targets, setBusy)
    if (r.building) {
      const bl = r.building
      const summary = bl.levels
        .slice(0, 6)
        .map((l) => `${l.text} ${MEANING_TEXT[l.meaning] ?? ''}`.trim())
        .join(' · ')
      updateProject(project.id, (p) => ({
        ...p,
        building: bl,
        baseLevel: bl.baseAbs ?? p.baseLevel,
        levelsNote: summary || p.levelsNote,
        extracted: { ...p.extracted, ...(bl.baseAbs !== null ? { baseLevel: 'מהחתכים והחזיתות' } : {}), ...(summary ? { levelsNote: 'מסימוני הגובה בהיתר' } : {}) },
      }))
      note(`נקראו ${r.building.levels.length} סימוני גובה מ-${targets.length} שרטוטים`)
    }
    if (r.errors.length) note(r.errors[0])
  }

  // כל המפלסים: מרתף, קומות עליונות וגג. כל תוכנית נקראת בנפרד ומוצבת מעל קומת הקרקע
  const doFloors = async (list: Drawing[], ground: Drawing) => {
    const targets = storeyDrawings(list, ground.id).slice(0, 7)
    if (!targets.length) return
    setBusy(`קוראת ${targets.length} מפלסים: מרתף, קומות וגג`)
    const read = await Promise.all(
      targets.map(async ({ d, kind }) => {
        try {
          return floorFromStructure(latest(), d, await readStructure(doc, d), uid(), kind)
        } catch (e) {
          note(`${d.title || 'תוכנית'} לא נקראה: ${e instanceof Error ? e.message : String(e)}`)
          return null
        }
      }),
    )
    const out = read.filter((f): f is FloorPlan => Boolean(f))
    if (!out.length) return
    setFloors(project.id, out)
    note(`${out.length === 1 ? 'מפלס אחד נבנה' : `${out.length} מפלסים נבנו`} מהתוכנית שלהם: ${out.map((f) => `${STOREY_TEXT[f.kind ?? 'floor']} ${f.title} (${f.area.toFixed(2)} מ"ר)`).join(' · ')}`)
  }

  // צפון מהחזיתות, כשאין חץ צפון בתוכנית: החזית הרחבה מראה את הצד הארוך של הבית.
  // אם החזיתות המערבית והמזרחית הן הרחבות, הצד הארוך פונה מזרחה ומערבה, ולכן הצפון הוא לאורך הצד הארוך.
  const guessNorth = (list: Drawing[]) => {
    const p = latest()
    if (p.northSet || (p.permit?.structure?.northDeg ?? 0) !== 0) return
    const fp = unitFootprints(p).flat()
    if (!fp.length) return
    const xs = fp.map((v) => v.x)
    const ys = fp.map((v) => v.y)
    const longX = Math.max(...xs) - Math.min(...xs) > (Math.max(...ys) - Math.min(...ys)) * 1.25
    const longY = Math.max(...ys) - Math.min(...ys) > (Math.max(...xs) - Math.min(...xs)) * 1.25
    const avg = (sides: string[]) => {
      const w = list.filter((d) => d.kind === 'elevation' && sides.includes(sideFromTitle(d.title) ?? '')).map((d) => d.box.w)
      return w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0
    }
    const we = avg(['W', 'E'])
    const ns = avg(['N', 'S'])
    if (!we || !ns || (!longX && !longY)) return
    const weLong = we > ns * 1.25
    const nsLong = ns > we * 1.25
    if (!weLong && !nsLong) return
    // הצד הארוך נראה בחזיתות מערב ומזרח: הצפון לאורכו. אחרת הצפון בניצב לו.
    const north = (weLong && longX) || (nsLong && longY) ? 90 : 0
    updateProject(project.id, (q) => ({ ...q, north, extracted: { ...q.extracted, north: 'מוערך מרוחב החזיתות' } }))
    note(`הצפון הוערך מרוחב החזיתות: ${north === 90 ? 'ימינה או שמאלה בתוכנית' : 'למעלה או למטה בתוכנית'}. בודקים מול תצלום האוויר במודל, ומתקנים בניתוח האקלים.`)
  }

  // חזיתות: כל שרטוט חזית נחתך מהגיליון ונשמר להלבשה על הבית במודל
  const doFacades = async (list: Drawing[]) => {
    const targets = list.filter((d) => d.kind === 'elevation').slice(0, 6)
    if (!targets.length) return
    const sc = latest().permit?.scale
    let n = 0
    for (const d of targets) {
      setBusy(`חותכת חזית: ${d.title || 'חזית'}`)
      try {
        const { canvas, scale } = await renderRegion(doc, d.page, d.box, 2400)
        // קנה המידה של החזית יכול להיות שונה משל התוכנית
        const mpp = sc?.metersPerPt ? sc.metersPerPt * (d.scaleDen && sc.den ? d.scaleDen / sc.den : 1) : null
        if (await addFacade(project.id, canvas, { title: d.title || 'חזית', drawingId: d.id, mPerPx: mpp ? mpp / scale : null })) n++
      } catch {
        // חזית שלא נחתכה לא עוצרת את הקריאה
      }
    }
    if (n) note(`${n} חזיתות נחתכו מההיתר ומולבשות על הבית במודל`)
  }

  const doDims = async (d: Drawing) => {
    setBusy(`קוראת מידות: ${d.title || 'תוכנית'}`)
    const r = await readPageWithAi(doc, d.page, latest().permit!.sourceType === 'image', 'normal', uid, () => undefined, d.box)
    setPermit((p) => {
      const merged = mergeDims(p.dims ?? [], r.dims)
      const att = attachLines(merged, [], d.page)
      return { ...p, dims: att.dims, aiReadAt: new Date().toISOString() }
    })
    note(`נקראו ${r.dims.length} מידות ומפלסים בשרטוט העבודה`)
  }

  // בניית הבית: קנה מידה אוטומטי מהמידות אם חסר, ואז קירות, פתחים, גבול מגרש ואזורי גינה
  const [nextStep, setNextStep] = useState<{ to: string; t: string } | null>(null)
  const buildElements = () => {
    const r = buildHouse(project.id)
    r.lines.forEach(note)
    setNextStep(r.next ?? null)
    return r.count
  }

  // כל פעולה מסתיימת בהודעה ובחלון שמראה מה יצא
  const run = async (fn: () => Promise<void>, title = 'הפעולה הסתיימה') => {
    setError(null)
    logRef.current = []
    try {
      await fn()
      toast(title)
      setResult({ title, lines: logRef.current.length ? [...logRef.current] : ['הפעולה הסתיימה בלי שינויים'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const fullRead = () =>
    run(async () => {
      setLog([])
      // קריאה מלאה מתחילה מדף נקי: מה שנקרא בגרסה ישנה (מיפוי, מבנה, קנה מידה שלא נקבע ביד, קומות וחזיתות) נמחק ולא מתערבב בחדש
      const stale = (permit.readVersion ?? 0) < READ_VERSION && Boolean(permit.structure)
      if (stale) note('ההיתר נקרא בעבר בגרסה ישנה של הקריאה. קוראת מחדש מההתחלה.')
      const oldFacades = latest().facades ?? []
      updateProject(project.id, (p) => ({
        ...p,
        floors: [],
        facades: [],
        building: stale ? undefined : p.building,
        permit: p.permit && {
          ...p.permit,
          structure: undefined,
          ...(stale ? { drawings: [], dims: [], dimScales: [], region: undefined, workDrawingId: undefined, scale: { den: null, metersPerPt: null, source: null } } : {}),
        },
      }))
      await Promise.all(oldFacades.map((f) => deleteDocBlob(f.id).catch(() => undefined)))
      const cur = latest().permit!
      const list = cur.drawings?.length && cur.mapVersion === READ_VERSION ? cur.drawings : await doMap()
      const g = (!stale && work && list.find((d) => d.id === work.id)) || pickGardenDrawing(list)
      if (!g) throw new Error('לא נמצאה תוכנית קומת קרקע או פיתוח שטח. אפשר לבחור שרטוט ידנית.')
      useDrawing(g)
      note(`שרטוט העבודה: ${g.title || DRAWING_KIND_TEXT[g.kind]}`)
      await doStructure(g)
      // מפלסים, מידות וקומות נקראים במקביל: שלושתם תלויים רק בתוכנית הקרקע
      await Promise.all([doHeights(list), doDims(g), doFloors(list, g)])
      const built = buildElements()
      // בלי בית סביר אין מודל: עוצרים עם הסבר, ולא מציגים מודל שטוח
      if (!built) throw new Error(logRef.current[logRef.current.length - 1] || 'הבית לא נבנה מההיתר.')
      guessNorth(list)
      await doFacades(list)
      setPermit((p) => ({ ...p, readVersion: READ_VERSION }))
    }, 'קריאת ההיתר הסתיימה')

  // קריאה אוטומטית: היתר שהועלה ועוד לא נקרא נקרא לבד, ובסיום עוברים למודל. פעם אחת לכל קובץ.
  const autoKey = `garden.autoRead.${project.id}.${permit.fileName}`
  useEffect(() => {
    const fresh = permit.structure && (permit.readVersion ?? 0) >= READ_VERSION
    if (!aiAvailable || fresh || localStorage.getItem('garden.autoRead') === '0' || sessionStorage.getItem(autoKey)) return
    sessionStorage.setItem(autoKey, '1')
    void fullRead().then(() => {
      if (latest().permit?.structure && activeHasHouse()) {
        setResult(null)
        toast('ההיתר נקרא. הבית מוצג במודל, בתוך הסביבה שלו.')
        nav('../model')
      }
    })
  }, [doc]) // eslint-disable-line react-hooks/exhaustive-deps
  const activeHasHouse = () => {
    const p = latest()
    return (p.variants.find((v) => v.id === p.activeVariantId) ?? p.variants[0])?.elements.some((e) => e.kind === 'wall' && e.scope === 'house')
  }

  const b = project.building
  const base = baseAbs(project)
  const s = permit.structure

  return (
    <div className="card" data-testid="permit-reader">
      <div className="eyebrow">שרטט ואדריכל נוף</div>
      <div className="h-section">קריאת ההיתר</div>
      <div className="muted" style={{ fontSize: 14 }}>בוחרים פעולה לפי מה שצריך. בפעם הראשונה: קריאה מלאה.</div>
      <div className="reader-actions">
        <div className="reader-action main">
          <IconBtn icon="scan" label="קריאה מלאה של ההיתר" className="primary" disabled={!aiAvailable || !!busy} onClick={fullRead} />
          <ol>
            <li>
              <b>מתי:</b> בפעם הראשונה, או אחרי העלאת היתר חדש.
            </li>
            <li>
              <b>מה קורה:</b> כל הפעולות למטה ברצף: מיפוי, מבנה, גבהים, מידות ובנייה.
            </li>
            <li>
              <b>זמן:</b> דקה עד שלוש.
            </li>
          </ol>
        </div>
        <div className="reader-action">
          <IconBtn icon="layers" label="מיפוי הגיליון" disabled={!aiAvailable || !!busy} onClick={() => run(async () => void (await doMap()), 'מיפוי הגיליון הסתיים')} />
          <ol>
            <li>מחלק את הגיליון לשרטוטים נפרדים: תוכניות, חזיתות, חתכים, תשריט.</li>
            <li>מזהה כותרת וקנה מידה לכל שרטוט, ומשם בוחרים את <b>שרטוט העבודה</b>.</li>
            <li>לא משנה את התוכנית או את המודל.</li>
          </ol>
        </div>
        {work && (
          <>
            <div className="reader-action">
              <IconBtn icon="plan" label="קריאת מבנה וגינה" disabled={!!busy} onClick={() => run(() => doStructure(work), 'קריאת המבנה הסתיימה')} />
              <ol>
                <li>קוראת משרטוט העבודה את <b>קו הבית, הפתחים, גבול המגרש, אזורי הגינה, העצים והמפלסים</b>.</li>
                <li>ממלאת את כיוון הצפון ושטח המגרש בפרטי הפרויקט.</li>
                <li>לא בונה אלמנטים. בשביל זה: בנייה מחדש.</li>
              </ol>
            </div>
            <div className="reader-action">
              <IconBtn icon="heights" label="קריאת גבהים" disabled={!!busy} onClick={() => run(() => doHeights(drawings), 'קריאת הגבהים הסתיימה')} />
              <ol>
                <li>קוראת מהחתכים והחזיתות את <b>±0.00, גובה הקומות והגג</b>.</li>
                <li>משפיעה על הגובה במודל ועל המפלסים בפרטי הפרויקט.</li>
              </ol>
            </div>
            <div className="reader-action">
              <IconBtn icon="build" label="בניית הבית בתלת-ממד" disabled={!!busy} onClick={() => run(async () => void buildElements(), 'בניית הבית')} />
              <ol>
                <li>בונה את הבית, הפתחים, גבול המגרש ואזורי הגינה מהקריאה האחרונה. כשחסר קנה מידה, הוא נקבע מהמידות הכתובות.</li>
                <li>
                  <b>מחליפה</b> את מה שנבנה אוטומטית קודם, כך שאין בית על בית.
                </li>
                <li>מה ששרטטת בעצמך נשאר.</li>
              </ol>
            </div>
          </>
        )}
      </div>
      {result && (
        <Modal
          title={result.title}
          onClose={() => setResult(null)}
          actions={
            <>
              {nextStep && (
                <Link className="btn primary" to={`../${nextStep.to}`}>
                  {nextStep.t}
                </Link>
              )}
              {nextStep?.to !== 'model' && (
                <Link className="btn" to="../model">
                  למודל
                </Link>
              )}
              <Link className="btn" to="../plan">
                לתוכנית
              </Link>
            </>
          }
        >
          <ol className="steps-list" data-testid="reader-result">
            {result.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        </Modal>
      )}

      {busy && <Loading text={busy} />}
      {error && (
        <div className="notice danger" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
      {log.length > 0 && (
        <ol className="muted" style={{ fontSize: 14, margin: '10px 0 0', paddingInlineStart: 20 }} data-testid="reader-log">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
      )}

      {drawings.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="h-section" style={{ fontSize: 17, marginBottom: 8 }}>
            שרטוטים בגיליון ({drawings.length})
          </div>
          <div className="pages">
            {drawings.map((d) => (
              <div key={d.id} className={`page-thumb ${d.id === permit.workDrawingId ? 'sel' : ''}`} data-testid="drawing-card">
                {thumbs[d.id] ? <img src={thumbs[d.id]} alt={d.title} /> : <div className="skeleton" style={{ aspectRatio: '1/1.1' }} />}
                <div className="meta">
                  <div style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{d.title || DRAWING_KIND_TEXT[d.kind]}</div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="mono muted">עמוד {d.page}</span>
                    <span className="mono muted">{d.scaleDen ? `1:${d.scaleDen}` : 'ללא קנ"מ'}</span>
                  </div>
                  <select
                    className="input"
                    value={d.kind}
                    onChange={(e) => setPermit((p) => ({ ...p, drawings: (p.drawings ?? []).map((x) => (x.id === d.id ? { ...x, kind: e.target.value as DrawingKind } : x)) }))}
                    aria-label={`סוג השרטוט ${d.title}`}
                  >
                    {(Object.keys(DRAWING_KIND_TEXT) as DrawingKind[]).map((k) => (
                      <option key={k} value={k}>
                        {DRAWING_KIND_TEXT[k]}
                      </option>
                    ))}
                  </select>
                  {d.id === permit.workDrawingId ? (
                    <span className="lbl measured" style={{ justifySelf: 'start' }}>
                      שרטוט העבודה
                    </span>
                  ) : (
                    <button className="btn small" onClick={() => useDrawing(d)}>
                      עבודה על שרטוט זה
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <Link className="btn ghost" to="../dims">
              מידות השרטוט
            </Link>
          </div>
        </div>
      )}

      {s && (
        <div className="notice info" style={{ marginTop: 14 }}>
          קריאת מבנה: {s.units.length} יחידות, {s.openings.length} פתחים, {s.zones.length} אזורי גינה, {s.plot.length ? 'גבול מגרש' : 'בלי גבול מגרש'}, {s.trees.length} עצים. צפון ב-
          {Math.round(s.northDeg)} מעלות מכיוון מעלה הגיליון.
        </div>
      )}

      {b && (
        <div style={{ marginTop: 14 }} data-testid="building-card">
          <div className="h-section" style={{ fontSize: 17, marginBottom: 8 }}>
            הבניין בגובה
          </div>
          <div className="form-grid">
            <div className="stat">
              <span className="k">±0.00 במפלס מוחלט</span>
              <span className="numwrap">
                <span className="num">{base ? base.toFixed(2) : 'לא נקרא'}</span>
                {base && <Tag label="estimated" />}
              </span>
            </div>
            <NumField label="גובה קומת הקרקע (מ')" value={b.groundHeight} onChange={(v) => v > 1.5 && updateProject(project.id, (p) => ({ ...p, building: { ...b, groundHeight: v } }))} />
            <NumField label="תחילת הגג (מ')" value={b.eaveRel ?? 0} onChange={(v) => updateProject(project.id, (p) => ({ ...p, building: { ...b, eaveRel: v || null } }))} />
            <NumField label="רכס הגג (מ')" value={b.ridgeRel ?? 0} onChange={(v) => updateProject(project.id, (p) => ({ ...p, building: { ...b, ridgeRel: v || null } }))} />
            <label className="field">
              <span>גג</span>
              <select className="input" value={b.roofType} onChange={(e) => updateProject(project.id, (p) => ({ ...p, building: { ...b, roofType: e.target.value as Building['roofType'] } }))}>
                {Object.entries(ROOF_TEXT).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ marginTop: 10 }}>
            <DataTable
              testId="levels-table"
              caption="גבהים מההיתר"
              rows={uniqLevels(b.levels).slice(0, 40).map((l, i) => ({ ...l, key: `${i}` }))}
              rowKey={(l) => l.key}
              defaultSort={{ key: 'rel', dir: 'asc' }}
              selectable={false}
              groups={[
                { key: 'meaning', label: 'משמעות', value: (l) => MEANING_TEXT[l.meaning] ?? l.meaning },
                { key: 'drawing', label: 'שרטוט', value: (l) => l.drawing },
              ]}
              cols={[
                { key: 'text', label: 'סימון', sort: (l) => l.text, render: (l) => <span className="mono">{l.text}</span> },
                {
                  key: 'rel',
                  label: 'גובה יחסי',
                  sort: (l) => l.rel,
                  render: (l) => (
                    <span className="numwrap">
                      <span className="num">{l.rel >= 0 ? '+' : ''}{l.rel.toFixed(2)}</span>
                      <Tag label="estimated" />
                    </span>
                  ),
                },
                { key: 'abs', label: 'מוחלט', sort: (l) => l.abs ?? null, render: (l) => <span className="num">{l.abs ? l.abs.toFixed(2) : ''}</span> },
                { key: 'meaning', label: 'משמעות', sort: (l) => MEANING_TEXT[l.meaning] ?? l.meaning, render: (l) => MEANING_TEXT[l.meaning] ?? l.meaning },
                { key: 'drawing', label: 'שרטוט', sort: (l) => l.drawing, render: (l) => <span className="muted">{l.drawing}{l.count > 1 ? ` ועוד ${l.count - 1}` : ''}</span> },
              ]}
            />
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            גבהים ובטיחות מבנית: דורש מהנדס מוסמך. הקריאה מיועדת לתכנון הגינה ולהמחשה בלבד.
          </div>
        </div>
      )}
    </div>
  )
}

// אותו גובה באותה משמעות מכמה שרטוטים מוצג פעם אחת, עם מספר המקורות
function uniqLevels(levels: Building['levels']) {
  const m = new Map<string, Building['levels'][number] & { count: number }>()
  for (const l of levels) {
    const k = `${l.meaning}:${l.rel.toFixed(2)}`
    const e = m.get(k)
    if (e) {
      e.count++
      if (!e.abs && l.abs) e.abs = l.abs
    } else m.set(k, { ...l, count: 1 })
  }
  return [...m.values()].sort((a, b) => a.rel - b.rel)
}
