import type { Element, Label, PriceItem, Project, Unit, Variant } from './types'
import { stairPlan } from './stairs'
import { LINES, MATERIALS, MATERIAL_TEXT, OBJECTS } from './garden'
import { polyArea } from './geom'

export const DISCLAIMER = 'הערכה בלבד עד לאישור מול מחירון מעודכן וספק.'
export const VAT = 0.18 // המחירון ללא מע"מ
export const NO_BASIS = 'אין בסיס למספרים'

export type Category =
  | 'earthwork'
  | 'subbase'
  | 'paving'
  | 'deck'
  | 'gravel'
  | 'lawn'
  | 'planting'
  | 'soil'
  | 'irrigation'
  | 'fence'
  | 'garden_wall'
  | 'tiles'
  | 'stone'
  | 'concrete'
  | 'turf'
  | 'mulch'
  | 'sand'
  | 'water'
  | 'trees'
  | 'shrubs'
  | 'planters'
  | 'pergola'
  | 'furniture'
  | 'outdoor_kitchen'
  | 'shed'
  | 'play'
  | 'water_feature'
  | 'lighting'
  | 'irrigation_point'
  | 'hedge'
  | 'edging'
  | 'path'
  | 'irrigation_line'
  | 'lighting_line'

export const CATEGORY_TEXT: Record<Category, string> = {
  earthwork: 'עבודות עפר וחפירה',
  subbase: 'מצע מהודק',
  paving: 'ריצוף',
  deck: 'דק עץ',
  gravel: 'חצץ',
  lawn: 'דשא',
  planting: 'שתילה בערוגות',
  soil: 'אדמה גננית',
  irrigation: 'השקיה',
  fence: 'גדר',
  garden_wall: 'קיר גינה',
  tiles: 'אריחים',
  stone: 'אבן טבעית',
  concrete: 'בטון מוחלק',
  turf: 'דשא סינתטי',
  mulch: 'רסק עץ',
  sand: 'חול',
  water: 'משטח מים',
  trees: 'עצים',
  shrubs: 'שיחים ושתילה',
  planters: 'אדניות',
  pergola: 'פרגולה',
  furniture: 'ריהוט גן',
  outdoor_kitchen: 'מטבח חוץ',
  shed: 'מחסן גינה',
  play: 'מתקני משחק',
  water_feature: 'מתקני מים',
  lighting: 'גופי תאורה',
  irrigation_point: 'נקודות מים',
  hedge: 'גדר חיה',
  edging: 'אבן שפה',
  path: 'שבילים',
  irrigation_line: 'קווי השקיה',
  lighting_line: 'פסי תאורה',
}

export const CATEGORY_UNIT: Record<Category, Unit> = {
  earthwork: 'm3',
  subbase: 'm3',
  paving: 'm2',
  deck: 'm2',
  gravel: 'm2',
  lawn: 'm2',
  planting: 'm2',
  soil: 'm3',
  irrigation: 'm2',
  fence: 'm',
  garden_wall: 'm2',
  tiles: 'm2',
  stone: 'm2',
  concrete: 'm2',
  turf: 'm2',
  mulch: 'm2',
  sand: 'm2',
  water: 'm2',
  trees: 'unit',
  shrubs: 'unit',
  planters: 'unit',
  pergola: 'm2',
  furniture: 'unit',
  outdoor_kitchen: 'm',
  shed: 'unit',
  play: 'unit',
  water_feature: 'unit',
  lighting: 'unit',
  irrigation_point: 'unit',
  hedge: 'm',
  edging: 'm',
  path: 'm2',
  irrigation_line: 'm',
  lighting_line: 'm',
}

export interface BomLine {
  key: string
  elementId: string
  elementName: string
  category: Category
  qty: number
  unit: Unit
  qtyLabel: Label
  item: PriceItem | null
  unitMismatch: boolean
  total: number | null
  min: number | null
  max: number | null
  warning?: string
  how: string // איך חושבה הכמות
  existing: boolean // קיים בשטח, לא מתומחר
}

// אלמנט קיים: לא נכנס לעלות. גדר גבול מגרש מההיתר קיימת אלא אם סומן אחרת
export const isExisting = (e: Element) => (e.existing !== undefined ? e.existing : e.kind === 'fence' && e.boundary)

export function hasBasis(p: Project): boolean {
  return Boolean(p.permit?.scale.metersPerPt || p.permit?.scale.source === 'manual-only')
}

const len = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1)

export function elementName(e: Element, idx?: number): string {
  const n = idx !== undefined ? ` ${idx + 1}` : ''
  switch (e.kind) {
    case 'wall':
      return (e.scope === 'garden' ? 'קיר גינה' : 'קיר בית') + n
    case 'opening':
      return (e.type === 'door' ? 'דלת' : e.type === 'gate' ? 'שער' : 'חלון') + n
    case 'surface':
      return (e.stairs ? 'מדרגות' : MATERIAL_TEXT[e.material]) + n
    case 'fence':
      return (e.boundary ? 'גדר גבול מגרש' : 'גדר') + n
    case 'object':
      return OBJECTS[e.type].text + n
    case 'line':
      return LINES[e.type].text + n
    case 'sketch':
      return (e.closed ? 'שרטוט סגור' : 'קו חופשי') + n
  }
}

export const polyLength = (pts: { x: number; y: number }[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0)

export function numberedNames(elements: Element[]): Map<string, string> {
  const counters = new Map<string, number>()
  const out = new Map<string, string>()
  for (const e of elements) {
    const base = elementName(e)
    const n = (counters.get(base) ?? 0) + 1
    counters.set(base, n)
    out.set(e.id, `${base} ${n}`)
  }
  return out
}

interface Qty {
  category: Category
  qty: number
  how: string
  warning?: string
  prefer?: string // קוד סעיף מועדף כשקיים במחירון
}

const n2 = (v: number) => fmtNum(v)

function quantities(e: Element): Qty[] {
  if (e.kind === 'surface') {
    const area = surfaceArea(e)
    const A = `שטח ${n2(area)} מ"ר`
    const dig = (d: number, why: string): Qty => ({ category: 'earthwork', qty: area * d, how: `${A} × עומק ${n2(d)} מ' (${why})` })
    // מדרגות: גוף בטון לפי שטח התוכנית, וחיפוי לשלחים ולרומים
    const sp = e.stairs ? stairPlan(e) : null
    if (sp) {
      const width = area / Math.max(0.01, sp.tread * sp.count)
      const clad = area + sp.count * sp.riser * width
      const warn = 'מדרגות, הפרשי מפלסים וקירות תמך: דורש מהנדס מוסמך'
      return [
        dig(0.3, 'חפירה ליסוד המדרגות'),
        { category: 'concrete', qty: area, how: `${A}, ${sp.count} מדרגות ברום ${n2(sp.riser * 100)} ס"מ (גוף בטון)`, warning: warn },
        { category: MATERIALS[e.material].category, qty: clad, how: `שלחים ${n2(area)} מ"ר + רומים ${sp.count} × ${n2(sp.riser)} × ${n2(width)} מ'` },
      ]
    }
    switch (e.material) {
      case 'paving':
      case 'tiles':
      case 'concrete':
        return [
          dig(0.3, 'חפירה למצע, חול וריצוף'),
          { category: 'subbase', qty: area * 0.15, how: `${A} × שכבת מצע ${n2(0.15)} מ'` },
          { category: MATERIALS[e.material].category, qty: area, how: A },
        ]
      case 'stone':
        // סעיף האבן הטבעית כולל מצע, לכן בלי שורת מצע נפרדת
        return [dig(0.25, 'חפירה לאבן ומצע'), { category: 'stone', qty: area, how: `${A} (הסעיף כולל מצע)` }]
      case 'deck':
        return [dig(0.15, 'יסודות וניקוז מתחת לדק'), { category: 'deck', qty: area, how: A }]
      case 'gravel':
      case 'pebbles':
      case 'sand':
      case 'mulch':
        return [dig(0.1, 'פינוי שכבה עליונה'), { category: MATERIALS[e.material].category, qty: area, how: A }]
      case 'turf':
        return [
          { category: 'subbase', qty: area * 0.08, how: `${A} × שכבת מצע ${n2(0.08)} מ'` },
          { category: 'turf', qty: area, how: A },
        ]
      case 'lawn':
        return [
          { category: 'soil', qty: area * 0.1, how: `${A} × שכבת אדמה גננית ${n2(0.1)} מ'` },
          { category: 'irrigation', qty: area, how: `${A}, מתזים לדשא`, prefer: 'GH-41-16', warning: 'חיבור לקו מים ולחץ: דורש בעל מקצוע מוסמך' },
          { category: 'lawn', qty: area, how: A },
        ]
      case 'bed':
        return [
          { category: 'soil', qty: area * 0.3, how: `${A} × שכבת אדמה גננית ${n2(0.3)} מ'` },
          { category: 'irrigation', qty: area, how: `${A}, טפטוף לערוגה`, prefer: 'GH-41-15', warning: 'חיבור לקו מים ולחץ: דורש בעל מקצוע מוסמך' },
          { category: 'planting', qty: area, how: A },
        ]
      case 'water':
        return [dig(0.6, 'חפירה לבריכה'), { category: 'water', qty: area, how: A, warning: 'מים, איטום ומשאבה: דורש בעל מקצוע מוסמך' }]
    }
  }
  if (e.kind === 'object') {
    const def = OBJECTS[e.type]
    const u = CATEGORY_UNIT[def.category]
    const qty = u === 'm2' ? e.w * e.d : u === 'm' ? Math.max(e.w, e.d) : 1
    const how = u === 'm2' ? `${n2(e.w)} × ${n2(e.d)} מ'` : u === 'm' ? `אורך ${n2(qty)} מ'` : 'יחידה אחת'
    return [{ category: def.category, qty, how, warning: def.note }]
  }
  if (e.kind === 'line') {
    const def = LINES[e.type]
    const L = polyLength(e.pts)
    if (e.type === 'path') return [{ category: 'path', qty: L * e.width, how: `אורך ${n2(L)} מ' × רוחב ${n2(e.width)} מ'` }]
    if (e.type === 'low_wall') return [{ category: 'garden_wall', qty: L * e.height, how: `אורך ${n2(L)} מ' × גובה ${n2(e.height)} מ' (שטח חזית)`, warning: e.height > 1 ? 'קיר מעל מטר: דורש מהנדס מוסמך' : undefined }]
    return [{ category: def.category, qty: L, how: `אורך ${n2(L)} מ'`, warning: def.note }]
  }
  if (e.kind === 'fence') {
    const L = len(e.x1, e.y1, e.x2, e.y2)
    return [{ category: 'fence', qty: L, how: `אורך ${n2(L)} מ'`, warning: e.boundary ? 'גבול מגרש: לאימות במדידה' : undefined }]
  }
  if (e.kind === 'wall' && e.scope === 'garden') {
    const L = len(e.x1, e.y1, e.x2, e.y2)
    return [
      {
        category: 'garden_wall',
        qty: L * e.height,
        how: `אורך ${n2(L)} מ' × גובה ${n2(e.height)} מ' (שטח חזית)`,
        warning: e.height > 1 ? 'קיר מעל מטר או קיר תומך: דורש מהנדס מוסמך' : undefined,
      },
    ]
  }
  return []
}

const PRICE_RANGE = { verified: 0.05, unverified: 0.2 }
const QTY_RANGE: Record<Label, number> = { measured: 0.03, estimated: 0.1, assumed: 0.25 }

export function computeBom(v: Variant, prices: PriceItem[]): BomLine[] {
  const names = numberedNames(v.elements)
  const lines: BomLine[] = []
  for (const e of v.elements) {
    for (const q of quantities(e)) {
      const key = `${e.id}:${q.category}`
      const assigned = v.assignments[key]
      const unit = CATEGORY_UNIT[q.category]
      const existing = isExisting(e)
      const item =
        (assigned ? prices.find((p) => p.code === assigned) : undefined) ??
        (q.prefer ? prices.find((p) => p.code === q.prefer && p.unit === unit) : undefined) ??
        prices.find((p) => p.category === q.category && p.unit === unit) ??
        prices.find((p) => p.category === q.category) ??
        null
      const qty = Math.round(q.qty * 100) / 100
      const unitMismatch = Boolean(item && item.unit !== unit)
      let total: number | null = null
      let min: number | null = null
      let max: number | null = null
      if (item && !unitMismatch && !existing) {
        total = qty * item.price
        const pr = item.verified ? PRICE_RANGE.verified : PRICE_RANGE.unverified
        const qr = QTY_RANGE[e.label]
        min = total * (1 - pr) * (1 - qr)
        max = total * (1 + pr) * (1 + qr)
      }
      lines.push({
        key,
        elementId: e.id,
        elementName: names.get(e.id) ?? elementName(e),
        category: q.category,
        qty,
        unit,
        qtyLabel: e.label,
        item,
        unitMismatch,
        total,
        min,
        max,
        warning: q.warning,
        how: q.how,
        existing,
      })
    }
  }
  return lines
}

export function sumRange(lines: BomLine[]) {
  let min = 0
  let max = 0
  let total = 0
  let missing = 0
  for (const l of lines) {
    if (l.existing) continue
    if (l.total === null) missing++
    else {
      total += l.total
      min += l.min ?? 0
      max += l.max ?? 0
    }
  }
  return { min, max, total, missing }
}

export interface Phase {
  order: number
  name: string
  categories: Category[]
  reversible: boolean
  note: string
}

export const PHASES: Phase[] = [
  { order: 1, name: 'הכנת שטח ועבודות עפר', categories: ['earthwork', 'subbase'], reversible: false, note: 'מפלסים וניקוז לבית: דורש מהנדס מוסמך.' },
  { order: 2, name: 'קירות גינה, גדרות ומבנים', categories: ['garden_wall', 'fence', 'pergola', 'shed', 'outdoor_kitchen'], reversible: false, note: 'קיר תומך או קיר מעל מטר: דורש מהנדס מוסמך. מבני עזר: בדיקה מול הוועדה המקומית.' },
  { order: 3, name: 'תשתיות: השקיה, מים וחשמל', categories: ['irrigation', 'irrigation_line', 'irrigation_point', 'lighting', 'lighting_line', 'water', 'water_feature'], reversible: true, note: 'חיבור למים ולחץ, ותאורה וחשמל: דורש בעל מקצוע וחשמלאי מוסמך.' },
  { order: 4, name: 'ריצוף, דק, שבילים ומשטחים', categories: ['paving', 'tiles', 'stone', 'concrete', 'deck', 'gravel', 'sand', 'path', 'edging'], reversible: false, note: '' },
  { order: 5, name: 'אדמה, שתילה ודשא', categories: ['soil', 'planting', 'lawn', 'turf', 'mulch', 'trees', 'shrubs', 'hedge', 'planters'], reversible: true, note: '' },
  { order: 6, name: 'ריהוט ומתקנים', categories: ['furniture', 'play'], reversible: true, note: '' },
]

export const fmtMoney = (n: number) => '₪' + Math.round(n).toLocaleString('he-IL')
// מספרים: תמיד שתי ספרות אחרי הנקודה (כמויות של יחידות: 0)
export const fmtNum = (n: number, d = 2) => n.toLocaleString('he-IL', { maximumFractionDigits: d, minimumFractionDigits: d })

export const surfaceArea = (e: { poly?: { x: number; y: number }[]; w: number; d: number }) => (e.poly && e.poly.length >= 3 ? Math.abs(polyArea(e.poly)) : e.w * e.d)
