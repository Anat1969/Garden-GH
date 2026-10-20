import type { Element, Label, PriceItem, Project, Unit, Variant } from './types'
import { LINES, MATERIALS, MATERIAL_TEXT, OBJECTS } from './garden'
import { polyArea } from './geom'

export const DISCLAIMER = 'הערכה בלבד עד לאישור מול מחירון מעודכן וספק.'
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
}

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
      return MATERIAL_TEXT[e.material] + n
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

function quantities(e: Element): { category: Category; qty: number; warning?: string }[] {
  if (e.kind === 'surface') {
    const area = surfaceArea(e)
    switch (e.material) {
      case 'paving':
      case 'tiles':
      case 'stone':
      case 'concrete':
        return [
          { category: 'earthwork', qty: area * 0.3 },
          { category: 'subbase', qty: area * 0.15 },
          { category: MATERIALS[e.material].category, qty: area },
        ]
      case 'deck':
        return [
          { category: 'earthwork', qty: area * 0.15 },
          { category: 'deck', qty: area },
        ]
      case 'gravel':
      case 'pebbles':
      case 'sand':
      case 'mulch':
        return [
          { category: 'earthwork', qty: area * 0.1 },
          { category: MATERIALS[e.material].category, qty: area },
        ]
      case 'turf':
        return [
          { category: 'subbase', qty: area * 0.08 },
          { category: 'turf', qty: area },
        ]
      case 'lawn':
        return [
          { category: 'soil', qty: area * 0.15 },
          { category: 'irrigation', qty: area, warning: 'חיבור לקו מים ולחץ: דורש בעל מקצוע מוסמך' },
          { category: 'lawn', qty: area },
        ]
      case 'bed':
        return [
          { category: 'soil', qty: area * 0.4 },
          { category: 'irrigation', qty: area, warning: 'חיבור לקו מים ולחץ: דורש בעל מקצוע מוסמך' },
          { category: 'planting', qty: area },
        ]
      case 'water':
        return [
          { category: 'earthwork', qty: area * 0.6 },
          { category: 'water', qty: area, warning: 'מים, איטום ומשאבה: דורש בעל מקצוע מוסמך' },
        ]
    }
  }
  if (e.kind === 'object') {
    const def = OBJECTS[e.type]
    const qty = CATEGORY_UNIT[def.category] === 'm2' ? e.w * e.d : CATEGORY_UNIT[def.category] === 'm' ? Math.max(e.w, e.d) : 1
    return [{ category: def.category, qty, warning: def.note }]
  }
  if (e.kind === 'line') {
    const def = LINES[e.type]
    const L = polyLength(e.pts)
    if (e.type === 'path') return [{ category: 'path', qty: L * e.width }]
    if (e.type === 'low_wall') return [{ category: 'garden_wall', qty: L * e.height, warning: e.height > 1 ? 'קיר מעל מטר: דורש מהנדס מוסמך' : undefined }]
    return [{ category: def.category, qty: L, warning: def.note }]
  }
  if (e.kind === 'fence') {
    return [{ category: 'fence', qty: len(e.x1, e.y1, e.x2, e.y2), warning: e.boundary ? 'גבול מגרש: לאימות במדידה' : undefined }]
  }
  if (e.kind === 'wall' && e.scope === 'garden') {
    return [
      {
        category: 'garden_wall',
        qty: len(e.x1, e.y1, e.x2, e.y2) * e.height,
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
      const item =
        (assigned ? prices.find((p) => p.code === assigned) : undefined) ??
        prices.find((p) => p.category === q.category && p.unit === unit) ??
        prices.find((p) => p.category === q.category) ??
        null
      const qty = Math.round(q.qty * 100) / 100
      const unitMismatch = Boolean(item && item.unit !== unit)
      let total: number | null = null
      let min: number | null = null
      let max: number | null = null
      if (item && !unitMismatch) {
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
export const fmtNum = (n: number, d = 2) => n.toLocaleString('he-IL', { maximumFractionDigits: d, minimumFractionDigits: 0 })

export const surfaceArea = (e: { poly?: { x: number; y: number }[]; w: number; d: number }) => (e.poly && e.poly.length >= 3 ? Math.abs(polyArea(e.poly)) : e.w * e.d)
