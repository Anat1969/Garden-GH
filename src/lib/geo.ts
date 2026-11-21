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
  boundingbox?: string[] // דרום, צפון, מערב, מזרח
}

const norm = (t: string) => t.replace(/[\s\-־'"׳״.]/g, '')
// האם התוצאה ביישוב שנכתב בכתובת. נפה ומחוז לא נחשבים: "נפת רחובות" כוללת גם את ראשון לציון ונס ציונה.
// הבדיקה העיקרית גיאוגרפית: בתוך תחום היישוב או עד 3 ק"מ ממנו. שם היישוב ברשומה אינו אמין:
// רחוב בהר אדר רשום במפה תחת "מועצה אזורית מטה בנימין", ולכן השוואת שמות לבדה פוסלת אותו.
function inCity(h: NomHit, city: string, area: CityArea | null): boolean {
  if (!city) return true
  const c = norm(city)
  const a = h.address
  if (a && [a.city, a.town, a.village, a.municipality, a.hamlet, a.suburb].some((v) => v && (norm(v).includes(c) || c.includes(norm(v))))) return true
  if (!a && norm(h.display_name).includes(c)) return true
  // הרשומה נוקבת ביישוב אחר במפורש: נפסלת, גם אם היא קרובה. מועצה אזורית אינה יישוב, ולכן לא פוסלת.
  const named = a && [a.city, a.town, a.village].find((v) => v && !/מועצה אזורית/.test(v))
  if (named || !area) return false
  const lat = Number(h.lat)
  const lon = Number(h.lon)
  const pad = 0.012 // כ-1.3 ק"מ
  if (area.box && lat >= area.box[0] - pad && lat <= area.box[1] + pad && lon >= area.box[2] - pad && lon <= area.box[3] + pad) return true
  return Math.hypot((lat - area.lat) * 111, (lon - area.lon) * 94) <= 3
}

interface CityArea {
  lat: number
  lon: number
  box: number[] | null
}

async function nominatim(params: Record<string, string>): Promise<NomHit[]> {
  const qs = new URLSearchParams({ format: 'jsonv2', limit: '8', countrycodes: 'il,ps', 'accept-language': 'he', addressdetails: '1', ...params })
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`חיפוש הכתובת נכשל (${r.status})`)
  return (await r.json()) as NomHit[]
}
const pause = () => new Promise((res) => setTimeout(res, 1100)) // שירות החיפוש מרשה בקשה אחת בשנייה

// תווית התוצאה: רק החלקים שכתובים בעברית
const hebrewLabel = (t: string) => t.split(',').map((x) => x.trim()).filter((x) => /[א-ת]/.test(x)).join(', ') || t

// חיפוש כתובת, מהמדויק לכללי: קודם היישוב עצמו, ואז הבית, הרחוב וטקסט חופשי בתוך תחומו.
// תוצאה ביישוב אחר נפסלת, כדי שלא תוצב סיכה בעיר הלא נכונה. לכל תוצאה כתוב מה בדיוק נמצא.
// החיפוש כולל יישובים שמעבר לקו הירוק: המפה הפתוחה רושמת אותם תחת קוד מדינה אחר.
export async function geocode(q: string): Promise<GeoHit[]> {
  const a = parseAddress(q)
  const hit = (h: NomHit, precision: GeoPrecision): GeoHit => ({ lat: Number(h.lat), lon: Number(h.lon), label: hebrewLabel(h.display_name), precision })
  const rank: GeoPrecision[] = ['house', 'street', 'city']
  let best: GeoHit[] = []
  let area: CityArea | null = null
  let calls = 0
  const run = async (params: Record<string, string>) => {
    if (calls++) await pause()
    return nominatim(params)
  }
  const take = (r: GeoHit[]) => {
    r = r.sort((x, y) => rank.indexOf(x.precision) - rank.indexOf(y.precision)).slice(0, 5)
    if (r.length && (!best.length || rank.indexOf(r[0].precision) < rank.indexOf(best[0].precision))) best = r
  }
  const numOk = (h: NomHit) => !h.address || h.address.house_number?.split(/[\/\s]/)[0] === a.number

  // 1. היישוב: נותן את התחום שבו מחפשים, וגם את התוצאה האחרונה אם הרחוב לא נמצא
  if (a.city && a.street) {
    const cs = await run({ city: a.city })
    const c = cs[0]
    if (c) {
      const b = (c.boundingbox ?? []).map(Number)
      area = { lat: Number(c.lat), lon: Number(c.lon), box: b.length === 4 && b.every(Number.isFinite) ? b : null }
      take([hit(c, 'city')])
    }
  }
  // 2. הבית
  if (a.street && a.number && a.city) take((await run({ street: `${a.number} ${a.street}`, city: a.city })).filter((h) => inCity(h, a.city, area) && numOk(h) && h.address?.house_number).map((h) => hit(h, 'house')))
  // 3. הרחוב
  if (best[0]?.precision !== 'house' && a.street && a.city) take((await run({ street: a.street, city: a.city })).filter((h) => inCity(h, a.city, area)).map((h) => hit(h, 'street')))
  // 4. טקסט חופשי: לכתובת שלא פורקה, או שהרחוב כתוב אחרת במפה. בלי מספר הבית, שמכשיל את החיפוש כשהוא חסר במפה
  if (!best.length || (best[0].precision === 'city' && a.street)) {
    const free = a.street && a.city ? `${a.street}, ${a.city}` : q
    take(
      (await run({ q: free }))
        .filter((h) => inCity(h, a.city, area))
        .map((h) => hit(h, !h.address ? (a.street ? 'street' : 'city') : h.address.house_number && a.number && numOk(h) ? 'house' : h.address.road ? 'street' : 'city')),
    )
  }
  // 5. כתובת שלא פורקה ליישוב ורחוב: החיפוש המקורי כפי שנכתב
  if (!best.length && (a.street || a.number)) take((await run({ q })).map((h) => hit(h, h.address?.house_number ? 'house' : h.address?.road ? 'street' : 'city')))
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
