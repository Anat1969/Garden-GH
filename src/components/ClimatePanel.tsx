// לוח ניתוח אקלים במודל: שמש וצל, רוח, ונוחות לישיבה. כולל בקשת כיוון צפון ועיר כשלא חולצו.
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Element, Project } from '../lib/types'
import { uid, updateProject, updateVariant } from '../lib/store'
import type { GardenObject } from '../lib/types'
import { toast } from './ui'
import { fmtNum } from '../lib/bom'
import { CITIES } from '../data/israelCities'
import { bestSpots, buildGrid, comfortMap, RAMPS, shadeMap, shadeNow, siteInfo, siteStats, WIND, windMap, exposure, type Grid, type WindRegime } from '../lib/climate'
import { fmtHour, SEASONS, sunAt, sunriseSunset, type Season } from '../lib/sun'
import { Tag } from './ui'
import { IconBtn } from './EditIcons'

export type ClimateLayer = 'none' | 'sun' | 'wind' | 'comfort'

export const LAYERS: { id: ClimateLayer; t: string; d: string }[] = [
  { id: 'none', t: 'ללא', d: 'המודל בלבד' },
  { id: 'sun', t: 'שמש וצל', d: 'מסלול השמש, צללים בשעה שנבחרה ומפת חום של הצל לאורך היום' },
  { id: 'wind', t: 'רוח', d: 'משטר הרוחות באזור ומפת חום של מהירות הרוח בגובה אדם יושב' },
  { id: 'comfort', t: 'נוחות לישיבה', d: 'שילוב של שמש, צל ורוח: איפה נעים לשבת בעונה שנבחרה' },
]

const DIRS: { t: string; d: number }[] = [
  { t: 'צפון', d: 0 },
  { t: 'צפון-מזרח', d: 45 },
  { t: 'מזרח', d: 90 },
  { t: 'דרום-מזרח', d: 135 },
  { t: 'דרום', d: 180 },
  { t: 'דרום-מערב', d: 225 },
  { t: 'מערב', d: 270 },
  { t: 'צפון-מערב', d: 315 },
]
// המרחק הזוויתי בין שני כיוונים, 0 עד 180
const angDist = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
export const dirText = (d: number) => DIRS.reduce((b, x) => (angDist(x.d, d) < angDist(b.d, d) ? x : b), DIRS[0]).t

export interface ClimateState {
  layer: ClimateLayer
  season: Season
  hour: number
  mapMode: 'day' | 'now'
  windDir: number | null
  windSpeed: number | null
}

export function useClimateState() {
  const [params, setParams] = useSearchParams()
  const layer = (params.get('layer') as ClimateLayer) || 'none'
  const season = (params.get('season') as Season) || 'winter'
  const [hour, setHour] = useState(10)
  const [mapMode, setMapMode] = useState<'day' | 'now'>('day')
  const [windDir, setWindDir] = useState<number | null>(null)
  const [windSpeed, setWindSpeed] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }
  return {
    st: { layer, season, hour, mapMode, windDir, windSpeed } as ClimateState,
    playing,
    setPlaying,
    setLayer: (l: ClimateLayer) => setParam('layer', l === 'none' ? null : l),
    setSeason: (s: Season) => setParam('season', s === 'winter' ? null : s),
    setHour,
    setMapMode,
    setWindDir,
    setWindSpeed,
  }
}

export interface ClimateData {
  site: ReturnType<typeof siteInfo>
  grid: Grid | null
  sun: { az: number; el: number }
  day: ReturnType<typeof sunriseSunset>
  wind: WindRegime
  values: Float32Array | null
  ramp: keyof typeof RAMPS
  max: number
  windSpeed: Float32Array | null
  spots: { at: { x: number; y: number }; score: number; shade: number; level: number }[]
  stats: { k: string; v: string; tone?: 'good' | 'warn' }[]
}

export function useClimateData(project: Project, elements: Element[], st: ClimateState): ClimateData {
  const site = useMemo(() => siteInfo(project), [project])
  const { lat, lon } = site.city
  const active = st.layer !== 'none'
  const grid = useMemo(() => (active ? buildGrid(project, elements) : null), [active, project, elements])
  const sun = useMemo(() => sunAt(st.season, st.hour, lat, lon), [st.season, st.hour, lat, lon])
  const day = useMemo(() => sunriseSunset(st.season, lat, lon), [st.season, lat, lon])
  const regime = WIND[site.region][st.season]
  const wind: WindRegime = { ...regime, dir: st.windDir ?? regime.dir, speed: st.windSpeed ?? regime.speed }
  const needShade = grid && (st.layer === 'sun' || st.layer === 'comfort')
  const needWind = grid && (st.layer === 'wind' || st.layer === 'comfort')
  const sm = useMemo(() => (needShade ? shadeMap(grid!, st.season, lat, lon, site.north) : null), [needShade, grid, st.season, lat, lon, site.north]) // eslint-disable-line react-hooks/exhaustive-deps
  const now = useMemo(() => (grid && st.layer === 'sun' && st.mapMode === 'now' ? shadeNow(grid, sun.az, sun.el, site.north) : null), [grid, st.layer, st.mapMode, sun.az, sun.el, site.north])
  const wm = useMemo(() => (needWind ? windMap(grid!, wind, site.north, site.elev) : null), [needWind, grid, wind.dir, wind.speed, site.north, site.elev]) // eslint-disable-line react-hooks/exhaustive-deps
  const cm = useMemo(() => (st.layer === 'comfort' && sm && wm ? comfortMap(st.season, sm.shade, wm) : null), [st.layer, st.season, sm, wm])
  const spots = useMemo(
    () =>
      grid && cm && sm
        ? bestSpots(grid, cm).map((p) => {
            const i = Math.floor((p.at.y - grid.y0) / grid.cell) * grid.nx + Math.floor((p.at.x - grid.x0) / grid.cell)
            return { ...p, shade: sm.shade[i] ?? 0, level: grid.ground[i] ?? 0 }
          })
        : [],
    [grid, cm, sm],
  )

  const stats: ClimateData['stats'] = []
  if (grid && st.layer === 'sun' && sm) {
    const sh = siteStats(grid, sm.sunHours)
    const sd = siteStats(grid, sm.shade)
    stats.push({ k: 'שעות שמש בממוצע בגינה', v: `${fmtNum(sh.avg)} מתוך ${fmtNum(sm.dayHours)}` })
    stats.push({ k: 'בשמש רוב היום', v: `${fmtNum(sd.share((v) => v < 0.3))}%` })
    stats.push({ k: 'בצל רוב היום', v: `${fmtNum(sd.share((v) => v > 0.7))}%` })
    if (day) stats.push({ k: 'זריחה ושקיעה', v: `${fmtHour(day.rise)} עד ${fmtHour(day.set)}` })
    if (day) stats.push({ k: 'גובה השמש בצהריים', v: `${fmtNum(day.noonEl)}°` })
  }
  if (grid && st.layer === 'wind' && wm) {
    const ws = siteStats(grid, wm)
    stats.push({ k: 'הרוח השולטת', v: `מ${dirText(wind.dir)}, ${fmtNum(wind.speed)} מ"ש בגובה 10 מ'` })
    stats.push({ k: 'בגובה אדם יושב, בשטח פתוח', v: `${fmtNum(wind.speed * Math.pow(0.15, 0.25) * exposure(site.elev))} מ"ש` })
    stats.push({ k: 'שקט (עד 1.50 מ"ש)', v: `${fmtNum(ws.share((v) => v <= 1.5))}%`, tone: 'good' })
    stats.push({ k: 'חשוף (מעל 3.00 מ"ש)', v: `${fmtNum(ws.share((v) => v > 3))}%`, tone: ws.share((v) => v > 3) > 30 ? 'warn' : undefined })
  }
  if (grid && st.layer === 'comfort' && cm) {
    const cs = siteStats(grid, cm)
    stats.push({ k: 'אזור נוח לישיבה', v: `${fmtNum(cs.share((v) => v > 0.65))}% מהגינה`, tone: 'good' })
    stats.push({ k: 'מקומות מומלצים', v: `${spots.length}` })
  }

  const layerVals = st.layer === 'sun' ? (now ?? sm?.shade ?? null) : st.layer === 'wind' ? wm : st.layer === 'comfort' ? cm : null
  return {
    site,
    grid,
    sun,
    day,
    wind,
    values: layerVals,
    ramp: st.layer === 'wind' ? 'wind' : st.layer === 'comfort' ? 'comfort' : 'shade',
    max: st.layer === 'wind' ? 5 : 1,
    windSpeed: wm,
    spots,
    stats,
  }
}

const LEGEND: Record<'shade' | 'wind' | 'comfort', [string, string]> = {
  shade: ['שמש מלאה', 'צל מלא'],
  wind: ['שקט, 0.00 מ"ש', '5.00 מ"ש ומעלה'],
  comfort: ['לא נוח', 'נוח לישיבה'],
}

export function ClimateLegend({ ramp, title }: { ramp: keyof typeof RAMPS; title: string }) {
  return (
    <div className="climate-legend" data-testid="climate-legend">
      <b>{title}</b>
      <div className="ramp" style={{ background: `linear-gradient(to left, ${RAMPS[ramp].css.join(', ')})` }} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>{LEGEND[ramp][0]}</span>
        <span>{LEGEND[ramp][1]}</span>
      </div>
    </div>
  )
}

export function ClimatePanel({ project, data, state }: { project: Project; data: ClimateData; state: ReturnType<typeof useClimateState> }) {
  const { st, setLayer, setSeason, setHour, setMapMode, setWindDir, setWindSpeed, playing, setPlaying } = state
  const { site, day, sun, wind } = data
  const [northDraft, setNorthDraft] = useState(site.north)
  useEffect(() => setNorthDraft(site.north), [site.north])

  // הנפשה של שעות היום
  useEffect(() => {
    if (!playing || !day) return
    const t = setInterval(() => setHour((h) => (h + 0.25 > day.set ? Math.ceil(day.rise * 4) / 4 : h + 0.25)), 220)
    return () => clearInterval(t)
  }, [playing, day, setHour])

  const confirmNorth = (deg: number) =>
    updateProject(project.id, (p) => ({ ...p, north: ((Math.round(deg) % 360) + 360) % 360, northSet: true }))

  return (
    <div className="card climate-panel" data-testid="climate-panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div className="h-section" style={{ margin: 0 }}>
          ניתוח אקלים: שמש, צל ורוח
        </div>
        <span className="tool-group" role="radiogroup" aria-label="שכבת ניתוח">
          {LAYERS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={st.layer === l.id} className={`btn small ${st.layer === l.id ? 'active' : ''}`} title={l.d} onClick={() => setLayer(l.id)}>
              {l.t}
            </button>
          ))}
        </span>
      </div>

      {st.layer === 'none' ? (
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
          בוחרים שכבה כדי לראות <b>היכן נופל הצל</b> בחורף ובקיץ, <b>מאיפה נושבת הרוח</b>, ו<b>איפה נעים לשבת</b>.
        </p>
      ) : (
        <div className="climate-body">
          {!site.northKnown && (
            <div className="notice warn" data-testid="north-ask">
              <b>לא חולץ חץ צפון מההיתר.</b> בלי כיוון הצפון השמש והרוח מסובבות. מה כיוון הצפון בתוכנית?
              <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {[
                  ['למעלה', 0],
                  ['ימינה', 90],
                  ['למטה', 180],
                  ['שמאלה', 270],
                ].map(([t, d]) => (
                  <button key={t} type="button" className={`btn small ${northDraft === d ? 'active' : ''}`} onClick={() => setNorthDraft(d as number)}>
                    {t}
                  </button>
                ))}
                <label className="row" style={{ gap: 4, alignItems: 'center' }}>
                  <span className="muted">מעלות</span>
                  <input className="input num" style={{ width: 80 }} type="number" step={1} value={northDraft} onChange={(e) => setNorthDraft(Number(e.target.value) || 0)} aria-label="כיוון הצפון במעלות" />
                </label>
                <button type="button" className="btn small primary" onClick={() => confirmNorth(northDraft)} data-testid="north-confirm">
                  אישור כיוון הצפון
                </button>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                0 מעלות: הצפון כלפי מעלה הגיליון. עד לאישור הניתוח מניח את זה <Tag label="assumed" />.
              </div>
            </div>
          )}

          <div className="climate-site">
            <span>
              <b>מיקום:</b>{' '}
              <select
                className="input"
                style={{ width: 'auto', display: 'inline-block', padding: '2px 6px' }}
                aria-label="עיר"
                value={site.cityHow === 'default' ? '' : site.city.name}
                onChange={(e) => updateProject(project.id, (p) => ({ ...p, city: e.target.value || undefined }))}
              >
                <option value="">{site.cityHow === 'default' ? 'בחירת עיר' : 'לפי הכתובת'}</option>
                {[...CITIES].sort((a, b) => a.name.localeCompare(b.name, 'he')).map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>{' '}
              {site.cityHow === 'address' && <span className="muted">זוהה מהכתובת</span>}
              {site.cityHow === 'default' && <span className="muted">לא זוהתה עיר בכתובת, הונח מרכז הארץ</span>}
            </span>
            <span>
              <b>אזור:</b> {site.regionText}
            </span>
            <span>
              <b>גובה אבסולוטי:</b> {fmtNum(site.elev)} מ' מעל פני הים <Tag label={site.elevLabel} /> <span className="muted">{site.elevHow}</span>
            </span>
            <span>
              <b>צפון:</b> {fmtNum(site.north)}° <Tag label={site.northKnown ? (project.extracted?.north ? 'measured' : 'assumed') : 'assumed'} /> <span className="muted">{site.northHow}</span>
              {site.northKnown && (
                <button type="button" className="btn small ghost" onClick={() => updateProject(project.id, (p) => ({ ...p, northSet: false, extracted: { ...p.extracted, north: undefined } }))}>
                  שינוי
                </button>
              )}
            </span>
          </div>

          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="tool-group" role="radiogroup" aria-label="עונה">
              {SEASONS.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={st.season === s.id} className={`btn small ${st.season === s.id ? 'active' : ''}`} onClick={() => setSeason(s.id)} title={s.date}>
                  {s.t}
                </button>
              ))}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              {SEASONS.find((s) => s.id === st.season)!.date}
            </span>
          </div>

          {st.layer === 'sun' && (
            <div className="sun-time">
              <IconBtn icon={playing ? 'pause' : 'play'} label={playing ? 'עצירה' : 'הנפשת היום'} onClick={() => setPlaying(!playing)} />
              <input type="range" min={Math.floor((day?.rise ?? 5) * 4) / 4} max={Math.ceil((day?.set ?? 19) * 4) / 4} step={0.25} value={st.hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="שעה ביום" data-testid="sun-hour" />
              <span>
                <b>{fmtHour(st.hour)}</b> · גובה השמש {fmtNum(Math.max(0, sun.el))}° · כיוון {fmtNum(sun.az)}° ({dirText(sun.az)})
              </span>
              <span className="tool-group" role="radiogroup" aria-label="סוג המפה">
                <button type="button" role="radio" aria-checked={st.mapMode === 'day'} className={`btn small ${st.mapMode === 'day' ? 'active' : ''}`} onClick={() => setMapMode('day')}>
                  צל לאורך היום
                </button>
                <button type="button" role="radio" aria-checked={st.mapMode === 'now'} className={`btn small ${st.mapMode === 'now' ? 'active' : ''}`} onClick={() => setMapMode('now')}>
                  צל בשעה שנבחרה
                </button>
              </span>
            </div>
          )}

          {(st.layer === 'wind' || st.layer === 'comfort') && (
            <div className="wind-regime">
              <div>
                <b>משטר הרוחות ב{site.regionText}, {SEASONS.find((s) => s.id === st.season)!.t}:</b> רוח {wind.text} בשעות היום, בממוצע {fmtNum(wind.speed)} מ"ש <Tag label="estimated" />
              </div>
              <div className="muted" style={{ fontSize: 13 }}>{wind.note}</div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                <span className="muted">בדיקת תרחיש:</span>
                <select className="input" style={{ width: 'auto', padding: '2px 6px' }} aria-label="כיוון הרוח" value={st.windDir ?? ''} onChange={(e) => setWindDir(e.target.value === '' ? null : Number(e.target.value))}>
                  <option value="">כיוון לפי האזור</option>
                  {DIRS.map((d) => (
                    <option key={d.d} value={d.d}>
                      רוח מ{d.t}
                    </option>
                  ))}
                </select>
                <select className="input" style={{ width: 'auto', padding: '2px 6px' }} aria-label="מהירות הרוח" value={st.windSpeed ?? ''} onChange={(e) => setWindSpeed(e.target.value === '' ? null : Number(e.target.value))}>
                  <option value="">מהירות לפי האזור</option>
                  {[2, 4, 6, 8, 12].map((v) => (
                    <option key={v} value={v}>
                      {fmtNum(v)} מ"ש
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {st.layer === 'comfort' && (
            <ol className="steps-list" style={{ fontSize: 13 }}>
              {st.season === 'winter' && <li><b>בחורף</b> נעים לשבת ב<b>שמש</b> ו<b>במחסה מהרוח</b>.</li>}
              {st.season === 'summer' && <li><b>בקיץ</b> נעים לשבת ב<b>צל</b> עם <b>בריזה קלה</b>, בין 1.00 ל-3.50 מ"ש.</li>}
              {st.season === 'equinox' && <li><b>באביב ובסתיו</b> נעים לשבת ב<b>שמש חלקית</b> ובמחסה מרוח חזקה.</li>}
              <li>העיגולים הירוקים במודל הם <b>המקומות הטובים ביותר לישיבה</b> בעונה שנבחרה.</li>
            </ol>
          )}
        </div>
      )}
    </div>
  )
}

// הצבת פינות ישיבה במקומות המומלצים: בחורף ספסל בשמש, בקיץ פינת ישיבה ופרגולה כשאין צל
export function placeSeating(project: Project, elements: Element[], data: ClimateData, season: Season): number {
  const near = (x: number, y: number) => elements.some((e) => e.kind === 'object' && Math.hypot(e.x - x, e.y - y) < 1.8)
  const add: GardenObject[] = []
  const base = { label: 'assumed' as const, approved: false, source: `ניתוח אקלים: מקום מומלץ לישיבה, ${SEASONS.find((s) => s.id === season)!.t}`, rot: 0 }
  for (const s of data.spots) {
    if (near(s.at.x, s.at.y)) continue
    const at = { x: Math.round(s.at.x * 10) / 10, y: Math.round(s.at.y * 10) / 10, level: s.level }
    if (season === 'winter') add.push({ id: uid(), kind: 'object', type: 'bench', w: 1.8, d: 0.5, h: 0.45, ...at, ...base })
    else {
      add.push({ id: uid(), kind: 'object', type: 'dining', w: 2.4, d: 2.4, h: 0.75, ...at, ...base })
      if (season === 'summer' && s.shade < 0.5) add.push({ id: uid(), kind: 'object', type: 'pergola', w: 3.6, d: 3.6, h: 2.6, ...at, ...base, source: `${base.source}: צל לפינת הישיבה` })
    }
  }
  if (add.length) updateVariant(project.id, (v) => ({ ...v, elements: [...v.elements, ...add] }))
  return add.length
}

// תובנות ומקרא בעמודת הצד, ליד המודל
export function ClimateInsights({ data, st, project, elements }: { data: ClimateData; st: ClimateState; project: Project; elements: Element[] }) {
  if (st.layer === 'none') return null
  return (
    <div className="card flat climate-insights" data-testid="climate-insights">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <b>
          {LAYERS.find((l) => l.id === st.layer)!.t}: {SEASONS.find((s) => s.id === st.season)!.t}
        </b>
        <Tag label="estimated" />
      </div>
      {data.stats.length > 0 && (
        <div className="climate-stats" data-testid="climate-stats">
          {data.stats.map((s) => (
            <div key={s.k} className={`stat ${s.tone ?? ''}`}>
              <span>{s.k}</span>
              <b>{s.v}</b>
            </div>
          ))}
        </div>
      )}
      {st.layer === 'comfort' && data.spots.length > 0 && (
        <div className="seat-place">
          <button
            type="button"
            className="btn small primary"
            data-testid="place-seating"
            onClick={() => {
              const n = placeSeating(project, elements, data, st.season)
              toast(n ? `נוספו ${n} פריטים במקומות המומלצים. אפשר לבטל ב-Ctrl+Z` : 'במקומות המומלצים כבר יש פריטים')
            }}
          >
            הצבת פינות ישיבה במקומות המומלצים
          </button>
          <div className="muted" style={{ fontSize: 12 }}>
            {st.season === 'winter' ? 'בחורף: ספסל בשמש ובמחסה מהרוח.' : st.season === 'summer' ? 'בקיץ: פינת ישיבה, ופרגולה כשאין שם צל טבעי.' : 'פינת ישיבה בכל מקום מומלץ.'} נכנס לכתב הכמויות, מסומן "הונח".
          </div>
        </div>
      )}
      <ClimateLegend ramp={data.ramp} title={st.layer === 'sun' ? (st.mapMode === 'now' ? `צל ב-${fmtHour(st.hour)}` : 'חלק היום בצל') : st.layer === 'wind' ? "מהירות הרוח בגובה 1.50 מ'" : 'נוחות לישיבה'} />
      <div className="muted" style={{ fontSize: 12 }}>
        הערכה בלבד: קרני שמש מול גובה המכשולים, וצל רוח מאחורי קירות, גדרות וצמחייה. לא סימולציית זרימה ולא תחליף ליועץ אקלים.
      </div>
    </div>
  )
}
