// ניתוח אקלים לכל העונות, תובנות למתכנן, ומשחק "חם וקר" למיקום אלמנטים:
// לכל אלמנט יש ציון התאמה לפי מיקומו (שמש, צל, רוח), צבע מקר לחם, והכוונה לאן להזיז.
import type { Element, Project, Pt } from './types'
import { buildGrid, comfortMap, shadeMap, siteInfo, windMap, WIND, type Grid, type SiteInfo } from './climate'
import { planDir, type Season } from './sun'

export const SEASON_IDS: Season[] = ['winter', 'equinox', 'summer']

export interface Climate3 {
  grid: Grid
  site: SiteInfo
  sunHours: Record<Season, Float32Array>
  shade: Record<Season, Float32Array>
  wind: Record<Season, Float32Array>
  comfort: Record<Season | 'year', Float32Array>
  dayHours: Record<Season, number>
}

export function computeClimate3(p: Project, elements: Element[]): Climate3 | null {
  const grid = buildGrid(p, elements)
  if (!grid) return null
  const site = siteInfo(p)
  const { lat, lon } = site.city
  const sunHours = {} as Climate3['sunHours']
  const shade = {} as Climate3['shade']
  const wind = {} as Climate3['wind']
  const comfort = {} as Climate3['comfort']
  const dayHours = {} as Climate3['dayHours']
  for (const s of SEASON_IDS) {
    const sm = shadeMap(grid, s, lat, lon, site.north)
    shade[s] = sm.shade
    sunHours[s] = sm.sunHours
    dayHours[s] = sm.dayHours
    wind[s] = windMap(grid, WIND[site.region][s], site.north, site.elev)
    comfort[s] = comfortMap(s, sm.shade, wind[s])
  }
  // כל השנה: חורף ומעבר שווים, קיץ במשקל כפול (העונה הארוכה בישראל)
  const N = grid.nx * grid.ny
  const year = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const w = comfort.winter[i]
    year[i] = Number.isNaN(w) ? NaN : (w + comfort.equinox[i] + comfort.summer[i] * 2) / 4
  }
  comfort.year = year
  return { grid, site, sunHours, shade, wind, comfort, dayHours }
}

export const cellAt = (g: Grid, x: number, y: number) => {
  const ix = Math.floor((x - g.x0) / g.cell)
  const iy = Math.floor((y - g.y0) / g.cell)
  return ix < 0 || iy < 0 || ix >= g.nx || iy >= g.ny ? -1 : iy * g.nx + ix
}

// כיוון מצפן של וקטור בתוכנית, לפי זווית הצפון
export function bearingOf(dx: number, dy: number, north: number) {
  const th = (Math.atan2(dx, -dy) * 180) / Math.PI
  return (((th - north) % 360) + 360) % 360
}

const DIRS8 = ['צפון', 'צפון-מזרח', 'מזרח', 'דרום-מזרח', 'דרום', 'דרום-מערב', 'מערב', 'צפון-מערב']
export const compassText = (deg: number) => DIRS8[Math.round(deg / 45) % 8]

// ---------- ציון התאמה לפי סוג אלמנט ----------

export type FitKind = 'seat' | 'shade' | 'tree' | 'sun' | 'part' | 'water'

export function fitKindOf(e: Element): FitKind | null {
  if (e.kind === 'object') {
    if (['bench', 'dining', 'lounger', 'firepit', 'grill'].includes(e.type)) return 'seat'
    if (['pergola', 'umbrella'].includes(e.type)) return 'shade'
    if (['tree', 'fruit_tree', 'palm'].includes(e.type)) return 'tree'
    if (['flowers', 'planter', 'play', 'sandbox'].includes(e.type)) return 'sun'
    if (['pond', 'fountain'].includes(e.type)) return 'water'
    if (e.type === 'shrub') return 'part'
    return null
  }
  if (e.kind === 'surface') {
    if (e.material === 'lawn' || e.material === 'turf') return 'sun'
    if (e.material === 'bed') return 'part'
    if (e.material === 'deck' || e.material === 'paving' || e.material === 'tiles' || e.material === 'stone') return 'seat'
    if (e.material === 'water') return 'water'
  }
  return null
}

export const FIT_TEXT: Record<FitKind, string> = {
  seat: 'מקום ישיבה: נוח כל השנה, שמש בחורף וצל ובריזה בקיץ',
  shade: 'הצללה: איפה שחסר צל בקיץ',
  tree: 'עץ: איפה שהשמש חזקה בקיץ, לא צמוד לבית',
  sun: 'אוהב שמש: הרבה שעות שמש באביב ובקיץ',
  part: 'צמחייה: שמש חלקית, מוגן מרוח חזקה',
  water: 'מים: חצי צל, פחות אידוי',
}

export function scoreAt(c: Climate3, kind: FitKind, x: number, y: number): number {
  const i = cellAt(c.grid, x, y)
  if (i < 0 || c.grid.house[i]) return 0
  const sunEq = c.dayHours.equinox ? c.sunHours.equinox[i] / c.dayHours.equinox : 0
  const shSum = c.shade.summer[i]
  const v = Math.max(c.wind.summer[i], c.wind.winter[i])
  const calm = 1 - Math.min(1, Math.max(0, (v - 1.2) / 3))
  let s = 0
  switch (kind) {
    case 'seat':
      s = c.comfort.year[i]
      break
    case 'shade':
      s = 0.75 * (1 - shSum) + 0.25 * calm
      break
    case 'tree': {
      // לא צמוד לבית: מרחק מתא בית קרוב
      let near = 0
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const j = cellAt(c.grid, x + dx, y + dy)
        if (j >= 0 && c.grid.house[j]) near = 1
      }
      s = 0.8 * (1 - shSum) + 0.2 * calm - near * 0.35
      break
    }
    case 'sun':
      s = 0.8 * sunEq + 0.2 * calm
      break
    case 'part':
      s = 0.6 * (1 - Math.abs(sunEq - 0.55) / 0.55) + 0.4 * calm
      break
    case 'water':
      s = 0.7 * (1 - Math.abs(shSum - 0.5) / 0.5) + 0.3 * calm
      break
  }
  return Math.max(0, Math.min(1, s))
}

// צבע במשחק חם-קר: כחול קר, כתום חם, ירוק כשמגיעים למקום האידיאלי
export function hotColor(s: number) {
  if (s >= 0.86) return '#1f8a4c'
  const stops: [number, [number, number, number]][] = [
    [0, [59, 111, 182]],
    [0.45, [143, 179, 217]],
    [0.65, [240, 179, 74]],
    [0.85, [224, 90, 52]],
  ]
  for (let k = 1; k < stops.length; k++)
    if (s <= stops[k][0]) {
      const [a, ca] = stops[k - 1]
      const [b, cb] = stops[k]
      const f = (s - a) / (b - a)
      return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * f)).join(',')})`
    }
  return 'rgb(224,90,52)'
}

export function hotWord(s: number) {
  if (s >= 0.86) return 'במקום!'
  if (s >= 0.75) return 'חם מאוד'
  if (s >= 0.62) return 'חם'
  if (s >= 0.48) return 'פושר'
  if (s >= 0.32) return 'קר'
  return 'קר מאוד'
}

export interface CoachResult {
  score: number
  word: string
  color: string
  kind: FitKind
  reasons: string[]
  hint: string | null
  best: Pt | null
}

// הכוונה: הציון עכשיו, למה, ולאן להזיז כדי להתחמם
export function coach(c: Climate3, kind: FitKind, at: Pt): CoachResult {
  const score = scoreAt(c, kind, at.x, at.y)
  const i = cellAt(c.grid, at.x, at.y)
  const reasons: string[] = []
  if (i >= 0 && c.grid.house[i]) reasons.push('**בתוך קו הבית או מתחת לגג.** מחוץ לבית הניתוח מדויק יותר.')
  if (i >= 0 && !c.grid.house[i]) {
    reasons.push(`שמש בחורף: **${c.sunHours.winter[i].toFixed(2)} שעות** מתוך ${c.dayHours.winter.toFixed(2)}`)
    reasons.push(`צל בקיץ: **${Math.round(c.shade.summer[i] * 100)}%** מהיום`)
    reasons.push(`רוח: **${Math.max(c.wind.winter[i], c.wind.summer[i]).toFixed(2)} מ"ש** בגובה ישיבה`)
  }
  let hint: string | null = null
  let best: Pt | null = null
  if (score < 0.86) {
    let top = { s: score, p: at, d: 0, ang: 0 }
    for (const dist of [2, 4, 7]) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2
        const p = { x: at.x + Math.cos(ang) * dist, y: at.y + Math.sin(ang) * dist }
        const sc = scoreAt(c, kind, p.x, p.y)
        if (sc > top.s + 0.03) top = { s: sc, p, d: dist, ang }
      }
    }
    if (top.d) {
      best = top.p
      const brg = bearingOf(Math.cos(top.ang), Math.sin(top.ang), c.site.north)
      hint = `להזיז כ-**${top.d.toFixed(2)} מ'** לכיוון **${compassText(brg)}**: הציון יעלה ל-${Math.round(top.s * 100)}`
    } else hint = 'אין מקום טוב יותר בסביבה הקרובה. אפשר לשפר עם צל או מחסה מרוח.'
  }
  return { score, word: hotWord(score), color: hotColor(score), kind, reasons, hint, best }
}

// ---------- תובנות למתכנן ----------

export function plannerInsights(c: Climate3): string[] {
  const g = c.grid
  const north = c.site.north
  // מרכז הבית
  let hx = 0
  let hy = 0
  let hn = 0
  for (let i = 0; i < g.house.length; i++)
    if (g.house[i]) {
      hx += i % g.nx
      hy += Math.floor(i / g.nx)
      hn++
    }
  if (!hn) return []
  const cx = g.x0 + (hx / hn + 0.5) * g.cell
  const cy = g.y0 + (hy / hn + 0.5) * g.cell
  type Acc = { n: number; sunW: number; shS: number; wind: number; comf: number }
  const sec = DIRS8.map((): Acc => ({ n: 0, sunW: 0, shS: 0, wind: 0, comf: 0 }))
  for (let i = 0; i < g.house.length; i++) {
    if (!g.inSite[i] || g.house[i] || Number.isNaN(c.shade.summer[i])) continue
    const x = g.x0 + ((i % g.nx) + 0.5) * g.cell
    const y = g.y0 + (Math.floor(i / g.nx) + 0.5) * g.cell
    const k = Math.round(bearingOf(x - cx, y - cy, north) / 45) % 8
    const a = sec[k]
    a.n++
    a.sunW += c.sunHours.winter[i]
    a.shS += c.shade.summer[i]
    a.wind += Math.max(c.wind.winter[i], c.wind.summer[i])
    a.comf += c.comfort.year[i]
  }
  const list = sec.map((a, k) => ({ k, name: DIRS8[k], n: a.n, sunW: a.sunW / (a.n || 1), shS: a.shS / (a.n || 1), wind: a.wind / (a.n || 1), comf: a.comf / (a.n || 1) })).filter((a) => a.n >= 12)
  if (!list.length) return []
  const by = <K extends keyof (typeof list)[number]>(key: K, dir: 1 | -1) => [...list].sort((a, b) => ((b[key] as number) - (a[key] as number)) * dir)[0]
  const out: string[] = []
  const sunny = by('sunW', 1)
  out.push(`**בחורף** הכי הרבה שמש ב**צד ה${sunny.name}** של הגינה: **${sunny.sunW.toFixed(2)} שעות** בממוצע. מקום טוב ל**ישיבת חורף** ולדשא.`)
  const shady = by('shS', 1)
  out.push(`**בקיץ** הצל העמוק ב**צד ה${shady.name}**: **${Math.round(shady.shS * 100)}%** מהיום בצל. מתאים ל**פינת ישיבה של קיץ** בלי הצללה נוספת.`)
  const exposed = list.filter((a) => a.shS < 0.3 && ['דרום', 'דרום-מערב', 'מערב', 'דרום-מזרח'].includes(a.name)).sort((a, b) => a.shS - b.shS)[0]
  if (exposed) out.push(`**הצד ה${exposed.name} חשוף לשמש בקיץ**: רק ${Math.round(exposed.shS * 100)}% צל. **עץ נשיר** או **פרגולה** שם יצננו בקיץ ויכניסו שמש בחורף.`)
  const windy = by('wind', 1)
  const w = WIND[c.site.region].winter
  out.push(`**הרוח** חזקה ב**צד ה${windy.name}**: **${windy.wind.toFixed(2)} מ"ש** בגובה ישיבה. **גדר חיה** או **קיר נמוך** בצד הרוח (${compassText(w.dir)}) יקטינו אותה בכחצי.`)
  const calm = by('wind', -1)
  if (calm.k !== windy.k) out.push(`**הצד השקט מרוח**: ${calm.name}, **${calm.wind.toFixed(2)} מ"ש**. מקום טוב לאש, לקריאה ולצמחים עדינים.`)
  const comf = by('comf', 1)
  out.push(`**המקום הנוח ביותר כל השנה**: **צד ה${comf.name}**, ציון ${Math.round(comf.comf * 100)} מתוך 100.`)
  return out
}

export { planDir }
