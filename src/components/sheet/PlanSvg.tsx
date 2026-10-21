// תוכנית קומה נקייה בשרטוט: קירות שחורים עבים, פתחים, שם חדר ושטח, מידות חיצוניות ופנימיות, חץ צפון וסרגל.
// יחידות ה-SVG הן מטרים. ברוחב שווה ל-10 מ"מ למטר הגיליון הוא 1:100.
import type { PlanDrawing, PlanWall, XY } from '../../lib/sheet/types'

const INK = '#2b2b2b'
const LINE = '#3a3a3a'
const f2 = (n: number) => n.toFixed(2)

function wallPoly(w: PlanWall): string {
  const dx = w.b.x - w.a.x
  const dy = w.b.y - w.a.y
  const L = Math.hypot(dx, dy) || 1
  const ux = dx / L
  const uy = dy / L
  const nx = -uy * (w.t / 2)
  const ny = ux * (w.t / 2)
  const e = w.exterior ? w.t / 2 : 0 // סגירת פינות בקירות חוץ
  const a = { x: w.a.x - ux * e, y: w.a.y - uy * e }
  const b = { x: w.b.x + ux * e, y: w.b.y + uy * e }
  return [
    [a.x + nx, a.y + ny],
    [b.x + nx, b.y + ny],
    [b.x - nx, b.y - ny],
    [a.x - nx, a.y - ny],
  ]
    .map((p) => p.join(','))
    .join(' ')
}

function bounds(d: PlanDrawing) {
  const pts: XY[] = [...d.walls.flatMap((w) => [w.a, w.b]), ...d.areas.flatMap((a) => a.poly)]
  if (d.outline) pts.push({ x: d.outline.x, y: d.outline.y }, { x: d.outline.x + d.outline.w, y: d.outline.y + d.outline.h })
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

// קו מידה אופקי או אנכי עם שנתות אלכסוניות וטקסט משמאל לימין
function Dim({ a, b, off, vertical, k }: { a: number; b: number; off: number; vertical?: boolean; k: number }) {
  const L = Math.abs(b - a)
  if (L < 0.05) return null
  const showText = L >= k * 3.4 // מקטע קצר מדי לטקסט: הקו בלי מספר
  const tick = k * 0.6
  const mid = (a + b) / 2
  const fs = k * 1.0
  if (!vertical)
    return (
      <g>
        <line x1={a} y1={off} x2={b} y2={off} stroke={LINE} strokeWidth={k * 0.06} />
        {[a, b].map((x) => (
          <line key={x} x1={x - tick / 2} y1={off + tick / 2} x2={x + tick / 2} y2={off - tick / 2} stroke={INK} strokeWidth={k * 0.12} />
        ))}
        {showText && (
          <text x={mid} y={off - k * 0.35} fontSize={fs} textAnchor="middle" className="pl-num" direction="ltr">
            {f2(L)}
          </text>
        )}
      </g>
    )
  return (
    <g>
      <line x1={off} y1={a} x2={off} y2={b} stroke={LINE} strokeWidth={k * 0.06} />
      {[a, b].map((y) => (
        <line key={y} x1={off - tick / 2} y1={y + tick / 2} x2={off + tick / 2} y2={y - tick / 2} stroke={INK} strokeWidth={k * 0.12} />
      ))}
      {showText && (
        <text x={off - k * 0.35} y={mid} fontSize={fs} textAnchor="middle" className="pl-num" direction="ltr" transform={`rotate(-90 ${off - k * 0.35} ${mid})`}>
          {f2(L)}
        </text>
      )}
    </g>
  )
}

// מסגרת השרטוט: השוליים למידות, לחץ הצפון ולסרגל גדלים עם קנה המידה (q = מכנה / 100)
export function planViewBox(d: PlanDrawing, q = 1) {
  const b = bounds(d)
  return { x: b.x0 - 1.3 * q, y: b.y0 - 1.1 * q, w: b.x1 - b.x0 + 3.6 * q, h: b.y1 - b.y0 + 3.7 * q }
}

export function PlanSvg({ d, north, widthMm, showScale, scaleDen = 100 }: { d: PlanDrawing; north: number; widthMm?: number; showScale?: boolean; scaleDen?: number }) {
  const b = bounds(d)
  const q = scaleDen / 100
  const vb = planViewBox(d, q)
  const k = 0.2 * q // יחידת בסיס לגודל טקסט וקווים, במטרים (2 מ"מ בגיליון בכל קנה מידה)
  const o = d.outline ?? { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }
  const chainS = d.chainS ?? [o.x, o.x + o.w]
  const chainE = d.chainE ?? [o.y, o.y + o.h]
  const yS1 = o.y + o.h + 0.75 * q
  const yS2 = o.y + o.h + 1.45 * q
  const xE1 = o.x + o.w + 0.75 * q
  const xE2 = o.x + o.w + 1.45 * q
  const na = (north * Math.PI) / 180
  const nC = { x: vb.x + 0.65 * q, y: vb.y + 0.75 * q }
  const w = widthMm ?? vb.w * 10
  return (
    <svg className="plan-svg" overflow="hidden" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} style={{ width: `${w}mm`, height: `${(w * vb.h) / vb.w}mm` }} role="img" aria-label={`תוכנית ${d.title}`}>
      {/* חדרים ואזורים */}
      {d.areas.map((a, i) => (
        <polygon key={i} points={a.poly.map((p) => `${p.x},${p.y}`).join(' ')} fill={a.fill ?? '#fbf9f4'} stroke="none" />
      ))}
      {/* עצים */}
      {d.trees.filter((t) => t.at.x - t.r > vb.x && t.at.x + t.r < vb.x + vb.w && t.at.y - t.r > vb.y && t.at.y + t.r < vb.y + vb.h).map((t, i) => (
        <g key={i}>
          <circle cx={t.at.x} cy={t.at.y} r={t.r} fill="none" stroke={LINE} strokeWidth={k * 0.08} strokeDasharray={`${k * 0.5} ${k * 0.3}`} />
          <circle cx={t.at.x} cy={t.at.y} r={k * 0.4} fill={LINE} />
        </g>
      ))}
      {/* קירות */}
      {d.walls.map((wl, i) => (
        <polygon key={i} points={wallPoly(wl)} fill={INK} />
      ))}
      {/* פתחים */}
      {d.openings.map((op, i) => {
        const dx = op.b.x - op.a.x
        const dy = op.b.y - op.a.y
        const L = Math.hypot(dx, dy) || 1
        const ux = dx / L
        const uy = dy / L
        const nx = -uy
        const ny = ux
        const t = op.t / 2 + 0.01
        const cut = [
          [op.a.x + nx * t, op.a.y + ny * t],
          [op.b.x + nx * t, op.b.y + ny * t],
          [op.b.x - nx * t, op.b.y - ny * t],
          [op.a.x - nx * t, op.a.y - ny * t],
        ]
          .map((p) => p.join(','))
          .join(' ')
        const sw = k * 0.07
        const inw = op.inward ?? { x: nx, y: ny }
        return (
          <g key={i}>
            <polygon points={cut} fill="#fbf9f4" />
            {[op.a, op.b].map((p, j) => (
              <line key={j} x1={p.x + nx * t} y1={p.y + ny * t} x2={p.x - nx * t} y2={p.y - ny * t} stroke={INK} strokeWidth={sw * 1.5} />
            ))}
            {op.type === 'window' && [-0.3, 0.3].map((s) => <line key={s} x1={op.a.x + nx * t * s * 2} y1={op.a.y + ny * t * s * 2} x2={op.b.x + nx * t * s * 2} y2={op.b.y + ny * t * s * 2} stroke={INK} strokeWidth={sw} />)}
            {op.type === 'sliding' && (
              <>
                <line x1={op.a.x + nx * t * 0.35} y1={op.a.y + ny * t * 0.35} x2={op.a.x + dx * 0.55 + nx * t * 0.35} y2={op.a.y + dy * 0.55 + ny * t * 0.35} stroke={INK} strokeWidth={sw * 1.4} />
                <line x1={op.b.x - nx * t * 0.35} y1={op.b.y - ny * t * 0.35} x2={op.b.x - dx * 0.55 - nx * t * 0.35} y2={op.b.y - dy * 0.55 - ny * t * 0.35} stroke={INK} strokeWidth={sw * 1.4} />
              </>
            )}
            {(op.type === 'door' || op.type === 'gate') && (
              <>
                <line x1={op.a.x} y1={op.a.y} x2={op.a.x + inw.x * L} y2={op.a.y + inw.y * L} stroke={INK} strokeWidth={sw * 1.3} />
                <path d={`M ${op.a.x + inw.x * L} ${op.a.y + inw.y * L} A ${L} ${L} 0 0 ${ux * inw.y - uy * inw.x > 0 ? 1 : 0} ${op.b.x} ${op.b.y}`} fill="none" stroke={LINE} strokeWidth={sw * 0.8} />
              </>
            )}
          </g>
        )
      })}
      {/* שם חדר, שטח ומידות פנימיות */}
      {d.areas.map((a, i) => {
        const cx = a.poly.reduce((s, p) => s + p.x, 0) / a.poly.length
        const cy = a.poly.reduce((s, p) => s + p.y, 0) / a.poly.length
        const minSide = a.dims ? Math.min(a.dims.w, a.dims.h) : 2
        const s = Math.min(1, Math.max(0.6, minSide / 2.2))
        return (
          <g key={`t${i}`}>
            <text x={cx} y={cy - k * 0.55 * s} fontSize={k * 1.45 * s} textAnchor="middle" className="pl-name">
              {a.name}
            </text>
            <text x={cx} y={cy + k * 0.9 * s} fontSize={k * 1.15 * s} textAnchor="middle" className="pl-num" direction="rtl">
              {`${f2(a.area)} מ"ר`}
            </text>
            {a.dims && (
              <text x={cx} y={cy + k * 2.0 * s} fontSize={k * 0.95 * s} textAnchor="middle" className="pl-num pl-dim" direction="ltr">
                {`${f2(a.dims.w)} × ${f2(a.dims.h)}`}
              </text>
            )}
          </g>
        )
      })}
      {/* מידות חיצוניות: שרשרת וסך הכל, בדרום ובמזרח */}
      {chainS.slice(1).map((x, i) => (
        <Dim key={`s${i}`} a={chainS[i]} b={x} off={yS1} k={k} />
      ))}
      <Dim a={o.x} b={o.x + o.w} off={yS2} k={k} />
      {chainE.slice(1).map((y, i) => (
        <Dim key={`e${i}`} a={chainE[i]} b={y} off={xE1} vertical k={k} />
      ))}
      <Dim a={o.y} b={o.y + o.h} off={xE2} vertical k={k} />
      {/* חץ צפון */}
      <g>
        <circle cx={nC.x} cy={nC.y} r={0.42 * q} fill="none" stroke={LINE} strokeWidth={k * 0.07} />
        <line x1={nC.x - Math.sin(na) * 0.42 * q} y1={nC.y + Math.cos(na) * 0.42 * q} x2={nC.x + Math.sin(na) * 0.62 * q} y2={nC.y - Math.cos(na) * 0.62 * q} stroke={INK} strokeWidth={k * 0.14} />
        <polygon
          points={`${nC.x + Math.sin(na) * 0.62 * q},${nC.y - Math.cos(na) * 0.62 * q} ${nC.x + Math.sin(na + 2.7) * 0.22 * q},${nC.y - Math.cos(na + 2.7) * 0.22 * q} ${nC.x + Math.sin(na - 2.7) * 0.22 * q},${nC.y - Math.cos(na - 2.7) * 0.22 * q}`}
          fill={INK}
        />
        <text x={nC.x + 0.62 * q} y={nC.y + k * 0.4} fontSize={k * 1.1} className="pl-name" textAnchor="start">
          צפון
        </text>
      </g>
      {/* סרגל קנה מידה: 5 מקטעים, מטר או יותר לפי קנה המידה */}
      {showScale !== false && (() => {
        const u = q >= 4 ? 5 : q >= 2 ? 2 : 1
        return (
          <g transform={`translate(${o.x}, ${o.y + o.h + 2.05 * q})`}>
            {[0, 1, 2, 3, 4].map((m) => (
              <rect key={m} x={m * u} y={0} width={u} height={0.14 * q} fill={m % 2 ? '#fbf9f4' : INK} stroke={INK} strokeWidth={k * 0.05} />
            ))}
            {[0, 1, 2, 5].map((m) => (
              <text key={m} x={m * u} y={0.5 * q} fontSize={k * 0.9} textAnchor="middle" className="pl-num" direction="ltr">
                {m * u}
              </text>
            ))}
            <text x={5 * u + 0.3 * q} y={0.5 * q} fontSize={k * 0.9} className="pl-name" textAnchor="end">
              מ׳
            </text>
          </g>
        )
      })()}
    </svg>
  )
}
