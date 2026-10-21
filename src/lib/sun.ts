// מיקום השמש (אלגוריתם NOAA מקוצר, דיוק של כחצי מעלה, מספיק לניתוח צל בגינה).
// אזימוט: מעלות מהצפון בכיוון השעון. גובה: מעלות מעל האופק.

export type Season = 'winter' | 'equinox' | 'summer'

export const SEASONS: { id: Season; t: string; date: string; month: number; day: number; utc: number }[] = [
  { id: 'winter', t: 'חורף', date: '21 בדצמבר', month: 11, day: 21, utc: 2 },
  { id: 'equinox', t: 'אביב וסתיו', date: '21 במרץ', month: 2, day: 21, utc: 2 },
  { id: 'summer', t: 'קיץ', date: '21 ביוני', month: 5, day: 21, utc: 3 }, // שעון קיץ
]

const R = Math.PI / 180

export function sunPosition(ms: number, lat: number, lon: number): { az: number; el: number } {
  const n = ms / 86400000 + 2440587.5 - 2451545.0
  const L = (280.46 + 0.9856474 * n) % 360
  const g = ((357.528 + 0.9856003 * n) % 360) * R
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * R
  const eps = (23.439 - 0.0000004 * n) * R
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda))
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda))
  const gmst = (((18.697374558 + 24.06570982441908 * n) % 24) + 24) % 24
  const ha = (gmst * 15 + lon) * R - ra
  const la = lat * R
  const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha))
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha))
  return { az: ((az / R) % 360 + 360) % 360, el: el / R }
}

// זמן בשעון ישראל (שעה עשרונית) ביום העונה
export function seasonTime(season: Season, hour: number, year = new Date().getFullYear()): number {
  const s = SEASONS.find((x) => x.id === season)!
  return Date.UTC(year, s.month, s.day, 0, 0, 0) + (hour - s.utc) * 3600000
}

export function sunAt(season: Season, hour: number, lat: number, lon: number) {
  return sunPosition(seasonTime(season, hour), lat, lon)
}

// מסלול השמש ביום: דגימות בכל רבע שעה, רק מעל האופק
export function dayPath(season: Season, lat: number, lon: number, step = 0.25) {
  const out: { h: number; az: number; el: number }[] = []
  for (let h = 3; h <= 21.001; h += step) {
    const p = sunAt(season, h, lat, lon)
    if (p.el > 0) out.push({ h, ...p })
  }
  return out
}

export function sunriseSunset(season: Season, lat: number, lon: number) {
  const p = dayPath(season, lat, lon, 1 / 12)
  return p.length ? { rise: p[0].h, set: p[p.length - 1].h, noonEl: Math.max(...p.map((x) => x.el)) } : null
}

export const fmtHour = (h: number) => {
  const hh = Math.floor(h + 1e-6)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh + (mm === 60 ? 1 : 0)).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`
}

// כיוון בתוכנית (x ימינה, y למטה) לפי אזימוט, כשהצפון מסובב בזווית north מכיוון מעלה הגיליון
export function planDir(azDeg: number, northDeg: number): { x: number; y: number } {
  const a = (azDeg + northDeg) * R
  return { x: Math.sin(a), y: -Math.cos(a) }
}
