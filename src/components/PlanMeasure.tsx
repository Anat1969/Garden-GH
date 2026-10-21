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

// 1. אלמנטים: אורך, רוחב, שטח וגובה
export function DimsElements({ elements, k }: { elements: Element[]; k: number }) {
  const fs = 11
  return (
    <g data-testid="plan-dims">
      {elements.map((e) => {
        const tag = LABEL_TEXT[e.label]
        if (e.kind === 'wall' || e.kind === 'fence') {
          const L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1)
          if (L < 0.5) return null
          return <Txt key={e.id} x={(e.x1 + e.x2) / 2} y={(e.y1 + e.y2) / 2 - fs * k} k={k} text={`${fmtNum(L)}${e.kind === 'wall' ? ` × ${fmtNum(e.thickness)}` : ''} מ' · גובה ${fmtNum(e.height)} · ${tag}`} />
        }
        if (e.kind === 'surface') {
          const c = e.poly ? e.poly.reduce((a, p) => ({ x: a.x + p.x / e.poly!.length, y: a.y + p.y / e.poly!.length }), { x: 0, y: 0 }) : { x: e.x + e.w / 2, y: e.y + e.d / 2 }
          return (
            <g key={e.id}>
              <Txt x={c.x} y={c.y - fs * k * 0.6} k={k} text={`${fmtNum(surfaceArea(e))} מ"ר · ${tag}`} color="#2f5d4a" />
              <Txt x={c.x} y={c.y + fs * k * 0.7} k={k} text={`${fmtNum(e.w)} × ${fmtNum(e.d)} מ' · מפלס ${e.level >= 0 ? '+' : ''}${fmtNum(e.level)}`} color="#48546b" size={10} />
            </g>
          )
        }
        if (e.kind === 'line') {
          const m = e.pts[Math.floor(e.pts.length / 2)]
          return m ? <Txt key={e.id} x={m.x} y={m.y - fs * k} k={k} text={`${fmtNum(polyLength(e.pts))} × ${fmtNum(e.width)} מ'${e.type !== 'path' ? ` · גובה ${fmtNum(e.height)}` : ''} · ${tag}`} color="#2f5d4a" /> : null
        }
        if (e.kind === 'object') return <Txt key={e.id} x={e.x} y={e.y + e.d / 2 + fs * k} k={k} text={`${fmtNum(e.w)} × ${fmtNum(e.d)} · גובה ${fmtNum(e.h)} · ${tag}`} color="#48546b" />
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
