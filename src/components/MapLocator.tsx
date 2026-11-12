// מיקום הפרויקט על המפה: חיפוש כתובת, דקירה על המפה או הקלדת קואורדינטות.
// רקעים: מפה גרפית (OpenStreetMap), תצלום אוויר (Esri), וגוגל (מפה או לוויין, בהטמעה). קישורים לגוגל מפות ול-GovMap (GIS לאומי).
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Project, ProjectLocation } from '../lib/types'
import { updateProject } from '../lib/store'
import { fmtCoord, geocode, googleEmbedUrl, googleMapsUrl, googleSatUrl, govmapUrl, toITM, type GeoHit } from '../lib/geo'
import { IconBtn } from './EditIcons'
import { toast } from './ui'

type Base = 'map' | 'aerial' | 'gsat' | 'gmap'
const BASES: { id: Base; t: string }[] = [
  { id: 'aerial', t: 'תצלום אוויר' },
  { id: 'map', t: 'מפה גרפית' },
  { id: 'gsat', t: 'גוגל לוויין' },
  { id: 'gmap', t: 'גוגל מפות' },
]
const ISRAEL: [number, number] = [31.6, 34.95]

const pinIcon = L.divIcon({ className: 'map-pin', html: '<i></i>', iconSize: [26, 26], iconAnchor: [13, 13] })

const SOURCE_TEXT: Record<ProjectLocation['source'], string> = { address: 'לפי כתובת', pin: 'לפי דקירה על המפה', manual: 'לפי קואורדינטות' }

export function MapLocator({ project }: { project: Project }) {
  const loc = project.location
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.Marker | null>(null)
  const layers = useRef<Record<'map' | 'aerial', L.TileLayer> | null>(null)
  const [base, setBase] = useState<Base>('aerial')
  const [q, setQ] = useState(project.address)
  const [hits, setHits] = useState<GeoHit[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lat, setLat] = useState(loc ? fmtCoord(loc.lat) : '')
  const [lon, setLon] = useState(loc ? fmtCoord(loc.lon) : '')

  const save = (l: ProjectLocation) => {
    updateProject(project.id, (p) => ({ ...p, location: l }))
    setLat(fmtCoord(l.lat))
    setLon(fmtCoord(l.lon))
  }
  const saveRef = useRef(save)
  saveRef.current = save

  // יצירת המפה פעם אחת
  useEffect(() => {
    if (!box.current || map.current) return
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(loc ? [loc.lat, loc.lon] : ISRAEL, loc ? loc.zoom : 8)
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' })
    const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, attribution: 'Esri, Maxar' })
    esri.addTo(m)
    layers.current = { map: osm, aerial: esri }
    // דקירה: לחיצה על המפה מציבה את הפרויקט
    m.on('click', (ev: L.LeafletMouseEvent) => {
      saveRef.current({ lat: ev.latlng.lat, lon: ev.latlng.lng, zoom: Math.max(m.getZoom(), 17), source: 'pin' })
    })
    map.current = m
    return () => {
      m.remove()
      map.current = null
      marker.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // החלפת רקע
  useEffect(() => {
    const m = map.current
    const ls = layers.current
    if (!m || !ls) return
    for (const k of ['map', 'aerial'] as const) {
      if (k === base) ls[k].addTo(m)
      else ls[k].remove()
    }
    if (base === 'map' || base === 'aerial') setTimeout(() => m.invalidateSize(), 0)
  }, [base])

  // הסיכה במקום השמור, וגרירה שלה
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!loc) {
      marker.current?.remove()
      marker.current = null
      return
    }
    if (!marker.current) {
      marker.current = L.marker([loc.lat, loc.lon], { icon: pinIcon, draggable: true, keyboard: false, title: 'מיקום הפרויקט. אפשר לגרור' }).addTo(m)
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng()
        saveRef.current({ lat: p.lat, lon: p.lng, zoom: m.getZoom(), source: 'pin' })
      })
      m.setView([loc.lat, loc.lon], Math.max(m.getZoom(), loc.zoom))
    } else marker.current.setLatLng([loc.lat, loc.lon])
  }, [loc?.lat, loc?.lon]) // eslint-disable-line react-hooks/exhaustive-deps

  const search = async () => {
    if (!q.trim()) return
    setBusy(true)
    setErr(null)
    try {
      const r = await geocode(q)
      setHits(r)
      if (!r.length) setErr('לא נמצאה הכתובת. נסו בלי מספר בית, או דקרו על המפה.')
      else {
        const h = r[0]
        save({ lat: h.lat, lon: h.lon, zoom: 18, source: 'address', label: h.label })
        map.current?.setView([h.lat, h.lon], 18)
        toast('הפרויקט מוקם לפי הכתובת. אפשר לדייק בדקירה או בגרירת הסיכה')
      }
    } catch (e) {
      setErr(`${(e as Error).message}. אפשר לדקור על המפה במקום.`)
    } finally {
      setBusy(false)
    }
  }

  const applyCoords = () => {
    const a = Number(lat)
    const b = Number(lon)
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 29 || a > 34 || b < 34 || b > 36.5) {
      setErr('קואורדינטות לא בתחום ישראל. קו רוחב 29 עד 34, קו אורך 34 עד 36.50.')
      return
    }
    setErr(null)
    save({ lat: a, lon: b, zoom: 18, source: 'manual' })
    map.current?.setView([a, b], 18)
  }

  const itm = loc ? toITM(loc.lat, loc.lon) : null
  const google = base === 'gsat' || base === 'gmap'
  return (
    <section className="card map-card" data-testid="map-locator">
      <div className="h-section">מיקום הפרויקט על המפה</div>
      <p className="muted" style={{ margin: '4px 0 10px', fontSize: 14 }}>
        <b>חיפוש כתובת</b>, <b>דקירה על המפה</b> או <b>קואורדינטות</b>. המיקום משמש גם למסלול השמש ולרוחות בניתוח האקלים.
      </p>
      <form
        className="row"
        style={{ gap: 6 }}
        onSubmit={(e) => {
          e.preventDefault()
          void search()
        }}
      >
        <input className="input" style={{ flex: '1 1 240px' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="רחוב, מספר, עיר" aria-label="כתובת לחיפוש במפה" />
        <IconBtn icon="focus" label={busy ? 'מחפש...' : 'חיפוש במפה'} type="submit" className="primary" disabled={busy} testId="map-search" />
      </form>
      {hits.length > 1 && (
        <div className="map-hits" role="list" aria-label="תוצאות חיפוש">
          {hits.map((h) => (
            <button
              key={`${h.lat},${h.lon}`}
              type="button"
              role="listitem"
              className="chip"
              onClick={() => {
                save({ lat: h.lat, lon: h.lon, zoom: 18, source: 'address', label: h.label })
                map.current?.setView([h.lat, h.lon], 18)
              }}
            >
              {h.label.split(',').slice(0, 3).join(',')}
            </button>
          ))}
        </div>
      )}
      <div className="row" style={{ gap: 6, margin: '10px 0 8px' }} role="radiogroup" aria-label="רקע המפה">
        {BASES.map((b) => (
          <button key={b.id} type="button" role="radio" aria-checked={base === b.id} className={`chip ${base === b.id ? 'on' : ''}`} onClick={() => setBase(b.id)}>
            {b.t}
          </button>
        ))}
      </div>
      <div className="map-wrap">
        <div ref={box} className="map-box" style={{ visibility: google ? 'hidden' : 'visible' }} data-testid="map-box" aria-label="מפה. לחיצה מציבה את הפרויקט" />
        {google && (
          <iframe className="map-box map-iframe" title="גוגל מפות" src={googleEmbedUrl(loc?.lat ?? ISRAEL[0], loc?.lon ?? ISRAEL[1], base === 'gsat')} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        )}
      </div>
      {google && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>בתצוגת גוגל אין דקירה. לדיוק המיקום חוזרים לתצלום האוויר או למפה הגרפית.</div>}
      {err && (
        <div className="notice" role="alert" style={{ marginTop: 8 }}>
          {err}
        </div>
      )}
      <div className="map-foot">
        <div className="row" style={{ gap: 6 }}>
          <label className="field" style={{ width: 130 }}>
            <span>קו רוחב</span>
            <input className="input num" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="32.000000" inputMode="decimal" />
          </label>
          <label className="field" style={{ width: 130 }}>
            <span>קו אורך</span>
            <input className="input num" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="34.800000" inputMode="decimal" />
          </label>
          <button type="button" className="btn small" style={{ alignSelf: 'end' }} onClick={applyCoords}>
            הצבה לפי קואורדינטות
          </button>
        </div>
        <div className="map-status" data-testid="map-status">
          {loc ? (
            <>
              <b>{SOURCE_TEXT[loc.source]}</b>
              {loc.label && <span>{loc.label.split(',').slice(0, 3).join(',')}</span>}
              <span className="num">
                {fmtCoord(loc.lat)}, {fmtCoord(loc.lon)}
              </span>
              {itm && <span className="num">רשת ישראל: {itm.x}, {itm.y}</span>}
            </>
          ) : (
            <span className="muted">עוד לא נקבע מיקום. מחפשים כתובת או דוקרים על המפה.</span>
          )}
        </div>
        {loc && (
          <div className="row map-links" style={{ gap: 6 }}>
            <a className="btn small" href={googleMapsUrl(loc.lat, loc.lon)} target="_blank" rel="noreferrer">
              גוגל מפות
            </a>
            <a className="btn small" href={googleSatUrl(loc.lat, loc.lon)} target="_blank" rel="noreferrer">
              גוגל לוויין
            </a>
            <a className="btn small" href={govmapUrl(loc.lat, loc.lon)} target="_blank" rel="noreferrer" title="מערכת המידע הגיאוגרפי הלאומית: גוש, חלקה, תב&quot;ע ותצלומי אוויר">
              GovMap (GIS)
            </a>
            <button type="button" className="btn small ghost" onClick={() => updateProject(project.id, (p) => ({ ...p, location: undefined }))}>
              ניקוי המיקום
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
