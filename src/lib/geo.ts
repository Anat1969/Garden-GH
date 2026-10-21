// מיקום הפרויקט: חיפוש כתובת (Nominatim של OpenStreetMap), רשת ישראל החדשה (ITM) ל-GovMap, וקישורים חיצוניים
import proj4 from 'proj4'

const ITM = '+proj=tmerc +lat_0=31.7343936111111 +lon_0=35.2045169444444 +k=1.0000067 +x_0=219529.584 +y_0=626907.39 +ellps=GRS80 +towgs84=-24.0024,-17.1032,-17.8444,-0.33077,-1.85269,1.66969,5.4248 +units=m +no_defs'

export function toITM(lat: number, lon: number): { x: number; y: number } {
  const [x, y] = proj4('WGS84', ITM, [lon, lat])
  return { x: Math.round(x), y: Math.round(y) }
}

export interface GeoHit {
  lat: number
  lon: number
  label: string
}

// חיפוש כתובת בישראל. מחזיר עד 5 תוצאות
export async function geocode(q: string): Promise<GeoHit[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=il&accept-language=he&q=${encodeURIComponent(q)}`
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`חיפוש הכתובת נכשל (${r.status})`)
  const js = (await r.json()) as { lat: string; lon: string; display_name: string }[]
  return js.map((h) => ({ lat: Number(h.lat), lon: Number(h.lon), label: h.display_name }))
}

export const fmtCoord = (v: number) => v.toFixed(6)

export const googleMapsUrl = (lat: number, lon: number) => `https://www.google.com/maps/@${lat},${lon},19z`
export const googleSatUrl = (lat: number, lon: number) => `https://www.google.com/maps/@${lat},${lon},80m/data=!3m1!1e3`
export const googleEmbedUrl = (lat: number, lon: number, sat: boolean) => `https://maps.google.com/maps?q=${lat},${lon}&t=${sat ? 'k' : 'm'}&z=19&output=embed`
export function govmapUrl(lat: number, lon: number) {
  const { x, y } = toITM(lat, lon)
  return `https://www.govmap.gov.il/?c=${x},${y}&z=10`
}
