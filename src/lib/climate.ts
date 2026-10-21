// ניתוח אקלים לגינה: מיקום וגובה, מסלול שמש ומפת צל, משטר רוחות ומפת מהירות רוח, ומפת נוחות לישיבה.
// כל החישובים הם הערכה פשוטה (קרני שמש מול גבהי מכשולים, צל רוח מאחורי מכשולים), לא סימולציה הנדסית.
import type { Element, Label, Project, Pt } from './types'
import { CITIES, ISRAEL_CENTER, REGION_TEXT, cityByName, findCity, type City, type ClimateRegion } from '../data/israelCities'
import { dayPath, planDir, type Season } from './sun'
import { pointInPoly } from './geom'
import { boundsOf } from './elementGeom'
import { MATERIALS } from './garden'
import { unitFootprints } from './structureToElements'

// ---------- מיקום ----------

export interface SiteInfo {
  city: City
  cityHow: 'address' | 'manual' | 'default'
  elev: number
  elevLabel: Label
  elevHow: string
  north: number
  northKnown: boolean
  northHow: string
  region: ClimateRegion
  regionText: string
}

function nearestCity(lat: number, lon: number) {
  let best = CITIES[0]
  let d = Infinity
  for (const c of CITIES) {
    const x = Math.hypot(c.lat - lat, (c.lon - lon) * Math.cos((lat * Math.PI) / 180))
    if (x < d) {
      d = x
      best = c
    }
  }
  return d < 0.25 ? best : null
}

export function siteInfo(p: Project): SiteInfo {
  const manual = cityByName(p.city)
  const fromAddr = findCity(p.address) ?? findCity(p.name)
  // מיקום על המפה: קו רוחב ואורך מדויקים. האזור והגובה מהעיר הקרובה ביותר
  const near = p.location ? nearestCity(p.location.lat, p.location.lon) : null
  const baseCity = manual ?? fromAddr ?? near ?? ISRAEL_CENTER
  const city = p.location ? { ...baseCity, lat: p.location.lat, lon: p.location.lon } : baseCity
  const cityHow = manual ? 'manual' : fromAddr ? 'address' : near ? 'address' : 'default'
  const base = p.baseLevel ?? p.building?.baseAbs ?? null
  const elev = base !== null && Number.isFinite(base) ? base : city.elev
  const elevLabel: Label = base !== null ? (p.extracted?.baseLevel ? 'measured' : 'assumed') : cityHow === 'default' ? 'assumed' : 'estimated'
  const elevHow =
    base !== null
      ? p.extracted?.baseLevel
        ? 'מפלס ±0.00 שנקרא מההיתר'
        : 'מפלס ±0.00 שהוזן בפרויקט'
      : cityHow === 'default'
        ? 'לא זוהתה עיר, הונח גובה של מרכז הארץ'
        : `גובה טיפוסי של ${city.name}`
  const northKnown = Boolean(p.extracted?.north || p.northSet)
  return {
    city,
    cityHow,
    elev,
    elevLabel,
    elevHow,
    north: p.north || 0,
    northKnown,
    northHow: p.extracted?.north ? `חולץ ${p.extracted.north}` : p.northSet ? 'הוזן ידנית' : 'לא חולץ מההיתר',
    region: regionOf(city, cityHow, elev),
    regionText: REGION_TEXT[regionOf(city, cityHow, elev)],
  }
}

// כשלא זוהתה עיר, אזור האקלים מוערך לפי הגובה: אתר גבוה הוא אתר הררי
function regionOf(city: City, how: SiteInfo['cityHow'], elev: number): ClimateRegion {
  if (how !== 'default') return city.region
  if (elev > 450) return 'hills'
  if (elev < -50) return 'valley'
  return city.region
}

export { CITIES }

// ---------- משטר רוחות ----------

export interface WindRegime {
  dir: number // מאיפה הרוח נושבת, מעלות מהצפון
  speed: number // מהירות ממוצעת בשעות היום, מ' לשנייה בגובה 10 מ'
  text: string
  note: string
}

const W = (dir: number, speed: number, text: string, note: string): WindRegime => ({ dir, speed, text, note })

// הערכה לפי אופי האזור (בריזת ים בקיץ, מערכות חורף מדרום-מערב, שרב ממזרח באביב ובסתיו). לא נתוני תחנה.
export const WIND: Record<ClimateRegion, Record<Season, WindRegime>> = {
  coast: {
    summer: W(300, 5, 'מערב-צפון-מערב', 'בריזת ים קבועה מהצהריים ועד הערב. בלילה רוח יבשה חלשה ממזרח.'),
    equinox: W(290, 4, 'מערב', 'בריזת ים מתונה. בימי שרב רוח חמה ויבשה ממזרח.'),
    winter: W(230, 4.5, 'דרום-מערב', 'בסופות רוח של 10 עד 15 מ"ש מדרום-מערב, ובימים בהירים רוח קרה ממזרח.'),
  },
  inland: {
    summer: W(300, 4, 'מערב-צפון-מערב', 'בריזת הים מגיעה אחרי הצהריים, חלשה מעט מאשר בחוף.'),
    equinox: W(290, 3.5, 'מערב', 'רוחות מתונות. בימי שרב רוח חמה ממזרח.'),
    winter: W(230, 3.5, 'דרום-מערב', 'בסופות רוח חזקה מדרום-מערב, ובימים בהירים רוח קרה ממזרח.'),
  },
  hills: {
    summer: W(290, 4.5, 'מערב-צפון-מערב', 'רוח מערבית מתחזקת אחרי הצהריים וקרירה בערב.'),
    equinox: W(270, 4, 'מערב', 'בימי שרב רוח מזרחית חמה ויבשה ומאובקת.'),
    winter: W(250, 5, 'מערב-דרום-מערב', 'רוחות חזקות וקרות בסופות, ורוח מזרחית קרה ויבשה בימים בהירים.'),
  },
  galilee: {
    summer: W(270, 4.5, 'מערב', 'רוח מערבית קבועה אחרי הצהריים.'),
    equinox: W(270, 4, 'מערב', 'רוחות מתונות, ושרב ממזרח בחלק מהימים.'),
    winter: W(240, 5, 'דרום-מערב', 'רוחות חזקות וקרות בסופות.'),
  },
  valley: {
    summer: W(270, 4.5, 'מערב', 'רוח מערבית חזקה אחרי הצהריים שיורדת לעמק.'),
    equinox: W(270, 3.5, 'מערב', 'רוחות מתונות.'),
    winter: W(240, 3, 'דרום-מערב', 'רוחות חלשות יחסית, חזקות בסופות.'),
  },
  negev: {
    summer: W(320, 4.5, 'צפון-מערב', 'רוח צפון-מערבית קבועה אחרי הצהריים, לעתים מאובקת.'),
    equinox: W(300, 4, 'צפון-מערב', 'סופות אבק ושרב ממזרח ומדרום.'),
    winter: W(240, 3.5, 'דרום-מערב', 'רוחות קרות בסופות.'),
  },
  desert: {
    summer: W(0, 3.5, 'צפון', 'רוח צפונית לאורך הבקעה, ורוח מערבית חמה בערב.'),
    equinox: W(0, 3.5, 'צפון', 'רוחות לאורך הבקעה.'),
    winter: W(0, 3, 'צפון', 'רוחות חלשות לאורך הבקעה.'),
  },
  eilat: {
    summer: W(10, 5.5, 'צפון', 'רוח צפונית חזקה וחמה לאורך הערבה.'),
    equinox: W(10, 5, 'צפון', 'רוח צפונית קבועה.'),
    winter: W(10, 4, 'צפון', 'רוח צפונית, נעימה יחסית.'),
  },
}

// מקדם חשיפה לפי גובה: אתרים גבוהים חשופים יותר לרוח
export const exposure = (elev: number) => (elev > 600 ? 1.15 : elev > 300 ? 1.07 : 1)
// רוח בגובה אדם יושב (1.5 מ') בשכונה בנויה, ביחס לגובה 10 מ'
const PED = Math.pow(1.5 / 10, 0.25)

// ---------- רסטר מכשולים ----------

export interface Grid {
  x0: number
  y0: number
  cell: number
  nx: number
  ny: number
  solid: Float32Array // גובה עליון של מכשול אטום (מוחלט ביחס ל-±0.00), 0 אם אין
  canBot: Float32Array
  canTop: Float32Array
  canK: Float32Array // מקדם החלשה של צמרת, לכל מטר
  house: Uint8Array
  ground: Float32Array
  inSite: Uint8Array // בתוך גבולות האלמנטים (לא בשוליים)
}

interface Canopy {
  at: Pt
  r: number
  bot: number
  top: number
  k: number
}

function houseTop(p: Project, elements: Element[]): number {
  const b = p.building
  if (b) {
    const eave = b.eaveRel && b.eaveRel > b.groundHeight + 0.3 ? b.eaveRel : b.storeys > 1 ? b.groundHeight * b.storeys : b.groundHeight
    const ridge = b.ridgeRel && b.ridgeRel > eave ? b.ridgeRel : null
    return ridge ? eave + (ridge - eave) * 0.5 : eave + 0.25
  }
  const hs = elements.filter((e) => e.kind === 'wall' && e.scope === 'house').map((e) => (e.kind === 'wall' ? e.height : 0))
  return hs.length ? Math.max(...hs) : 3
}

export function buildGrid(p: Project, elements: Element[], pad = 8, maxCells = 9000): Grid | null {
  const b = boundsOf(elements.filter((e) => e.kind !== 'sketch'))
  if (!b) return null
  const x0 = b.minX - pad
  const y0 = b.minY - pad
  const W_ = b.maxX - b.minX + pad * 2
  const H_ = b.maxY - b.minY + pad * 2
  const cell = Math.max(0.5, Math.sqrt((W_ * H_) / maxCells))
  const nx = Math.ceil(W_ / cell)
  const ny = Math.ceil(H_ / cell)
  const N = nx * ny
  const g: Grid = {
    x0,
    y0,
    cell,
    nx,
    ny,
    solid: new Float32Array(N),
    canBot: new Float32Array(N),
    canTop: new Float32Array(N),
    canK: new Float32Array(N),
    house: new Uint8Array(N),
    ground: new Float32Array(N),
    inSite: new Uint8Array(N),
  }
  const cx = (ix: number) => x0 + (ix + 0.5) * cell
  const cy = (iy: number) => y0 + (iy + 0.5) * cell
  const range = (minX: number, minY: number, maxX: number, maxY: number, fn: (i: number, x: number, y: number) => void) => {
    const ix0 = Math.max(0, Math.floor((minX - x0) / cell))
    const ix1 = Math.min(nx - 1, Math.floor((maxX - x0) / cell))
    const iy0 = Math.max(0, Math.floor((minY - y0) / cell))
    const iy1 = Math.min(ny - 1, Math.floor((maxY - y0) / cell))
    for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) fn(iy * nx + ix, cx(ix), cy(iy))
  }
  range(b.minX, b.minY, b.maxX, b.maxY, (i) => (g.inSite[i] = 1))

  // מפלס הקרקע לפי המשטחים
  for (const e of elements) {
    if (e.kind !== 'surface') continue
    const top = e.level + MATERIALS[e.material].height
    if (e.poly) range(e.x, e.y, e.x + e.w, e.y + e.d, (i, x, y) => pointInPoly({ x, y }, e.poly!) && (g.ground[i] = top))
    else range(e.x, e.y, e.x + e.w, e.y + e.d, (i) => (g.ground[i] = top))
  }

  const solidAt = (i: number, h: number) => {
    if (h > g.solid[i]) g.solid[i] = h
  }
  const seg = (a: Pt, c: Pt, half: number, fn: (i: number) => void) => {
    const L = Math.hypot(c.x - a.x, c.y - a.y)
    const n = Math.max(1, Math.ceil(L / (cell * 0.5)))
    const r = Math.max(half, cell * 0.5)
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((c.x - a.x) * k) / n
      const y = a.y + ((c.y - a.y) * k) / n
      range(x - r, y - r, x + r, y + r, (i, px, py) => Math.hypot(px - x, py - y) <= r + cell * 0.36 && fn(i))
    }
  }

  // הבית: קו המתאר מההיתר בגובה הבית, וקירות הבית
  const top = houseTop(p, elements)
  for (const fp of unitFootprints(p)) {
    const xs = fp.map((v) => v.x)
    const ys = fp.map((v) => v.y)
    // גג משופע במודל נבנה מעל המלבן החוסם עם בליטה, ולכן גם הוא מכסה ומצל
    const b = p.building
    const pitched = b && b.ridgeRel && (b.roofType === 'gable' || b.roofType === 'hip' || b.roofType === 'mixed')
    const o = pitched ? 0.4 : 0
    range(Math.min(...xs) - o, Math.min(...ys) - o, Math.max(...xs) + o, Math.max(...ys) + o, (i, x, y) => {
      if (pitched || pointInPoly({ x, y }, fp)) {
        g.house[i] = 1
        solidAt(i, top)
      }
    })
  }
  // פנים הבית: תאים שאי אפשר להגיע אליהם מקצה המפה בלי לחצות קיר בית
  const fillInterior = () => {
    const seen = new Uint8Array(N)
    const stack: number[] = []
    for (let ix = 0; ix < nx; ix++) stack.push(ix, (ny - 1) * nx + ix)
    for (let iy = 0; iy < ny; iy++) stack.push(iy * nx, iy * nx + nx - 1)
    while (stack.length) {
      const i = stack.pop()!
      if (seen[i] || g.house[i]) continue
      seen[i] = 1
      const ix = i % nx
      if (ix > 0) stack.push(i - 1)
      if (ix < nx - 1) stack.push(i + 1)
      if (i >= nx) stack.push(i - nx)
      if (i < N - nx) stack.push(i + nx)
    }
    for (let i = 0; i < N; i++)
      if (!seen[i] && !g.house[i]) {
        g.house[i] = 1
        solidAt(i, top)
      }
  }
  const canopies: Canopy[] = []
  for (const e of elements) {
    if (e.kind === 'wall') {
      const h = e.scope === 'house' ? Math.max(e.height, p.building ? top : e.height) : e.height
      seg({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }, e.thickness / 2, (i) => {
        solidAt(i, h)
        if (e.scope === 'house') g.house[i] = 1
      })
    } else if (e.kind === 'fence') {
      seg({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }, 0.05, (i) => solidAt(i, e.height))
    } else if (e.kind === 'line') {
      if (e.type === 'low_wall') for (let k = 1; k < e.pts.length; k++) seg(e.pts[k - 1], e.pts[k], e.width / 2, (i) => solidAt(i, e.level + e.height))
      if (e.type === 'hedge')
        for (let k = 1; k < e.pts.length; k++)
          seg(e.pts[k - 1], e.pts[k], e.width / 2, (i) => {
            g.canBot[i] = e.level
            g.canTop[i] = Math.max(g.canTop[i], e.level + e.height)
            g.canK[i] = Math.max(g.canK[i], 1.6)
          })
    } else if (e.kind === 'object') {
      const r = Math.max(e.w, e.d) / 2
      const at = { x: e.x, y: e.y }
      switch (e.type) {
        case 'tree':
        case 'fruit_tree': {
          const trunk = Math.max(0.6, e.h - r * 1.4)
          canopies.push({ at, r, bot: e.level + trunk, top: e.level + e.h, k: 0.45 })
          break
        }
        case 'palm':
          canopies.push({ at, r: r * 0.8, bot: e.level + e.h - 0.9, top: e.level + e.h, k: 0.6 })
          break
        case 'pergola':
          range(e.x - e.w / 2, e.y - e.d / 2, e.x + e.w / 2, e.y + e.d / 2, (i) => {
            g.canBot[i] = e.level + e.h - 0.1
            g.canTop[i] = Math.max(g.canTop[i], e.level + e.h + 0.15)
            g.canK[i] = Math.max(g.canK[i], 2.5)
          })
          break
        case 'umbrella':
          canopies.push({ at, r, bot: e.level + e.h - 0.5, top: e.level + e.h, k: 6 })
          break
        case 'shed':
        case 'play':
          range(e.x - e.w / 2, e.y - e.d / 2, e.x + e.w / 2, e.y + e.d / 2, (i) => solidAt(i, e.level + e.h))
          break
        case 'shrub':
        case 'flowers':
          canopies.push({ at, r, bot: e.level, top: e.level + e.h, k: 1.4 })
          break
        default:
          break
      }
    }
  }
  fillInterior()
  // עצים מקריאת ההיתר
  const st = p.permit?.structure
  const mpp = p.permit?.scale.metersPerPt ?? 0
  if (st && mpp > 0)
    for (const t of st.trees) {
      const rr = Math.min(Math.max(t.r * mpp, 0.4), 5)
      const trunkH = t.kind === 'palm' ? 4.5 : 2.2
      if (t.kind === 'shrub') canopies.push({ at: { x: t.at.x * mpp, y: t.at.y * mpp }, r: rr * 0.6, bot: 0, top: rr * 0.9, k: 1.4 })
      else canopies.push({ at: { x: t.at.x * mpp, y: t.at.y * mpp }, r: rr * 0.85, bot: trunkH, top: trunkH + rr * 1.55, k: t.kind === 'palm' ? 0.6 : 0.45 })
    }
  for (const c of canopies)
    range(c.at.x - c.r, c.at.y - c.r, c.at.x + c.r, c.at.y + c.r, (i, x, y) => {
      if (Math.hypot(x - c.at.x, y - c.at.y) > c.r) return
      g.canBot[i] = g.canTop[i] > 0 ? Math.min(g.canBot[i], c.bot) : c.bot
      g.canTop[i] = Math.max(g.canTop[i], c.top)
      g.canK[i] = Math.max(g.canK[i], c.k)
    })
  return g
}

const idxAt = (g: Grid, x: number, y: number) => {
  const ix = Math.floor((x - g.x0) / g.cell)
  const iy = Math.floor((y - g.y0) / g.cell)
  return ix < 0 || iy < 0 || ix >= g.nx || iy >= g.ny ? -1 : iy * g.nx + ix
}

let maxSolid = 0
const gridMax = (g: Grid) => {
  let m = 0
  for (let i = 0; i < g.solid.length; i++) m = Math.max(m, g.solid[i], g.canTop[i])
  return m
}

// ---------- צל ----------

// כמה מוצלת נקודה (0 שמש מלאה, 1 צל מלא) בכיוון שמש נתון
function shadeAt(g: Grid, i: number, dir: Pt, tanE: number, hMax: number): number {
  const x = g.x0 + ((i % g.nx) + 0.5) * g.cell
  const y = g.y0 + (Math.floor(i / g.nx) + 0.5) * g.cell
  const z0 = g.ground[i] + 0.1
  const maxD = Math.min(90, (hMax - z0) / Math.max(0.02, tanE))
  const step = g.cell * 0.6
  let trans = 1
  for (let t = step; t <= maxD; t += step) {
    const j = idxAt(g, x + dir.x * t, y + dir.y * t)
    if (j < 0) break
    if (j === i) continue
    const z = z0 + t * tanE
    if (g.solid[j] > z && g.solid[j] > g.ground[i] + 0.05) return 1
    if (g.canK[j] > 0 && g.canTop[j] > z && g.canBot[j] <= z) {
      trans *= Math.exp(-g.canK[j] * step)
      if (trans < 0.03) return 1
    }
  }
  return 1 - trans
}

export interface ShadeMap {
  shade: Float32Array // ממוצע צל על פני שעות היום
  sunHours: Float32Array
  dayHours: number
}

export function shadeMap(g: Grid, season: Season, lat: number, lon: number, north: number): ShadeMap {
  const path = dayPath(season, lat, lon, 0.5).filter((s) => s.el > 4)
  const hMax = gridMax(g) + 0.5
  maxSolid = hMax
  const N = g.nx * g.ny
  const shade = new Float32Array(N)
  const sunHours = new Float32Array(N)
  const dirs = path.map((s) => ({ d: planDir(s.az, north), tan: Math.tan((s.el * Math.PI) / 180) }))
  for (let i = 0; i < N; i++) {
    if (g.house[i]) {
      shade[i] = NaN
      continue
    }
    let acc = 0
    for (const s of dirs) acc += shadeAt(g, i, s.d, s.tan, hMax)
    shade[i] = dirs.length ? acc / dirs.length : 1
    sunHours[i] = (1 - shade[i]) * dirs.length * 0.5
  }
  return { shade, sunHours, dayHours: dirs.length * 0.5 }
}

// צל ברגע נתון (לחיצה על שעה)
export function shadeNow(g: Grid, az: number, el: number, north: number): Float32Array {
  const N = g.nx * g.ny
  const out = new Float32Array(N)
  const d = planDir(az, north)
  const tan = Math.tan((el * Math.PI) / 180)
  const hMax = maxSolid || gridMax(g) + 0.5
  for (let i = 0; i < N; i++) out[i] = g.house[i] ? NaN : el <= 0 ? 1 : shadeAt(g, i, d, tan, hMax)
  return out
}

// ---------- רוח ----------

export function windMap(g: Grid, w: WindRegime, north: number, elev: number): Float32Array {
  const N = g.nx * g.ny
  const out = new Float32Array(N)
  const up = planDir(w.dir, north) // לכיוון מקור הרוח
  const perp = { x: -up.y, y: up.x }
  const base = w.speed * PED * exposure(elev)
  const step = g.cell * 0.7
  const f = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    if (g.house[i]) {
      f[i] = NaN
      continue
    }
    const x = g.x0 + ((i % g.nx) + 0.5) * g.cell
    const y = g.y0 + (Math.floor(i / g.nx) + 0.5) * g.cell
    const gr = g.ground[i]
    let v = 1
    let farthest = 60
    // צל רוח מאחורי מכשולים במעלה הרוח
    for (let t = step; t <= farthest; t += step) {
      const j = idxAt(g, x + up.x * t, y + up.y * t)
      if (j < 0) break
      const H = g.solid[j] - gr
      if (H > 0.4) {
        const s = Math.min(1, t / (10 * H))
        v = Math.min(v, 0.2 + 0.8 * Math.pow(s, 1.3))
        farthest = Math.min(farthest, t + 4)
      } else if (g.canK[j] > 0 && g.canBot[j] - gr < 1.5 && g.canTop[j] - gr > 0.6) {
        const Hp = g.canTop[j] - gr
        const R = g.canK[j] >= 1 ? 0.5 : 0.3
        const s = Math.min(1, t / (12 * Hp))
        v = Math.min(v, 1 - R * (1 - s))
      }
    }
    // לחץ מול קיר בצד הרוח
    for (let t = step; t <= 8; t += step) {
      const j = idxAt(g, x - up.x * t, y - up.y * t)
      if (j < 0) break
      const H = g.solid[j] - gr
      if (H > 1 && t < H) {
        v = Math.min(v, 0.55 + 0.45 * (t / H))
        break
      }
    }
    f[i] = v
  }
  // האצה בפינות ולאורך קירות, מחוץ לצל הרוח
  for (let i = 0; i < N; i++) {
    if (Number.isNaN(f[i])) {
      out[i] = NaN
      continue
    }
    let v = f[i]
    if (v > 0.95) {
      const x = g.x0 + ((i % g.nx) + 0.5) * g.cell
      const y = g.y0 + (Math.floor(i / g.nx) + 0.5) * g.cell
      let boost = 1
      for (const sgn of [1, -1])
        for (let t = g.cell; t <= 4; t += g.cell) {
          const j = idxAt(g, x + perp.x * t * sgn, y + perp.y * t * sgn)
          if (j < 0) break
          const H = g.solid[j] - g.ground[i]
          if (H > 2) {
            if (t < 0.6 * H) boost = Math.max(boost, 1 + 0.3 * (1 - t / (0.6 * H)))
            break
          }
        }
      v *= boost
    }
    out[i] = base * v
  }
  return out
}

// ---------- נוחות לישיבה ----------

// נוחות לישיבה בשני רכיבים: שמש (או צל בקיץ) ורוח, וציון כללי משוקלל
export function comfortParts(season: Season, s: number, v: number): { sun: number; wind: number; total: number } {
  if (season === 'winter') {
    const sun = 1 - s
    const wind = 1 - Math.min(1, Math.max(0, (v - 1) / 3))
    return { sun, wind, total: 0.6 * sun + 0.4 * wind }
  }
  if (season === 'summer') {
    const sun = s
    const wind = v < 0.6 ? 0.5 : v <= 3.5 ? 1 : Math.max(0, 1 - (v - 3.5) / 3)
    return { sun, wind, total: 0.6 * sun + 0.4 * wind }
  }
  const sun = Math.max(0, 1 - Math.abs(1 - s - 0.6) / 0.6)
  const wind = 1 - Math.min(1, Math.max(0, (v - 1.5) / 3))
  return { sun, wind, total: 0.5 * sun + 0.5 * wind }
}

export function comfortMap(season: Season, shade: Float32Array, wind: Float32Array): Float32Array {
  const out = new Float32Array(shade.length)
  for (let i = 0; i < shade.length; i++) {
    const s = shade[i]
    const v = wind[i]
    out[i] = Number.isNaN(s) || Number.isNaN(v) ? NaN : comfortParts(season, s, v).total
  }
  return out
}

// המקומות הטובים לישיבה: תאים עם ציון גבוה, רחוקים זה מזה, בתוך האתר ולא צמודים לקיר
export function bestSpots(g: Grid, score: Float32Array, n = 3, minGap = 5): { at: Pt; score: number }[] {
  const cand: { i: number; s: number }[] = []
  for (let i = 0; i < score.length; i++) {
    if (!g.inSite[i] || Number.isNaN(score[i]) || g.solid[i] > g.ground[i] + 0.3 || g.canK[i] > 1) continue
    cand.push({ i, s: score[i] })
  }
  cand.sort((a, b) => b.s - a.s)
  const out: { at: Pt; score: number }[] = []
  for (const c of cand) {
    const at = { x: g.x0 + ((c.i % g.nx) + 0.5) * g.cell, y: g.y0 + (Math.floor(c.i / g.nx) + 0.5) * g.cell }
    if (out.some((o) => Math.hypot(o.at.x - at.x, o.at.y - at.y) < minGap)) continue
    out.push({ at, score: c.s })
    if (out.length >= n) break
  }
  return out
}

// סיכום לאזור הגינה (בתוך האתר, מחוץ לבית)
export function siteStats(g: Grid, values: Float32Array) {
  let n = 0
  let sum = 0
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < values.length; i++) {
    if (!g.inSite[i] || Number.isNaN(values[i])) continue
    n++
    sum += values[i]
    min = Math.min(min, values[i])
    max = Math.max(max, values[i])
  }
  return { n, avg: n ? sum / n : 0, min: n ? min : 0, max: n ? max : 0, share: (fn: (v: number) => boolean) => (n ? (values.reduce((a, v, i) => a + (g.inSite[i] && !Number.isNaN(v) && fn(v) ? 1 : 0), 0) / n) * 100 : 0) }
}

// ---------- סולמות צבע ----------

type Stop = [number, [number, number, number]]
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
export const RAMPS: Record<'shade' | 'wind' | 'comfort', { stops: Stop[]; css: string[] }> = {
  shade: { stops: [], css: ['#f7d046', '#f0a14a', '#9b7fb0', '#2e3f7a'] },
  wind: { stops: [], css: ['#2f6bb3', '#3fa77a', '#e7c43a', '#d64b2f'] },
  comfort: { stops: [], css: ['#c8553d', '#efe3b0', '#2f8a57'] },
}
for (const r of Object.values(RAMPS)) r.stops = r.css.map((c, i) => [i / (r.css.length - 1), hex(c)])

export function rampColor(kind: keyof typeof RAMPS, t: number): [number, number, number] {
  const s = RAMPS[kind].stops
  const v = Math.min(1, Math.max(0, t))
  for (let k = 1; k < s.length; k++) {
    if (v <= s[k][0]) {
      const a = s[k - 1]
      const b = s[k]
      const f = (v - a[0]) / (b[0] - a[0] || 1)
      return [0, 1, 2].map((c) => Math.round(a[1][c] + (b[1][c] - a[1][c]) * f)) as [number, number, number]
    }
  }
  return s[s.length - 1][1]
}

export const WIND_SCALE_MAX = 5 // מ' לשנייה בקצה הסולם
