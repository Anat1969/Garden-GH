// מידות בתוכנית כמו בתוכנת שרטוט, בארבע שיטות:
// 1. אלמנטים: אורך, רוחב, שטח וגובה לכל אלמנט.
// 2. שרשראות: קווי מידה בצידי התוכנית, לכל קצה של אלמנט, וסך הכל.
// 3. מרחקים: מהאלמנט הנבחר לאלמנטים הקרובים בארבעה כיוונים.
// 4. מדידה חופשית: לחיצות על התוכנית, אורך כל קטע, סך הכל ושטח.
import type { Element, Pt } from '../lib/types'
import { LABEL_TEXT } from '../lib/types'
import { fmtNum, polyLength, surfaceArea } from '../lib/bom'
import { boundsOf } from '../lib/elementGeom'
import { polyArea } from '../lib/geom'

export type DimMode = 'elements' | 'chains' | 'between' | 'measure'
export const DIM_MODES: { id: DimMode; t: string; d: string }[] = [
  { id: 'elements', t: 'אלמנטים', d: 'אורך, רוחב, שטח וגובה לכל אלמנט' },
  { id: 'chains', t: 'שרשראות', d: 'קווי מידה בצידי התוכנית, כמו בשרטוט' },
  { id: 'between', t: 'מרחקים', d: 'מהאלמנט הנבחר לקרובים אליו' },
  { id: 'measure', t: 'מדידה חופשית', d: 'לחיצות על התוכנית: אורך, סך הכל ושטח' },
]

const INK = '#1d2120'
const DIM = '#3b5d7a'

function Txt({ x, y, k, text, color = INK, rot = 0, size = 11 }: { x: number; y: number; k: number; text: string; color?: string; rot?: number; size?: number }) {
  return (
    <text
      x={x}
      y={y}
      fontSize={k * size}
      textAnchor="middle"
      dominantBaseline="middle"
      fill={color}
      stroke="#fff"
      strokeWidth={k * 3.2}
      paintOrder="stroke"
      transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}
      style={{ fontFamily: 'IBM Plex Sans Hebrew, sans-serif' }}
      pointerEvents="none"
    >
      {text}
    </text>
  )
}

// קו מידה בין שתי נקודות, עם שנתות אלכסוניות וטקסט באמצע
export function DimLine({ a, b, k, text, color = DIM }: { a: Pt; b: Pt; k: number; text?: string; color?: string }) {
  const L = Math.hypot(b.x - a.x, b.y - a.y)
  if (L < 0.02) return null
  const ux = (b.x - a.x) / L
  const uy = (b.y - a.y) / L
  const t = k * 5
  const tick = (p: Pt) => <line x1={p.x - (ux - uy) * t} y1={p.y - (uy + ux) * t} x2={p.x + (ux - uy) * t} y2={p.y + (uy + ux) * t} stroke={color} strokeWidth={k * 1.6} />
  const mid = { x: (a.x + b.x) / 2 - uy * k * 9, y: (a.y + b.y) / 2 + ux * k * 9 }
  let rot = (Math.atan2(uy, ux) * 180) / Math.PI
  if (rot > 90) rot -= 180
  if (rot < -90) rot += 180
  const showText = L > k * 30
  return (
    <g pointerEvents="none">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={k * 1} />
      {tick(a)}
      {tick(b)}
      {showText && <Txt x={mid.x} y={mid.y} k={k} text={text ?? fmtNum(L)} color={color} rot={rot} size={10} />}
    </g>
  )
}

// תגית מידה לחיצה: רקע לבן, מסגרת כשהיא שייכת לאלמנט הנבחר. לחיצה בוחרת את מה שהיא מודדת
const tagSize = (lines: string[], k: number) => {
  const fs = k * 10.5
  return { fs, w: Math.max(...lines.map((l, i) => l.length * (i ? 0.52 : 0.58))) * fs + k * 10, h: fs * (1.2 + (lines.length - 1) * 1.05) + k * 4 }
}

function Tag2({ x, y, k, lines, color, sel, rot = 0, onPick }: { x: number; y: number; k: number; lines: string[]; color: string; sel: boolean; rot?: number; onPick?: () => void }) {
  const { fs, w, h } = tagSize(lines, k)
  return (
    <g
      className="dim-tag"
      transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}
      onPointerDown={
        onPick
          ? (ev) => {
              ev.stopPropagation()
              onPick()
            }
          : undefined
      }
      style={{ cursor: onPick ? 'pointer' : undefined }}
    >
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={k * 3} fill="#fff" fillOpacity={0.92} stroke={sel ? '#b0522d' : color} strokeOpacity={sel ? 1 : 0.35} strokeWidth={k * (sel ? 1.6 : 0.8)} />
      {lines.map((l, i) => (
        <text key={i} x={x} y={y - h / 2 + k * 2 + fs * 0.6 + i * fs * 1.05} fontSize={i ? fs * 0.86 : fs} fontWeight={i ? 400 : 600} textAnchor="middle" dominantBaseline="middle" fill={sel ? '#b0522d' : color} opacity={i ? 0.8 : 1} style={{ fontFamily: 'IBM Plex Sans Hebrew, sans-serif' }} pointerEvents="none">
          {l}
        </text>
      ))}
    </g>
  )
}

// קו מידה מקביל לאלמנט, מוסט לצד, עם קווי עזר אל הקצוות שנמדדו
function OffsetDim({ a, b, off, k, color }: { a: Pt; b: Pt; off: number; k: number; color: string }) {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const nx = (-(b.y - a.y) / L) * off
  const ny = ((b.x - a.x) / L) * off
  const A = { x: a.x + nx, y: a.y + ny }
  const B = { x: b.x + nx, y: b.y + ny }
  return (
    <g pointerEvents="none">
      <line x1={a.x + nx * 0.2} y1={a.y + ny * 0.2} x2={A.x + nx * 0.2} y2={A.y + ny * 0.2} stroke={color} strokeWidth={k * 0.6} opacity={0.7} />
      <line x1={b.x + nx * 0.2} y1={b.y + ny * 0.2} x2={B.x + nx * 0.2} y2={B.y + ny * 0.2} stroke={color} strokeWidth={k * 0.6} opacity={0.7} />
      <DimLine a={A} b={B} k={k} color={color} text="" />
    </g>
  )
}

// 1. אלמנטים: כל מידה מחוברת למה שהיא מודדת. קיר וגדר: קו מידה מקביל. משטח: תגית שטח במרכזו. לחיצה בוחרת
export function DimsElements({ elements, k, selected, onPick }: { elements: Element[]; k: number; selected?: string | null; onPick?: (id: string) => void }) {
  // בלי חפיפה: כל תגית תופסת מלבן. תגית שנוגעת בתגית קודמת לא מוצגת (הנבחר תמיד מוצג)
  const placed: { x: number; y: number; w: number; h: number }[] = []
  const free = (id: string, x: number, y: number, lines: string[], rot = 0) => {
    const t = tagSize(lines, k)
    const vertical = Math.abs(Math.abs(rot) - 90) < 30
    const w = (vertical ? t.h : t.w) + k * 4
    const h = (vertical ? t.w : t.h) + k * 4
    if (id !== selected && placed.some((p) => Math.abs(p.x - x) * 2 < p.w + w && Math.abs(p.y - y) * 2 < p.h + h)) return false
    placed.push({ x, y, w, h })
    return true
  }
  const rank = (e: Element) => (e.id === selected ? 0 : e.kind === 'wall' && e.scope === 'house' ? 2 : 1)
  const ordered = [...elements].sort((a, b) => rank(a) - rank(b) || (b.kind === 'surface' ? surfaceArea(b) : 0) - (a.kind === 'surface' ? surfaceArea(a) : 0))
  return (
    <g data-testid="plan-dims">
      {ordered.map((e) => {
        const sel = e.id === selected
        const tag = LABEL_TEXT[e.label]
        const pick = onPick ? () => onPick(e.id) : undefined
        if (e.kind === 'wall' || e.kind === 'fence') {
          const L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1)
          // קירות הבית אחרונים בעדיפות: מוצגים רק כשיש להם מקום פנוי
          if (!sel && (L < 1 || (e.kind === 'wall' && e.scope === 'house' && L < 2.5))) return null
          const off = (e.kind === 'wall' ? e.thickness / 2 : 0) + k * 14
          const ang = Math.atan2(e.y2 - e.y1, e.x2 - e.x1)
          const nx = -Math.sin(ang) * (off + k * 9)
          const ny = Math.cos(ang) * (off + k * 9)
          const x = (e.x1 + e.x2) / 2 + nx
          const y = (e.y1 + e.y2) / 2 + ny
          let rot = (ang * 180) / Math.PI
          if (rot > 90) rot -= 180
          if (rot < -90) rot += 180
          const wl = [`${fmtNum(L)} מ'`, `גובה ${fmtNum(e.height)} · ${tag}`]
          if (!free(e.id, x, y, wl, rot)) return null
          const color = sel ? '#b0522d' : DIM
          return (
            <g key={e.id}>
              <OffsetDim a={{ x: e.x1, y: e.y1 }} b={{ x: e.x2, y: e.y2 }} off={off} k={k} color={color} />
              <Tag2 x={x} y={y} k={k} rot={rot} lines={wl} color={color} sel={sel} onPick={pick} />
            </g>
          )
        }
        if (e.kind === 'surface') {
          const c = e.poly ? e.poly.reduce((a, p) => ({ x: a.x + p.x / e.poly!.length, y: a.y + p.y / e.poly!.length }), { x: 0, y: 0 }) : { x: e.x + e.w / 2, y: e.y + e.d / 2 }
          const lvl = `${e.level >= 0 ? '+' : ''}${fmtNum(e.level)}`
          const sl = [`${fmtNum(surfaceArea(e))} מ"ר`, `${fmtNum(e.w)}×${fmtNum(e.d)} · מפלס ${lvl}`, tag]
          if (!sel && surfaceArea(e) < 2) return null
          if (!free(e.id, c.x, c.y, sl)) return null
          return (
            <g key={e.id}>
              {sel && <rect x={e.x} y={e.y} width={e.w} height={e.d} fill="none" stroke="#b0522d" strokeWidth={k * 1.2} strokeDasharray={`${k * 5} ${k * 3}`} pointerEvents="none" />}
              {sel && <OffsetDim a={{ x: e.x, y: e.y }} b={{ x: e.x + e.w, y: e.y }} off={-k * 12} k={k} color="#b0522d" />}
              {sel && <OffsetDim a={{ x: e.x + e.w, y: e.y }} b={{ x: e.x + e.w, y: e.y + e.d }} off={-k * 12} k={k} color="#b0522d" />}
              <Tag2 x={c.x} y={c.y} k={k} lines={sl} color="#2f5d4a" sel={sel} onPick={pick} />
            </g>
          )
        }
        if (e.kind === 'line') {
          const m = e.pts[Math.floor(e.pts.length / 2)]
          const ll = [`${fmtNum(polyLength(e.pts))} מ'`, `${e.type === 'path' ? `רוחב ${fmtNum(e.width)}` : `גובה ${fmtNum(e.height)}`} · ${tag}`]
          if (!m || !free(e.id, m.x, m.y - k * 16, ll)) return null
          return <Tag2 key={e.id} x={m.x} y={m.y - k * 16} k={k} lines={ll} color="#2f5d4a" sel={sel} onPick={pick} />
        }
        if (e.kind === 'object') {
          const y = e.y + e.d / 2 + k * 16
          const ol = [`${fmtNum(e.w)}×${fmtNum(e.d)}`, `גובה ${fmtNum(e.h)} · ${tag}`]
          if (!free(e.id, e.x, y + k * 6, ol)) return null
          return (
            <g key={e.id}>
              <OffsetDim a={{ x: e.x - e.w / 2, y: e.y + e.d / 2 }} b={{ x: e.x + e.w / 2, y: e.y + e.d / 2 }} off={k * 5} k={k} color={sel ? '#b0522d' : '#48546b'} />
              <Tag2 x={e.x} y={y + k * 6} k={k} lines={ol} color="#48546b" sel={sel} onPick={pick} />
            </g>
          )
        }
        return null
      })}
    </g>
  )
}

const merge = (vals: number[], gap: number) => {
  const s = [...vals].sort((a, b) => a - b)
  return s.filter((v, i) => i === 0 || v - s[i - 1] > gap)
}

// 2. שרשראות בצידי התוכנית: כל קצה של אלמנט (משטח, פריט, בית), וסך הכל
export function DimsChains({ elements, k }: { elements: Element[]; k: number }) {
  const els = elements.filter((e) => e.kind !== 'sketch' && e.kind !== 'opening')
  const all = boundsOf(els)
  if (!all) return null
  const xs: number[] = []
  const ys: number[] = []
  for (const e of els) {
    if (e.kind === 'fence') continue
    const b = boundsOf([e])
    if (!b || b.maxX - b.minX < 0.3) continue
    xs.push(b.minX, b.maxX)
    ys.push(b.minY, b.maxY)
  }
  const gap = Math.max(0.4, k * 26)
  const cx = merge([all.minX, ...xs, all.maxX], gap)
  const cy = merge([all.minY, ...ys, all.maxY], gap)
  const off1 = k * 34
  const off2 = k * 62
  const yB1 = all.maxY + off1
  const yB2 = all.maxY + off2
  const xR1 = all.maxX + off1
  const xR2 = all.maxX + off2
  const ext = (p: Pt, q: Pt, key: string) => <line key={key} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={DIM} strokeWidth={k * 0.6} strokeDasharray={`${k * 3} ${k * 3}`} opacity={0.6} pointerEvents="none" />
  return (
    <g data-testid="plan-chains">
      {cx.map((x, i) => ext({ x, y: all.maxY }, { x, y: yB2 }, `ex${i}`))}
      {cy.map((y, i) => ext({ x: all.maxX, y }, { x: xR2, y }, `ey${i}`))}
      {cx.slice(1).map((x, i) => (
        <DimLine key={`cx${i}`} a={{ x: cx[i], y: yB1 }} b={{ x, y: yB1 }} k={k} />
      ))}
      <DimLine a={{ x: all.minX, y: yB2 }} b={{ x: all.maxX, y: yB2 }} k={k} color={INK} />
      {cy.slice(1).map((y, i) => (
        <DimLine key={`cy${i}`} a={{ x: xR1, y: cy[i] }} b={{ x: xR1, y }} k={k} />
      ))}
      <DimLine a={{ x: xR2, y: all.minY }} b={{ x: xR2, y: all.maxY }} k={k} color={INK} />
    </g>
  )
}

// 3. מרחקים מהאלמנט הנבחר לאלמנטים הקרובים, בארבעה כיוונים
export function DimsBetween({ el, elements, k }: { el: Element; elements: Element[]; k: number }) {
  const b = boundsOf([el])
  if (!b) return null
  const others = elements.filter((e) => e.id !== el.id && e.kind !== 'sketch' && e.kind !== 'opening').map((e) => ({ e, b: boundsOf([e]) })).filter((o) => o.b) as { e: Element; b: NonNullable<ReturnType<typeof boundsOf>> }[]
  const cy = (b.minY + b.maxY) / 2
  const cx = (b.minX + b.maxX) / 2
  const lines: { a: Pt; c: Pt }[] = []
  // ימינה ושמאלה: אלמנטים שחופפים בטווח האנכי
  let r = Infinity
  let l = Infinity
  let d = Infinity
  let u = Infinity
  for (const o of others) {
    const ov = o.b.minY < b.maxY && o.b.maxY > b.minY
    const oh = o.b.minX < b.maxX && o.b.maxX > b.minX
    if (ov && o.b.minX >= b.maxX - 0.01) r = Math.min(r, o.b.minX - b.maxX)
    if (ov && o.b.maxX <= b.minX + 0.01) l = Math.min(l, b.minX - o.b.maxX)
    if (oh && o.b.minY >= b.maxY - 0.01) d = Math.min(d, o.b.minY - b.maxY)
    if (oh && o.b.maxY <= b.minY + 0.01) u = Math.min(u, b.minY - o.b.maxY)
  }
  if (Number.isFinite(r) && r > 0.02) lines.push({ a: { x: b.maxX, y: cy }, c: { x: b.maxX + r, y: cy } })
  if (Number.isFinite(l) && l > 0.02) lines.push({ a: { x: b.minX - l, y: cy }, c: { x: b.minX, y: cy } })
  if (Number.isFinite(d) && d > 0.02) lines.push({ a: { x: cx, y: b.maxY }, c: { x: cx, y: b.maxY + d } })
  if (Number.isFinite(u) && u > 0.02) lines.push({ a: { x: cx, y: b.minY - u }, c: { x: cx, y: b.minY } })
  return (
    <g data-testid="plan-between">
      {lines.map((ln, i) => (
        <DimLine key={i} a={ln.a} b={ln.c} k={k} color="#b0522d" />
      ))}
    </g>
  )
}

// 4. מדידה חופשית
export function MeasureDraw({ pts, hover, k }: { pts: Pt[]; hover: Pt | null; k: number }) {
  const all = hover && pts.length ? [...pts, hover] : pts
  if (!all.length) return null
  const total = polyLength(all)
  const area = all.length >= 3 ? Math.abs(polyArea(all)) : 0
  const last = all[all.length - 1]
  return (
    <g data-testid="measure" pointerEvents="none">
      {all.length >= 3 && <polygon points={all.map((p) => `${p.x},${p.y}`).join(' ')} fill="#b0522d" fillOpacity={0.08} stroke="none" />}
      {all.slice(1).map((p, i) => (
        <DimLine key={i} a={all[i]} b={p} k={k} color="#b0522d" />
      ))}
      {all.map((p, i) => (
        <circle key={`p${i}`} cx={p.x} cy={p.y} r={k * 4} fill="#b0522d" />
      ))}
      <Txt x={last.x} y={last.y - k * 22} k={k} text={`סך הכל ${fmtNum(total)} מ'${area ? ` · שטח ${fmtNum(area)} מ"ר` : ''}`} color="#b0522d" size={12} />
    </g>
  )
}
