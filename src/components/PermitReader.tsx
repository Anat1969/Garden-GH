import { DataTable } from './DataTable'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Building, Drawing, DrawingKind, Permit, Project } from '../lib/types'
import { DRAWING_KIND_TEXT } from '../lib/types'
import { mapPage, pickGardenDrawing, readHeights, readStructure, renderRegion } from '../lib/permitReader'
import { structureToElements, STRUCT_SRC, baseAbs, isAutoHouse, replaceAuto } from '../lib/structureToElements'
import { PT_TO_M_AT_1 } from '../lib/pdf'
import { polyArea } from '../lib/geom'
import { aiAvailable, readPageWithAi } from '../lib/aiRead'
import { attachLines, mergeDims } from '../lib/dims'
import { getState, setPlanScale, uid, updateProject, updateVariant } from '../lib/store'
import { Loading, Modal, NumField, Tag, toast } from './ui'
import { IconBtn } from './EditIcons'

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
    setPermit((p) => ({ ...p, drawings: all }))
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
    note(`נקראו ${s.units.length} יחידות, ${s.openings.length} פתחים, ${s.zones.length} אזורי גינה, ${s.levels.length} מפלסים, ${s.trees.length} עצים`)
  }

  const doHeights = async (list: Drawing[]) => {
    const targets = list.filter((d) => d.kind === 'section' || d.kind === 'elevation').slice(0, 8)
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

  const buildElements = () => {
    const p = latest()
    const els = structureToElements(p, uid)
    if (!els.length) {
      note('אין קנה מידה או קריאת מבנה, לא נבנו אלמנטים')
      return 0
    }
    const replaced = p.variants.find((v) => v.id === p.activeVariantId)!.elements.filter((e) => isAutoHouse(e) || e.source.startsWith(STRUCT_SRC)).length
    updateVariant(project.id, (v) => ({ ...v, elements: replaceAuto(v.elements, els, true) }))
    note(`נבנו ${els.length} אלמנטים בחלופה הפעילה${replaced ? `, במקום ${replaced} שנבנו קודם` : ''}. כולם "מוערך" עד אישור`)
    return els.length
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
      const list = drawings.length ? drawings : await doMap()
      const g = (work && list.find((d) => d.id === work.id)) ?? pickGardenDrawing(list)
      if (!g) throw new Error('לא נמצאה תוכנית קומת קרקע או פיתוח שטח. אפשר לבחור שרטוט ידנית.')
      useDrawing(g)
      note(`שרטוט העבודה: ${g.title || DRAWING_KIND_TEXT[g.kind]}`)
      await doStructure(g)
      await doHeights(list)
      await doDims(g)
      if (!latest().permit?.scale.metersPerPt) note('אין עדיין קנה מידה. קובעים אותו במסך המידות, ואז בונים את המודל.')
      else buildElements()
    }, 'קריאת ההיתר הסתיימה')

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
              <IconBtn icon="build" label="בנייה מחדש של האלמנטים" disabled={!!busy || !s} onClick={() => run(async () => void buildElements(), 'הבנייה מחדש הסתיימה')} />
              <ol>
                <li>בונה את הבית, הפתחים, גבול המגרש ואזורי הגינה מהקריאה האחרונה.</li>
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
              <Link className="btn primary" to="../plan">
                לתוכנית
              </Link>
              <Link className="btn" to="../model">
                למודל
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
