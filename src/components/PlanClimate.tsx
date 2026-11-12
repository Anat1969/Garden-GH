// אקלים בתוכנית: מפת חום (צל, רוח, נוחות) מתחת לאלמנטים, ומדריך "חם וקר" שמלווה הזזה של אלמנט עד למקום האידיאלי.
import { useMemo } from 'react'
import type { Element, Project } from '../lib/types'
import { rampColor, RAMPS, type Grid } from '../lib/climate'
import { coach, computeClimate3, fitKindOf, FIT_TEXT, hotColor, type Climate3 } from '../lib/climateScores'
import { SEASONS } from '../lib/sun'
import { LAYERS, useClimateData, useClimateState } from './ClimatePanel'
import { Rich } from './ui'

// מפת החום כתמונה במטרים, מונחת על התוכנית
export function PlanHeatImage({ g, values, ramp, max, opacity = 0.55 }: { g: Grid; values: Float32Array; ramp: keyof typeof RAMPS; max: number; opacity?: number }) {
  const url = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = g.nx
    c.height = g.ny
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(g.nx, g.ny)
    for (let i = 0; i < g.nx * g.ny; i++) {
      const v = values[i]
      if (Number.isNaN(v)) continue
      const [r, gg, b] = rampColor(ramp, v / max)
      img.data[i * 4] = r
      img.data[i * 4 + 1] = gg
      img.data[i * 4 + 2] = b
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    return c.toDataURL()
  }, [g, values, ramp, max])
  return <image href={url} x={g.x0} y={g.y0} width={g.nx * g.cell} height={g.ny * g.cell} opacity={opacity} preserveAspectRatio="none" style={{ imageRendering: 'auto' }} pointerEvents="none" data-testid="plan-heat" />
}

export function usePlanClimate(project: Project, elements: Element[]) {
  const state = useClimateState()
  const data = useClimateData(project, elements, state.st)
  return { state, data }
}

// בורר שכבה ועונה בסרגל התוכנית
export function PlanClimateBar({ state }: { state: ReturnType<typeof useClimateState> }) {
  return (
    <div className="plan-climate-bar" role="toolbar" aria-label="מפות אקלים בתוכנית">
      <b style={{ fontSize: 13 }}>מפת אקלים:</b>
      <span className="tool-group" role="radiogroup" aria-label="מפת אקלים בתוכנית">
        {LAYERS.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={state.st.layer === l.id} className={`btn small ${state.st.layer === l.id ? 'active' : ''}`} title={l.d} onClick={() => state.setLayer(l.id)}>
            {l.t}
          </button>
        ))}
      </span>
      {state.st.layer !== 'none' && (
        <span className="tool-group" role="radiogroup" aria-label="עונה בתוכנית">
          {SEASONS.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={state.st.season === s.id} className={`btn small ${state.st.season === s.id ? 'active' : ''}`} onClick={() => state.setSeason(s.id)}>
              {s.t}
            </button>
          ))}
        </span>
      )}
    </div>
  )
}

// ניתוח לכל העונות לאלמנט הנבחר, בלי האלמנט עצמו (כדי שהצל שלו לא ישפיע על הציון שלו)
export function useCoachClimate(project: Project, elements: Element[], selected: Element | null): Climate3 | null {
  const kind = selected ? fitKindOf(selected) : null
  const key = selected && kind ? selected.id : ''
  const rest = useMemo(() => (key ? elements.filter((e) => e.id !== key) : null), [key, elements]) // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => (rest ? computeClimate3(project, rest) : null), [rest]) // eslint-disable-line react-hooks/exhaustive-deps
}

const centerOf = (e: Element) => {
  if (e.kind === 'object') return { x: e.x, y: e.y }
  if (e.kind === 'surface') {
    if (e.poly) return { x: e.poly.reduce((s, p) => s + p.x, 0) / e.poly.length, y: e.poly.reduce((s, p) => s + p.y, 0) / e.poly.length }
    return { x: e.x + e.w / 2, y: e.y + e.d / 2 }
  }
  return null
}

// הילה צבעונית סביב האלמנט וחץ אל המקום הטוב יותר
export function CoachHalo({ c, el, k }: { c: Climate3; el: Element; k: number }) {
  const kind = fitKindOf(el)
  const at = centerOf(el)
  if (!kind || !at) return null
  const r = coach(c, kind, at)
  const size = el.kind === 'object' ? Math.max(el.w, el.d) / 2 + 0.6 : 1.4
  return (
    <g pointerEvents="none" data-testid="coach-halo">
      <circle cx={at.x} cy={at.y} r={size} fill={r.color} fillOpacity={0.18} stroke={r.color} strokeWidth={k * 3} />
      {r.best && (
        <>
          <line x1={at.x} y1={at.y} x2={r.best.x} y2={r.best.y} stroke={hotColor(0.8)} strokeWidth={k * 2} strokeDasharray={`${k * 5} ${k * 3}`} />
          <circle cx={r.best.x} cy={r.best.y} r={k * 7} fill="none" stroke={hotColor(0.9)} strokeWidth={k * 2} />
        </>
      )}
    </g>
  )
}

// המסגרת שמדריכה את המתכנן תוך כדי תנועה, ומשתנה עד למצב האידיאלי
export function CoachPanel({ c, el, name, moving }: { c: Climate3; el: Element; name: string; moving: boolean }) {
  const kind = fitKindOf(el)
  const at = centerOf(el)
  if (!kind || !at) return null
  const r = coach(c, kind, at)
  return (
    <div className={`coach ${r.score >= 0.86 ? 'ideal' : ''}`} style={{ borderColor: r.color }} data-testid="coach" aria-live="polite">
      <div className="coach-head">
        <b>חם או קר: {name}</b>
        <span className="coach-word" style={{ background: r.color }}>
          {r.word}
        </span>
      </div>
      <div className="coach-meter" aria-hidden="true">
        <i style={{ insetInlineStart: `${r.score * 100}%`, background: r.color }} />
      </div>
      <div className="coach-text">
        <div className="muted">{FIT_TEXT[kind]}</div>
        {r.reasons.map((t) => (
          <div key={t}>
            <Rich text={t} />
          </div>
        ))}
        {r.hint && (
          <div className="coach-hint">
            <Rich text={r.hint} />
          </div>
        )}
        {r.score >= 0.86 && <div className="coach-hint">כאן זה עובד: נוח בשמש, בצל וברוח. אפשר לשחרר.</div>}
        {!moving && r.score < 0.86 && <div className="muted" style={{ fontSize: 12 }}>גוררים את האלמנט, והצבע משתנה מכחול קר לכתום חם ולירוק במקום האידיאלי.</div>}
      </div>
    </div>
  )
}

export function PlanClimateLegend({ ramp, layer }: { ramp: keyof typeof RAMPS; layer: string }) {
  const ends: Record<string, [string, string]> = { shade: ['שמש מלאה', 'צל מלא'], wind: ['שקט', '5.00 מ"ש ומעלה'], comfort: ['לא נוח', 'נוח'] }
  return (
    <div className="plan-heat-legend" data-testid="plan-heat-legend">
      <b>{LAYERS.find((l) => l.id === layer)?.t}</b>
      <i style={{ background: `linear-gradient(to left, ${RAMPS[ramp].css.join(', ')})` }} />
      <span>
        {ends[ramp][0]} · {ends[ramp][1]}
      </span>
    </div>
  )
}
