// נתוני האתר מהמיקום על המפה: גובה, מרחק מהים, אקלים (גשם, טמפרטורות, קרה, שרב, התאדות), רוחות, קרקע אופיינית ושמש.
// מקור ראשון: Open-Meteo (ERA5, ממוצע 2015–2024) לפי קו הרוחב והאורך. כשאין רשת: ממוצע אזורי לפי אזור האקלים.
// כל ערך "מוערך" (מודל ולא תחנה), ערך שהוזן ידנית "הונח". נשמר ב-project.site.
import type { Label, Project } from './types'
import { siteInfo } from './climate'
import { WIND } from './climate'
import type { ClimateRegion } from '../data/israelCities'
import { REGION_TEXT } from '../data/israelCities'
import { compassText } from './climateScores'

export type SiteKey =
  | 'elevation'
  | 'coastKm'
  | 'region'
  | 'rainYear'
  | 'rainDays'
  | 'janMin'
  | 'augMax'
  | 'frostDays'
  | 'hotDays'
  | 'et0Year'
  | 'waterDeficit'
  | 'windWinter'
  | 'windSummer'
  | 'soilTypical'
  | 'sunWinterNoon'
  | 'sunSummerNoon'

export interface SiteField {
  v: number | string
  label: Label
  source: string
  manual?: boolean
}

export interface SiteData {
  at: string
  locKey: string // המיקום שממנו חושבו הנתונים. מיקום אחר: חישוב מחדש
  live: boolean // האם הנתונים הגיעו מ-Open-Meteo
  error?: string
  fields: Partial<Record<SiteKey, SiteField>>
}

export const SITE_FIELDS: { k: SiteKey; t: string; unit: string; group: 'מיקום' | 'אקלים' | 'מים' | 'רוח ושמש' | 'קרקע'; num: boolean; digits?: number }[] = [
  { k: 'region', t: 'אזור אקלים', unit: '', group: 'מיקום', num: false },
  { k: 'elevation', t: 'גובה מעל פני הים', unit: 'מ\'', group: 'מיקום', num: true, digits: 0 },
  { k: 'coastKm', t: 'מרחק מהים', unit: 'ק"מ', group: 'מיקום', num: true, digits: 1 },
  { k: 'janMin', t: 'מינימום ממוצע בינואר', unit: '°C', group: 'אקלים', num: true, digits: 1 },
  { k: 'augMax', t: 'מקסימום ממוצע באוגוסט', unit: '°C', group: 'אקלים', num: true, digits: 1 },
  { k: 'frostDays', t: 'ימי קרה בשנה (מתחת ל-0)', unit: 'ימים', group: 'אקלים', num: true, digits: 0 },
  { k: 'hotDays', t: 'ימים חמים מאוד (מעל 35)', unit: 'ימים', group: 'אקלים', num: true, digits: 0 },
  { k: 'rainYear', t: 'משקעים בשנה', unit: 'מ"מ', group: 'מים', num: true, digits: 0 },
  { k: 'rainDays', t: 'ימי גשם בשנה (מעל 1 מ"מ)', unit: 'ימים', group: 'מים', num: true, digits: 0 },
  { k: 'et0Year', t: 'התאדות פוטנציאלית בשנה (ET0)', unit: 'מ"מ', group: 'מים', num: true, digits: 0 },
  { k: 'waterDeficit', t: 'גירעון מים שנתי (ET0 פחות גשם)', unit: 'מ"מ', group: 'מים', num: true, digits: 0 },
  { k: 'windWinter', t: 'רוח שולטת בחורף', unit: '', group: 'רוח ושמש', num: false },
  { k: 'windSummer', t: 'רוח שולטת בקיץ', unit: '', group: 'רוח ושמש', num: false },
  { k: 'sunWinterNoon', t: 'גובה השמש בצהרי 21.12', unit: '°', group: 'רוח ושמש', num: true, digits: 1 },
  { k: 'sunSummerNoon', t: 'גובה השמש בצהרי 21.6', unit: '°', group: 'רוח ושמש', num: true, digits: 1 },
  { k: 'soilTypical', t: 'קרקע אופיינית לאזור', unit: '', group: 'קרקע', num: false },
]

// ממוצעים אזוריים מעוגלים (השירות המטאורולוגי, אטלס ישראל). משמשים כשאין רשת, ומסומנים "מוערך"
const NORMALS: Record<ClimateRegion, { rain: number; rainDays: number; janMin: number; augMax: number; frost: number; hot: number; et0: number; soil: string }> = {
  coast: { rain: 550, rainDays: 50, janMin: 9, augMax: 31, frost: 0, hot: 3, et0: 1400, soil: 'חמרה וחול, ניקוז מהיר ואחיזת מים נמוכה' },
  inland: { rain: 520, rainDays: 48, janMin: 7, augMax: 33, frost: 2, hot: 10, et0: 1500, soil: 'חמרה וסחף, קרקע בינונית' },
  hills: { rain: 560, rainDays: 50, janMin: 4, augMax: 29, frost: 5, hot: 5, et0: 1450, soil: 'טרה רוסה ורנדזינה על גיר, שכבה רדודה וסלע קרוב' },
  galilee: { rain: 700, rainDays: 55, janMin: 4, augMax: 30, frost: 8, hot: 5, et0: 1400, soil: 'טרה רוסה ובזלת, לעתים סלעית' },
  valley: { rain: 420, rainDays: 42, janMin: 7, augMax: 36, frost: 3, hot: 50, et0: 1700, soil: 'חרסית כבדה (גרומוסול), מתנפחת ומתכווצת, ניקוז איטי' },
  negev: { rain: 200, rainDays: 25, janMin: 6, augMax: 34, frost: 3, hot: 25, et0: 1750, soil: 'לס, נוטה להיסחף ולהיאטם בשטף' },
  desert: { rain: 50, rainDays: 8, janMin: 12, augMax: 39, frost: 0, hot: 120, et0: 2100, soil: 'חצצית ומלוחה, דלה בחומר אורגני' },
  eilat: { rain: 25, rainDays: 4, janMin: 10, augMax: 40, frost: 0, hot: 130, et0: 2300, soil: 'חולית-חצצית, דלה ומלוחה' },
}

// קו החוף של הים התיכון, מראש הנקרה ועד גבול רצועת עזה (קו רוחב, קו אורך). מספיק להערכת מרחק בקילומטרים
const COAST: [number, number][] = [
  [33.09, 35.1], [32.92, 35.07], [32.83, 35.03], [32.82, 34.98], [32.83, 34.95], [32.7, 34.93], [32.5, 34.88], [32.33, 34.85],
  [32.16, 34.8], [32.08, 34.76], [31.95, 34.72], [31.8, 34.62], [31.67, 34.54], [31.52, 34.43], [31.32, 34.22],
]
const RED_SEA: [number, number][] = [[29.56, 34.95], [29.49, 34.9]]

function segKm(lat: number, lon: number, a: [number, number], b: [number, number]) {
  const k = Math.cos((lat * Math.PI) / 180)
  const px = lon * k
  const ax = a[1] * k
  const bx = b[1] * k
  const dx = bx - ax
  const dy = b[0] - a[0]
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (lat - a[0]) * dy) / (dx * dx + dy * dy || 1e-9)))
  return Math.hypot(px - (ax + t * dx), lat - (a[0] + t * dy)) * 111.2
}

export function coastDistanceKm(lat: number, lon: number) {
  let d = Infinity
  for (const line of [COAST, RED_SEA]) for (let i = 1; i < line.length; i++) d = Math.min(d, segKm(lat, lon, line[i - 1], line[i]))
  return d
}

// גובה השמש בצהריים: 90 פחות קו הרוחב, ועוד או פחות נטיית כדור הארץ
export const noonAltitude = (lat: number, summer: boolean) => 90 - lat + (summer ? 23.44 : -23.44)

export const locKeyOf = (p: Project) => (p.location ? `${p.location.lat.toFixed(4)},${p.location.lon.toFixed(4)}` : '')

const F = (v: number | string, label: Label, source: string): SiteField => ({ v, label, source })

// ערכים מקומיים: מהמיקום, מהעיר ומהממוצע האזורי. תמיד זמינים
export function localSiteFields(p: Project): SiteData['fields'] {
  const s = siteInfo(p)
  const { lat, lon } = s.city
  const n = NORMALS[s.region]
  const src = `ממוצע אזורי: ${REGION_TEXT[s.region]}`
  const ww = WIND[s.region].winter
  const ws = WIND[s.region].summer
  return {
    region: F(REGION_TEXT[s.region], 'estimated', p.location ? 'מהמיקום על המפה והעיר הקרובה' : 'מהעיר בכתובת'),
    elevation: F(s.elev, s.elevLabel, s.elevHow),
    coastKm: F(Math.round(coastDistanceKm(lat, lon) * 10) / 10, 'estimated', 'חישוב מקו החוף'),
    janMin: F(n.janMin, 'estimated', src),
    augMax: F(n.augMax, 'estimated', src),
    frostDays: F(n.frost, 'estimated', src),
    hotDays: F(n.hot, 'estimated', src),
    rainYear: F(n.rain, 'estimated', src),
    rainDays: F(n.rainDays, 'estimated', src),
    et0Year: F(n.et0, 'estimated', src),
    waterDeficit: F(n.et0 - n.rain, 'estimated', 'התאדות פחות גשם'),
    windWinter: F(`${ww.text}, כ-${ww.speed} מ"ש`, 'estimated', 'משטר רוחות אזורי'),
    windSummer: F(`${ws.text}, כ-${ws.speed} מ"ש`, 'estimated', 'משטר רוחות אזורי'),
    sunWinterNoon: F(Math.round(noonAltitude(lat, false) * 10) / 10, 'measured', 'חישוב אסטרונומי מקו הרוחב'),
    sunSummerNoon: F(Math.round(noonAltitude(lat, true) * 10) / 10, 'measured', 'חישוב אסטרונומי מקו הרוחב'),
    soilTypical: F(n.soil, 'estimated', src),
  }
}

interface MeteoDaily {
  time: string[]
  temperature_2m_max: (number | null)[]
  temperature_2m_min: (number | null)[]
  precipitation_sum: (number | null)[]
  et0_fao_evapotranspiration: (number | null)[]
  wind_speed_10m_max: (number | null)[]
  wind_direction_10m_dominant: (number | null)[]
}

export const METEO_SRC = 'Open-Meteo (ERA5), ממוצע 2015–2024'

// סיכום עשר שנים של נתונים יומיים לממוצעים שנתיים ועונתיים
export function summarizeMeteo(d: MeteoDaily) {
  const years = new Set(d.time.map((t) => t.slice(0, 4))).size || 1
  let rain = 0, rainDays = 0, et0 = 0, frost = 0, hot = 0
  const janMin: number[] = []
  const augMax: number[] = []
  const wind = { w: { x: 0, y: 0, s: 0, n: 0 }, s: { x: 0, y: 0, s: 0, n: 0 } }
  d.time.forEach((t, i) => {
    const m = Number(t.slice(5, 7))
    const mx = d.temperature_2m_max[i]
    const mn = d.temperature_2m_min[i]
    const pr = d.precipitation_sum[i] ?? 0
    rain += pr
    if (pr >= 1) rainDays++
    et0 += d.et0_fao_evapotranspiration[i] ?? 0
    if (mn !== null && mn < 0) frost++
    if (mx !== null && mx > 35) hot++
    if (m === 1 && mn !== null) janMin.push(mn)
    if (m === 8 && mx !== null) augMax.push(mx)
    const dir = d.wind_direction_10m_dominant[i]
    const sp = d.wind_speed_10m_max[i]
    if (dir !== null && sp !== null) {
      const acc = m === 12 || m <= 2 ? wind.w : m >= 6 && m <= 8 ? wind.s : null
      if (acc) {
        acc.x += Math.sin((dir * Math.PI) / 180) * sp
        acc.y += Math.cos((dir * Math.PI) / 180) * sp
        acc.s += sp
        acc.n++
      }
    }
  })
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
  const windText = (a: typeof wind.w) => {
    if (!a.n) return null
    const deg = ((Math.atan2(a.x, a.y) * 180) / Math.PI + 360) % 360
    return `${compassText(deg)}, משבים עד כ-${Math.round(a.s / a.n)} מ"ש`
  }
  return {
    rainYear: Math.round(rain / years),
    rainDays: Math.round(rainDays / years),
    et0Year: Math.round(et0 / years),
    frostDays: Math.round(frost / years),
    hotDays: Math.round(hot / years),
    janMin: Math.round(avg(janMin) * 10) / 10,
    augMax: Math.round(avg(augMax) * 10) / 10,
    windWinter: windText(wind.w),
    windSummer: windText(wind.s),
  }
}

export function meteoUrl(lat: number, lon: number) {
  const daily = 'temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,wind_speed_10m_max,wind_direction_10m_dominant'
  return `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start_date=2015-01-01&end_date=2024-12-31&daily=${daily}&wind_speed_unit=ms&timezone=Asia%2FJerusalem`
}

// חילוץ נתוני האתר: מקומי תמיד, ועליו נתוני Open-Meteo כשיש רשת. ערכים שהוזנו ידנית נשמרים
export async function extractSiteData(p: Project, fetcher: typeof fetch = fetch): Promise<SiteData> {
  const fields = localSiteFields(p)
  let live = false
  let error: string | undefined
  if (p.location) {
    try {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 20000)
      const r = await fetcher(meteoUrl(p.location.lat, p.location.lon), { signal: ctl.signal })
      clearTimeout(timer)
      if (!r.ok) throw new Error(`Open-Meteo החזיר ${r.status}`)
      const js = (await r.json()) as { elevation?: number; daily?: MeteoDaily }
      if (!js.daily?.time?.length) throw new Error('Open-Meteo לא החזיר נתונים יומיים')
      const s = summarizeMeteo(js.daily)
      const put = (k: SiteKey, v: number | string | null) => {
        if (v === null || (typeof v === 'number' && !Number.isFinite(v))) return
        fields[k] = F(v, 'estimated', METEO_SRC)
      }
      put('rainYear', s.rainYear)
      put('rainDays', s.rainDays)
      put('et0Year', s.et0Year)
      put('frostDays', s.frostDays)
      put('hotDays', s.hotDays)
      put('janMin', s.janMin)
      put('augMax', s.augMax)
      put('windWinter', s.windWinter)
      put('windSummer', s.windSummer)
      fields.waterDeficit = F(s.et0Year - s.rainYear, 'estimated', 'התאדות פחות גשם, מ-Open-Meteo')
      // גובה מההיתר קודם לגובה המודל
      if (typeof js.elevation === 'number' && fields.elevation?.label !== 'measured') fields.elevation = F(Math.round(js.elevation), 'estimated', 'מודל גובה (Open-Meteo, 90 מ\')')
      live = true
    } catch (e) {
      error = e instanceof Error && e.name !== 'AbortError' ? e.message : 'אין חיבור לשירות האקלים'
    }
  }
  // ערכים שהוזנו ידנית גוברים
  for (const [k, f] of Object.entries(p.site?.fields ?? {})) if (f?.manual) fields[k as SiteKey] = f
  return { at: new Date().toISOString(), locKey: locKeyOf(p), live, error, fields }
}

// ערך מספרי של שדה, מהנתונים השמורים או מהחישוב המקומי
export function siteNum(p: Project, k: SiteKey): number | null {
  const f = p.site?.fields[k] ?? localSiteFields(p)[k]
  return f && typeof f.v === 'number' && Number.isFinite(f.v) ? f.v : null
}
export function siteField(p: Project, k: SiteKey): SiteField | undefined {
  return p.site?.fields[k] ?? localSiteFields(p)[k]
}
