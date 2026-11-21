// מיקום הפרויקט: חיפוש כתובת (Nominatim של OpenStreetMap), רשת ישראל החדשה (ITM) ל-GovMap, וקישורים חיצוניים
import proj4 from 'proj4'

const ITM = '+proj=tmerc +lat_0=31.7343936111111 +lon_0=35.2045169444444 +k=1.0000067 +x_0=219529.584 +y_0=626907.39 +ellps=GRS80 +towgs84=-24.0024,-17.1032,-17.8444,-0.33077,-1.85269,1.66969,5.4248 +units=m +no_defs'

export function toITM(lat: number, lon: number): { x: number; y: number } {
  const [x, y] = proj4('WGS84', ITM, [lon, lat])
  return { x: Math.round(x), y: Math.round(y) }
}

export type GeoPrecision = 'house' | 'street' | 'city'
export const PRECISION_TEXT: Record<GeoPrecision, string> = { house: 'הבית נמצא', street: 'נמצא הרחוב, בלי מספר הבית', city: 'נמצא רק היישוב' }
export const PRECISION_ZOOM: Record<GeoPrecision, number> = { house: 19, street: 17, city: 14 }

export interface GeoHit {
  lat: number
  lon: number
  label: string
  precision: GeoPrecision
}

export interface ParsedAddress {
  street: string
  number: string
  city: string
}

// מפרק כתובת כפי שמקלידים אותה: "רחוב הרצל 15, רחובות", "הרצל 15 רחובות", "הרצל 15/2 רחובות", "רחובות, הרצל 15"
export function parseAddress(q: string): ParsedAddress {
  const clean = q.replace(/["״]/g, '').replace(/\s+/g, ' ').trim()
  const strip = (t: string) => t.replace(/^(רחוב|רח['׳]?|שדרות|שד['׳]?)\s+/, (m) => (/^שד/.test(m) ? 'שדרות ' : '')).trim()
  const parts = clean.split(',').map((t) => t.trim()).filter(Boolean)
  const num = (t: string) => t.match(/^(.*?)\s+(\d+)\s*[א-ת]?(?:\s*\/\s*\d+)?(?:\s+(.*))?$/)
  if (parts.length >= 2) {
    // החלק עם המספר הוא הרחוב, והאחר הוא היישוב
    const si = parts.findIndex((t) => /\d/.test(t))
    const sp = parts[si >= 0 ? si : 0]
    const city = parts.filter((_, i) => i !== (si >= 0 ? si : 0)).pop() ?? ''
    const m = num(sp)
    return m ? { street: strip(m[1]), number: m[2], city: city || (m[3] ?? '') } : { street: strip(sp), number: '', city }
  }
  const m = num(clean)
  if (m) return { street: strip(m[1]), number: m[2], city: (m[3] ?? '').trim() }
  return { street: '', number: '', city: clean }
}

interface NomHit {
  lat: string
  lon: string
  display_name: string
  address?: Record<string, string>
}

const norm = (t: string) => t.replace(/[\s\-־'"׳״.]/g, '')
// היישוב של התוצאה. נפה ומחוז לא נחשבים: "נפת רחובות" כוללת גם את ראשון לציון ונס ציונה
function inCity(h: NomHit, city: string): boolean {
  if (!city) return true
  const c = norm(city)
  const a = h.address
  if (!a) return norm(h.display_name).includes(c)
  return [a.city, a.town, a.village, a.municipality, a.hamlet, a.suburb].some((v) => v && (norm(v).includes(c) || c.includes(norm(v))))
}

async function nominatim(params: Record<string, string>): Promise<NomHit[]> {
  const qs = new URLSearchParams({ format: 'jsonv2', limit: '8', countrycodes: 'il', 'accept-language': 'he', addressdetails: '1', ...params })
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`חיפוש הכתובת נכשל (${r.status})`)
  return (await r.json()) as NomHit[]
}
const pause = () => new Promise((res) => setTimeout(res, 1100)) // שירות החיפוש מרשה בקשה אחת בשנייה

// חיפוש כתובת בישראל, מהמדויק לכללי: הבית, אחר כך הרחוב, אחר כך היישוב.
// תוצאה ביישוב אחר נפסלת, כדי שלא תוצב סיכה בעיר הלא נכונה. לכל תוצאה כתוב מה בדיוק נמצא.
export async function geocode(q: string): Promise<GeoHit[]> {
  const a = parseAddress(q)
  const hit = (h: NomHit, precision: GeoPrecision): GeoHit => ({ lat: Number(h.lat), lon: Number(h.lon), label: h.display_name, precision })
  const steps: (() => Promise<GeoHit[]>)[] = []
  if (a.street && a.number && a.city)
    steps.push(async () => (await nominatim({ street: `${a.number} ${a.street}`, city: a.city })).filter((h) => inCity(h, a.city) && (!h.address || h.address.house_number?.split(/[\/\s]/)[0] === a.number)).map((h) => hit(h, 'house')))
  if (a.street && a.city) steps.push(async () => (await nominatim({ street: a.street, city: a.city })).filter((h) => inCity(h, a.city)).map((h) => hit(h, 'street')))
  // טקסט חופשי: לכתובת שלא פורקה, או שהרחוב כתוב אחרת במפה
  steps.push(async () =>
    (await nominatim({ q }))
      .filter((h) => inCity(h, a.city))
      .map((h) => hit(h, !h.address ? (a.number ? 'house' : a.street ? 'street' : 'city') : h.address.house_number && (!a.number || h.address.house_number.split(/[\/\s]/)[0] === a.number) ? 'house' : h.address.road ? 'street' : 'city')),
  )
  if (a.city && a.street) steps.push(async () => (await nominatim({ city: a.city })).slice(0, 1).map((h) => hit(h, 'city')))
  const rank: GeoPrecision[] = ['house', 'street', 'city']
  let best: GeoHit[] = []
  for (let i = 0; i < steps.length; i++) {
    if (i) await pause()
    const r = (await steps[i]()).sort((x, y) => rank.indexOf(x.precision) - rank.indexOf(y.precision)).slice(0, 5)
    if (r.length && (!best.length || rank.indexOf(r[0].precision) < rank.indexOf(best[0].precision))) best = r
    // עוצרים כשנמצא הבית, או הרחוב כשלא ביקשו מספר
    if (best.length && (best[0].precision === 'house' || (best[0].precision === 'street' && (!a.number || i >= 2)))) break
  }
  return best
}

export const fmtCoord = (v: number) => v.toFixed(6)

export const googleMapsUrl = (lat: number, lon: number) => `https://www.google.com/maps/@${lat},${lon},19z`
export const googleSatUrl = (lat: number, lon: number) => `https://www.google.com/maps/@${lat},${lon},80m/data=!3m1!1e3`
export const googleEmbedUrl = (lat: number, lon: number, sat: boolean) => `https://maps.google.com/maps?q=${lat},${lon}&t=${sat ? 'k' : 'm'}&z=19&output=embed`
export function govmapUrl(lat: number, lon: number) {
  const { x, y } = toITM(lat, lon)
  return `https://www.govmap.gov.il/?c=${x},${y}&z=10`
}
