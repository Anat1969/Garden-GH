// קטלוג הגינה: חומרי משטח, פריטים נקודתיים ואלמנטים קוויים.
// כל פריט מגדיר מידות ברירת מחדל, צבע, קטגוריית כתב כמויות, וצורה במודל התלת-ממדי.

import type { Category } from './bom'

export type SurfaceMaterial =
  | 'paving'
  | 'tiles'
  | 'stone'
  | 'concrete'
  | 'deck'
  | 'gravel'
  | 'pebbles'
  | 'lawn'
  | 'turf'
  | 'bed'
  | 'mulch'
  | 'sand'
  | 'water'

export interface MaterialDef {
  text: string
  color: string
  category: Category
  height: number // עובי המשטח במודל (מ')
  tile: number // גודל חזרה של הטקסטורה (מ')
}

export const MATERIALS: Record<SurfaceMaterial, MaterialDef> = {
  paving: { text: 'אבן משתלבת', color: '#bdb6a8', category: 'paving', height: 0.06, tile: 0.6 },
  tiles: { text: 'אריחים', color: '#d8d2c6', category: 'tiles', height: 0.05, tile: 0.8 },
  stone: { text: 'אבן טבעית', color: '#c9bba4', category: 'stone', height: 0.06, tile: 1.6 },
  concrete: { text: 'בטון מוחלק', color: '#c4c6c2', category: 'concrete', height: 0.1, tile: 2 },
  deck: { text: 'דק עץ', color: '#b88a55', category: 'deck', height: 0.15, tile: 1.2 },
  gravel: { text: 'חצץ', color: '#d9d4c7', category: 'gravel', height: 0.05, tile: 0.5 },
  pebbles: { text: 'חלוקי נחל', color: '#bfb7aa', category: 'gravel', height: 0.06, tile: 0.6 },
  lawn: { text: 'דשא', color: '#8fbf86', category: 'lawn', height: 0.04, tile: 0.5 },
  turf: { text: 'דשא סינתטי', color: '#77b26a', category: 'turf', height: 0.03, tile: 0.4 },
  bed: { text: 'ערוגת שתילה', color: '#9b7653', category: 'planting', height: 0.2, tile: 0.8 },
  mulch: { text: 'רסק עץ', color: '#8c5f3c', category: 'mulch', height: 0.06, tile: 0.5 },
  sand: { text: 'חול', color: '#e6d6ad', category: 'sand', height: 0.05, tile: 0.8 },
  water: { text: 'מים / בריכת נוי', color: '#7fb4c9', category: 'water', height: 0.02, tile: 1.2 },
}

export const MATERIAL_TEXT = Object.fromEntries(Object.entries(MATERIALS).map(([k, v]) => [k, v.text])) as Record<SurfaceMaterial, string>
export const MATERIAL_COLOR = Object.fromEntries(Object.entries(MATERIALS).map(([k, v]) => [k, v.color])) as Record<SurfaceMaterial, string>

export type ObjectType =
  | 'tree'
  | 'fruit_tree'
  | 'palm'
  | 'shrub'
  | 'flowers'
  | 'planter'
  | 'pergola'
  | 'bench'
  | 'dining'
  | 'lounger'
  | 'umbrella'
  | 'grill'
  | 'firepit'
  | 'shed'
  | 'play'
  | 'sandbox'
  | 'pond'
  | 'fountain'
  | 'lamp'
  | 'spot'
  | 'tap'

export interface ObjectDef {
  text: string
  group: 'plants' | 'structures' | 'water_light'
  w: number
  d: number
  h: number
  round: boolean
  color: string
  category: Category
  note?: string
}

export const OBJECTS: Record<ObjectType, ObjectDef> = {
  tree: { text: 'עץ', group: 'plants', w: 4, d: 4, h: 5, round: true, color: '#4f7d47', category: 'trees' },
  fruit_tree: { text: 'עץ פרי', group: 'plants', w: 3, d: 3, h: 3.5, round: true, color: '#5c8a3e', category: 'trees' },
  palm: { text: 'דקל', group: 'plants', w: 3, d: 3, h: 6, round: true, color: '#5e8a4e', category: 'trees' },
  shrub: { text: 'שיח', group: 'plants', w: 1.2, d: 1.2, h: 1.2, round: true, color: '#6f9a5f', category: 'shrubs' },
  flowers: { text: 'שתילה עונתית', group: 'plants', w: 1, d: 1, h: 0.4, round: true, color: '#c77d9a', category: 'shrubs' },
  planter: { text: 'אדנית', group: 'plants', w: 1.2, d: 0.5, h: 0.6, round: false, color: '#a07a58', category: 'planters' },
  pergola: { text: 'פרגולה', group: 'structures', w: 4, d: 3, h: 2.6, round: false, color: '#9b7a55', category: 'pergola' },
  bench: { text: 'ספסל', group: 'structures', w: 1.8, d: 0.5, h: 0.45, round: false, color: '#8d6a45', category: 'furniture' },
  dining: { text: 'פינת ישיבה', group: 'structures', w: 2.4, d: 2.4, h: 0.75, round: false, color: '#7c6a58', category: 'furniture' },
  lounger: { text: 'מיטת שיזוף', group: 'structures', w: 0.7, d: 2, h: 0.4, round: false, color: '#d7cdbd', category: 'furniture' },
  umbrella: { text: 'שמשייה', group: 'structures', w: 3, d: 3, h: 2.5, round: true, color: '#e8e2d4', category: 'furniture' },
  grill: { text: 'מטבח חוץ / גריל', group: 'structures', w: 2.4, d: 0.7, h: 0.9, round: false, color: '#8a8f8c', category: 'outdoor_kitchen', note: 'חיבור גז, מים וחשמל: דורש בעל מקצוע מוסמך' },
  firepit: { text: 'פינת אש', group: 'structures', w: 1.2, d: 1.2, h: 0.4, round: true, color: '#7b6b5f', category: 'furniture' },
  shed: { text: 'מחסן גינה', group: 'structures', w: 2, d: 1.5, h: 2.2, round: false, color: '#b5a48c', category: 'shed', note: 'מבנה עזר: בדיקת היתר מול הוועדה המקומית' },
  play: { text: 'מתקן משחק', group: 'structures', w: 3, d: 2, h: 2.4, round: false, color: '#c98f4e', category: 'play' },
  sandbox: { text: 'ארגז חול', group: 'structures', w: 2, d: 2, h: 0.3, round: false, color: '#e6d6ad', category: 'play' },
  pond: { text: 'בריכת נוי', group: 'water_light', w: 3, d: 2, h: 0.5, round: true, color: '#7fb4c9', category: 'water_feature', note: 'מים ואיטום: דורש בעל מקצוע מוסמך' },
  fountain: { text: 'מזרקה', group: 'water_light', w: 1, d: 1, h: 1, round: true, color: '#9fc6d4', category: 'water_feature', note: 'משאבה וחשמל: דורש חשמלאי מוסמך' },
  lamp: { text: 'פנס גינה', group: 'water_light', w: 0.3, d: 0.3, h: 0.8, round: true, color: '#e9d27a', category: 'lighting', note: 'מיקום לעיון בלבד. חשמל: דורש חשמלאי מוסמך' },
  spot: { text: 'ספוט תאורה', group: 'water_light', w: 0.2, d: 0.2, h: 0.2, round: true, color: '#f0dc8c', category: 'lighting', note: 'מיקום לעיון בלבד. חשמל: דורש חשמלאי מוסמך' },
  tap: { text: 'ברז גינה', group: 'water_light', w: 0.3, d: 0.3, h: 0.6, round: false, color: '#6d8fa3', category: 'irrigation_point', note: 'חיבור למים: דורש בעל מקצוע מוסמך' },
}

export type LineType = 'hedge' | 'edging' | 'path' | 'irrigation' | 'low_wall' | 'light_strip'

export interface LineDef {
  text: string
  width: number
  height: number
  color: string
  category: Category
  note?: string
}

export const LINES: Record<LineType, LineDef> = {
  hedge: { text: 'גדר חיה', width: 0.6, height: 1.4, color: '#4f7d47', category: 'hedge' },
  edging: { text: 'אבן שפה', width: 0.1, height: 0.15, color: '#a9a49a', category: 'edging' },
  path: { text: 'שביל', width: 1, height: 0.05, color: '#cfc4b0', category: 'path' },
  irrigation: { text: 'קו השקיה', width: 0.05, height: 0.02, color: '#3b6ea8', category: 'irrigation_line', note: 'חיבור לקו מים ולחץ: דורש בעל מקצוע מוסמך' },
  low_wall: { text: 'קיר נמוך / ספסל בנוי', width: 0.3, height: 0.45, color: '#c8b9a0', category: 'garden_wall' },
  light_strip: { text: 'פס תאורה', width: 0.05, height: 0.05, color: '#f0dc8c', category: 'lighting_line', note: 'חשמל: דורש חשמלאי מוסמך' },
}

export const SKETCH_COLORS = ['#1d2120', '#2f5d4a', '#9b2c2c', '#3b6ea8', '#c98a00', '#7a4fa0', '#8c5f3c']
