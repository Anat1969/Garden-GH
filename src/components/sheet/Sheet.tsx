// גיליון הדפסה בסגנון שרטוט אדריכלי-ציורי. הפריסה נבנית במילימטרים על 297×420 (המידות שבמפרט)
// ומוקטנת יחסית לדף A4 לאורך (אותו יחס צלעות), כך שהיא נכונה גם בהדפסת A3.
import { useLayoutEffect, useRef } from 'react'
import type { SheetModel } from '../../lib/sheet/types'
import { PlanSvg, planViewBox } from './PlanSvg'

export const PAGE = { w: 297, h: 420, m: 10, cols: 12, gap: 4 }
const COL = (PAGE.w - PAGE.m * 2 - PAGE.gap * (PAGE.cols - 1)) / PAGE.cols
// מיקום בעמודות מימין: עמודה 1 היא הימנית
export const colX = (from: number, span: number) => {
  const right = PAGE.w - PAGE.m - (from - 1) * (COL + PAGE.gap)
  const width = span * COL + (span - 1) * PAGE.gap
  return { left: right - width, width }
}

const f2 = (n: number | null) => (n === null || !Number.isFinite(n) ? 'לא צוין' : n.toFixed(2))

export function sheetCss(fontBase: string) {
  return `
@font-face { font-family: 'Heebo'; font-weight: 400; src: url('${fontBase}heebo-hebrew-400-normal.woff2') format('woff2'); unicode-range: U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F; }
@font-face { font-family: 'Heebo'; font-weight: 400; src: url('${fontBase}heebo-latin-400-normal.woff2') format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
@font-face { font-family: 'Heebo'; font-weight: 500; src: url('${fontBase}heebo-hebrew-500-normal.woff2') format('woff2'); unicode-range: U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F; }
@font-face { font-family: 'Heebo'; font-weight: 500; src: url('${fontBase}heebo-latin-500-normal.woff2') format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
@font-face { font-family: 'Heebo'; font-weight: 700; src: url('${fontBase}heebo-hebrew-700-normal.woff2') format('woff2'); unicode-range: U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F; }
@font-face { font-family: 'Heebo'; font-weight: 700; src: url('${fontBase}heebo-latin-700-normal.woff2') format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
@font-face { font-family: 'Heebo'; font-weight: 800; src: url('${fontBase}heebo-hebrew-800-normal.woff2') format('woff2'); unicode-range: U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F; }
@font-face { font-family: 'Heebo'; font-weight: 800; src: url('${fontBase}heebo-latin-800-normal.woff2') format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
@font-face { font-family: 'Frank Ruhl Libre'; font-weight: 400; src: url('${fontBase}frank-ruhl-libre-hebrew-400-normal.woff2') format('woff2'); unicode-range: U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F; }
@font-face { font-family: 'Frank Ruhl Libre'; font-weight: 400; src: url('${fontBase}frank-ruhl-libre-latin-400-normal.woff2') format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
@font-face { font-family: 'Roboto Mono'; font-weight: 400; src: url('${fontBase}roboto-mono-latin-400-normal.woff2') format('woff2'); }
@font-face { font-family: 'Roboto Mono'; font-weight: 500; src: url('${fontBase}roboto-mono-latin-500-normal.woff2') format('woff2'); }
@page { size: A4 portrait; margin: 3mm; }
.sheet-page { width: 204mm; height: 291mm; position: relative; overflow: hidden; margin: 0 auto; background: #f5f2eb; }
.sheet { position: absolute; top: 0; right: 0; width: ${PAGE.w}mm; height: ${PAGE.h}mm; transform-origin: top right; background: #f5f2eb; color: #2b2b2b; font-family: 'Heebo', 'Assistant', sans-serif; direction: rtl; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet * { box-sizing: border-box; }
.sh-box { position: absolute; overflow: hidden; }
.sh-rule { position: absolute; height: 0; border-top: 0.35mm solid #3a3a3a; }
.sh-rule.thin { border-top-width: 0.15mm; }
.num, .sh-num { font-family: 'Roboto Mono', 'Inter', monospace; direction: ltr; unicode-bidi: isolate; }
.sh-title { font-weight: 800; font-size: 30pt; line-height: 1.05; margin: 0; letter-spacing: -0.3pt; }
.sh-sub { font-weight: 500; font-size: 13pt; margin-top: 2mm; color: #3a3a3a; }
.sh-addr { font-size: 9.5pt; margin-top: 2.5mm; color: #3a3a3a; }
.sh-studio { display: grid; grid-template-columns: auto 1fr; gap: 3mm; align-items: center; }
.sh-studio img { height: 15mm; max-width: 22mm; object-fit: contain; mix-blend-mode: multiply; }
.sh-studio b { display: block; font-size: 11pt; }
.sh-studio span { display: block; font-size: 8.5pt; color: #3a3a3a; }
.sh-dno { font-size: 8.5pt; text-align: left; line-height: 1.6; }
.sh-dno b { font-size: 12pt; }
.sh-label { font-size: 8pt; font-weight: 700; letter-spacing: 0.4pt; color: #3a3a3a; }
.sh-render img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.sh-render svg.leaders { position: absolute; inset: 0; width: 100%; height: 100%; }
.sh-callout { position: absolute; font-size: 9pt; font-weight: 500; background: rgba(245,242,235,0.92); padding: 0.6mm 1.6mm; border-inline-start: 0.5mm solid #2b2b2b; white-space: nowrap; line-height: 1.25; }
.sh-chips { display: grid; grid-template-rows: auto repeat(5, 1fr); gap: 2mm; }
.sh-chip { display: grid; grid-template-columns: 13mm 1fr; gap: 2mm; align-items: center; min-height: 0; }
.sh-chip i { display: block; width: 13mm; height: 13mm; border: 0.2mm solid #3a3a3a; }
.sh-chip b { display: block; font-size: 8.5pt; line-height: 1.2; }
.sh-chip span { display: block; font-size: 7pt; color: #3a3a3a; line-height: 1.25; }
.sh-chip .num { font-size: 7pt; text-align: right; }
.sh-plan-title { font-size: 10pt; font-weight: 700; display: flex; justify-content: space-between; align-items: baseline; border-bottom: 0.15mm solid #3a3a3a; padding-bottom: 1mm; margin-bottom: 2mm; }
.sh-plan-title .num { font-size: 8.5pt; font-weight: 400; }
.plan-svg { display: block; margin: 0 auto; overflow: hidden; }
.plan-svg .pl-name { font-family: 'Heebo', sans-serif; font-weight: 500; fill: #2b2b2b; }
.plan-svg .pl-num { font-family: 'Roboto Mono', monospace; fill: #2b2b2b; }
.plan-svg .pl-dim { fill: #5a5a5a; }
.sh-iso img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sh-cap { font-size: 8.5pt; font-weight: 700; margin-bottom: 1.2mm; }
.sh-details { display: grid; grid-template-columns: 1fr 1fr 1fr; grid-auto-flow: column; grid-template-rows: repeat(4, auto); gap: 0 3mm; font-size: 7.5pt; line-height: 1.55; align-content: start; }
.sh-details div { display: flex; justify-content: space-between; gap: 2mm; border-bottom: 0.1mm solid #cfc8b8; }
.sh-details dt { color: #5a5a5a; }
.sh-details dd { margin: 0; font-weight: 500; text-align: left; }
.sh-haiku { font-family: 'Frank Ruhl Libre', serif; font-size: 12pt; line-height: 1.55; text-align: center; white-space: pre-line; display: grid; place-content: center; }
.sh-post { font-size: 8pt; line-height: 1.5; white-space: pre-line; }
.sh-notes { font-size: 7.5pt; color: #3a3a3a; display: flex; align-items: center; }
@media print { html, body { background: #f5f2eb !important; margin: 0; } }
`
}

export interface SheetImages {
  main: string | null
  iso: string | null
  anchors: { x: number; y: number }[]
}

// מיקום התוויות: בצד הקרוב לנקודה, מסודרות מלמעלה למטה בלי חפיפה
function layoutCallouts(anchors: { x: number; y: number }[], H: number) {
  const items = anchors.map((a, i) => ({ i, a, side: a.x < 0.5 ? 'left' : 'right', y: a.y * H }))
  for (const side of ['left', 'right']) {
    const col = items.filter((t) => t.side === side).sort((p, q) => p.y - q.y)
    let last = -Infinity
    for (const t of col) {
      t.y = Math.min(H - 8, Math.max(t.y - 4, last + 9, 3))
      last = t.y
    }
  }
  return items
}

export function Sheet({ model, images, scale = 204 / PAGE.w }: { model: SheetModel; images: SheetImages; scale?: number }) {
  const m = model.meta
  const top = PAGE.m
  const rootRef = useRef<HTMLDivElement>(null)
  // התאמת טקסט: כל טקסט נשאר בתוך התיבה שלו. מקטינים גופן עד שאין גלישה
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.querySelectorAll<HTMLElement>('.fit').forEach((el) => {
      let fs = parseFloat(getComputedStyle(el).fontSize)
      for (let i = 0; i < 25 && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1); i++) {
        fs *= 0.95
        el.style.fontSize = `${fs}px`
        el.querySelectorAll<HTMLElement>('*').forEach((c) => (c.style.fontSize = ''))
      }
    })
  })

  const header = colX(1, 12)
  const studio = colX(1, 3)
  const titleBox = colX(4, 7)
  const dno = colX(11, 2)
  const render = colX(1, 10)
  const chips = colX(11, 2)
  const plansCols = model.plans.length > 1 ? [colX(1, 6), colX(7, 6)] : [colX(1, 12)]
  const renderTop = 47
  const renderH = 126
  const callH = renderH
  const placed = layoutCallouts(images.anchors, callH)
  // [שם, ערך, יחידה, מספר]: מספרים משמאל לימין, והיחידה בעברית משמאלם
  const details: [string, string, string?, boolean?][] = [
    ['שם', m.title],
    ['כתובת', m.address],
    ['גוש / חלקה', `${m.gush} / ${m.helka}`],
    ['שטח מגרש', f2(m.plotArea), 'מ"ר', true],
    ['שטח בנוי ברוטו', f2(m.builtArea), 'מ"ר', true],
    ['שטח גינה', f2(m.gardenArea), 'מ"ר', true],
    ['שנה', m.year, undefined, true],
    ['מתכנן', m.planner],
    ['קנה מידה', m.scale, undefined, true],
    ['מספר שרטוט', m.drawingNo, undefined, true],
    ['תאריך', m.date, undefined, true],
  ]
  const footR = colX(1, 5)
  const footM = colX(6, 3)
  const footL = colX(9, 4)

  return (
    <div className="sheet-page" data-testid="sheet-page">
      <div className="sheet" ref={rootRef} style={{ transform: `scale(${scale})` }} dir="rtl">
        {/* כותרת */}
        <div className="sh-box sh-studio" style={{ top: `${top}mm`, left: `${studio.left}mm`, width: `${studio.width}mm`, height: '26mm' }}>
          {m.logo ? <img src={m.logo} alt="" /> : <span />}
          <div className="fit" style={{ height: '26mm', overflow: 'hidden', display: 'grid', alignContent: 'center' }}>
            <b>{m.studioName}</b>
            <span>{m.studioAddress}</span>
          </div>
        </div>
        <div className="sh-box fit" style={{ top: `${top}mm`, left: `${titleBox.left}mm`, width: `${titleBox.width}mm`, height: '33mm' }}>
          <h1 className="sh-title">{m.title}</h1>
          <div className="sh-sub">{m.subtitle}</div>
          <div className="sh-addr">{m.address}</div>
        </div>
        <div className="sh-box sh-dno fit" style={{ top: `${top}mm`, left: `${dno.left}mm`, width: `${dno.width}mm`, height: '26mm' }}>
          <div>מספר שרטוט</div>
          <b className="num">{m.drawingNo}</b>
          <div className="num">{m.date}</div>
          <div className="num">{m.scale}</div>
        </div>
        <div className="sh-rule" style={{ top: '45mm', left: `${header.left}mm`, width: `${header.width}mm` }} />

        {/* הדמיה ראשית ותוויות */}
        <div className="sh-box sh-render" style={{ top: `${renderTop}mm`, left: `${render.left}mm`, width: `${render.width}mm`, height: `${renderH}mm` }}>
          {images.main && <img src={images.main} alt="הדמיה ראשית של המבנה והגינה" />}
          <svg className="leaders" viewBox={`0 0 ${render.width} ${renderH}`} preserveAspectRatio="none">
            {placed.map((p) => {
              const lx = p.side === 'left' ? 34 : render.width - 34
              return <polyline key={p.i} points={`${lx},${p.y + 3} ${p.a.x * render.width},${p.a.y * renderH}`} fill="none" stroke="#2b2b2b" strokeWidth={0.18} />
            })}
            {placed.map((p) => (
              <circle key={`c${p.i}`} cx={p.a.x * render.width} cy={p.a.y * renderH} r={0.7} fill="#2b2b2b" />
            ))}
          </svg>
          {placed.map((p) => (
            <div key={p.i} className="sh-callout" style={{ top: `${p.y}mm`, ...(p.side === 'left' ? { left: '2mm' } : { right: '2mm' }), maxWidth: '58mm' }}>
              {model.callouts[p.i]?.text_he}
            </div>
          ))}
        </div>

        {/* לוח חומרים */}
        <div className="sh-box sh-chips" style={{ top: `${renderTop}mm`, left: `${chips.left}mm`, width: `${chips.width}mm`, height: `${renderH}mm` }}>
          <div className="sh-label">לוח חומרים</div>
          {model.chips.slice(0, 5).map((c) => (
            <div key={c.id} className="sh-chip">
              <i style={{ background: c.hex }} />
              <div className="fit" style={{ maxHeight: '21mm', overflow: 'hidden' }}>
                <b>{c.name_he}</b>
                <span lang="en" dir="ltr" style={{ textAlign: 'right' }}>
                  {c.name_en}
                </span>
                <span className="num">{c.hex.toUpperCase()}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="sh-rule thin" style={{ top: '175mm', left: `${header.left}mm`, width: `${header.width}mm` }} />

        {/* תוכניות קומה */}
        {model.plans.map((d, i) => {
          const c = plansCols[i] ?? plansCols[0]
          // קנה מידה עגול: 1:100 כשהתוכנית נכנסת, אחרת הקטן הבא שנכנס
          const availH = 330 - 177 - 10
          const fits = (dd: number) => {
            const v = planViewBox(d, dd / 100)
            return (v.w * 1000) / dd <= c.width && (v.h * 1000) / dd <= availH
          }
          const den = [100, 125, 150, 200, 250, 300, 400, 500, 750, 1000].find(fits) ?? 1000
          const w = (planViewBox(d, den / 100).w * 1000) / den
          return (
            <div key={i} className="sh-box" style={{ top: '177mm', left: `${c.left}mm`, width: `${c.width}mm`, height: '151mm' }}>
              <div className="sh-plan-title">
                <span>{d.title}</span>
                <span style={{ fontSize: '8.5pt', fontWeight: 400 }}>
                  {d.totalArea !== undefined && (
                    <>
                      <bdi className="num">{d.totalArea.toFixed(2)}</bdi> מ"ר ·{' '}
                    </>
                  )}
                  קנה מידה <bdi className="num">1:{den}</bdi>
                </span>
              </div>
              <PlanSvg d={d} north={model.scene.north} widthMm={w} showScale scaleDen={den} />
            </div>
          )
        })}
        <div className="sh-rule thin" style={{ top: '330mm', left: `${header.left}mm`, width: `${header.width}mm` }} />

        {/* הדמיה תלת-ממדית ברוחב מלא */}
        <div className="sh-box" style={{ top: '331.5mm', left: `${header.left}mm`, width: `${header.width}mm`, height: '53mm' }}>
          <div className="sh-cap">תצורת המבנה והגינה, הדמיה ויזואלית</div>
          <div className="sh-iso" style={{ height: '47mm' }}>
            {images.iso && <img src={images.iso} alt="הדמיה תלת-ממדית איזומטרית" />}
          </div>
        </div>
        <div className="sh-rule" style={{ top: '386mm', left: `${header.left}mm`, width: `${header.width}mm` }} />

        {/* תחתית: פרטי פרויקט, הייקו, פוסט */}
        <dl className="sh-box sh-details fit" style={{ top: '388mm', left: `${footR.left}mm`, width: `${footR.width}mm`, height: '16mm', margin: 0 }}>
          {details.map(([k, v, unit, isNum]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>
                {isNum ? <bdi className="num">{v}</bdi> : v}
                {unit ? ` ${unit}` : ''}
              </dd>
            </div>
          ))}
        </dl>
        <div className="sh-box sh-haiku fit" style={{ top: '388mm', left: `${footM.left}mm`, width: `${footM.width}mm`, height: '16mm' }}>
          {model.poem
            .split('\n')
            .slice(0, 3)
            .join('\n')}
        </div>
        <div className="sh-box sh-post fit" style={{ top: '388mm', left: `${footL.left}mm`, width: `${footL.width}mm`, height: '16mm' }}>
          {model.post}
        </div>
        <div className="sh-rule thin" style={{ top: '405mm', left: `${header.left}mm`, width: `${header.width}mm` }} />
        <div className="sh-box sh-notes fit" style={{ top: '405.5mm', left: `${header.left}mm`, width: `${header.width}mm`, height: '4.5mm' }}>
          הדמיה ויזואלית. מידות לפי תוכנית מוגשת, בהערכה. לא לביצוע ללא אישור מהנדס.
        </div>
      </div>
    </div>
  )
}
