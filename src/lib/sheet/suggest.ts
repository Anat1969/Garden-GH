// הצעות להייקו ולפוסט לפי הפרויקט: מה יש בגינה, החומרים, והתובנה האקלימית. אפשר לדפדף בין הצעות ולערוך.
import type { Project } from '../types'
import { activeVariant } from '../store'
import { MATERIALS } from '../garden'
import { surfaceArea } from '../bom'

interface Feat {
  tree: boolean
  palm: boolean
  lawn: boolean
  stone: boolean
  gravel: boolean
  wood: boolean
  water: boolean
  pergola: boolean
  bench: boolean
}

function features(p: Project): Feat {
  const els = activeVariant(p).elements
  const has = (fn: (e: (typeof els)[number]) => boolean) => els.some(fn)
  const permitTrees = p.permit?.structure?.trees ?? []
  return {
    tree: has((e) => e.kind === 'object' && (e.type === 'tree' || e.type === 'fruit_tree')) || permitTrees.some((t) => t.kind === 'tree'),
    palm: has((e) => e.kind === 'object' && e.type === 'palm') || permitTrees.some((t) => t.kind === 'palm'),
    lawn: has((e) => e.kind === 'surface' && (e.material === 'lawn' || e.material === 'turf')),
    stone: has((e) => e.kind === 'surface' && ['paving', 'stone', 'tiles'].includes(e.material)),
    gravel: has((e) => e.kind === 'surface' && ['gravel', 'pebbles'].includes(e.material)),
    wood: has((e) => e.kind === 'surface' && e.material === 'deck'),
    water: has((e) => (e.kind === 'surface' && e.material === 'water') || (e.kind === 'object' && (e.type === 'pond' || e.type === 'fountain'))),
    pergola: has((e) => e.kind === 'object' && e.type === 'pergola'),
    bench: has((e) => e.kind === 'object' && ['bench', 'dining', 'lounger'].includes(e.type)),
  }
}

// הייקו: שלוש שורות קצרות, תמונה אחת מהגינה. כל אחד מותנה במה שיש בתוכנית
const HAIKU: { need?: keyof Feat; text: string }[] = [
  { need: 'tree', text: 'אבן חמה בבוקר\nצל העץ זז לאט\nקפה מתקרר' },
  { need: 'palm', text: 'רוח ממערב\nעלי הדקל לוחשים\nהבית נושם' },
  { need: 'lawn', text: 'שמש של חורף\nעל הדשא הירוק\nחתול ישן' },
  { need: 'gravel', text: 'שביל של חצץ\nצעדים קטנים אל הגן\nערב יורד' },
  { need: 'pergola', text: 'פרגולה בצהריים\nפסים של אור על השולחן\nהקיץ נח' },
  { need: 'water', text: 'מים בבריכה\nשמיים קטנים בגינה\nציפור שותה' },
  { need: 'stone', text: 'אבן ומים\nצל ראשון על הדשא\nהבית נושם' },
  { need: 'wood', text: 'דק עץ בערב\nחום היום עולה ממנו\nרגליים יחפות' },
  { text: 'גשם ראשון\nריח אדמה בערוגה\nהגן מחכה' },
  { text: 'בוקר בגינה\nאור נמוך בין העלים\nשקט לפני היום' },
]

export function haikuSuggestions(p: Project): string[] {
  const f = features(p)
  const fit = HAIKU.filter((h) => !h.need || f[h.need]).map((h) => h.text)
  return fit.length ? fit : HAIKU.map((h) => h.text)
}

export function postSuggestions(p: Project, insight?: string): string[] {
  const v = activeVariant(p)
  const surfaces = v.elements.filter((e) => e.kind === 'surface')
  const area = surfaces.reduce((s, e) => s + (e.kind === 'surface' ? surfaceArea(e) : 0), 0)
  const byMat = new Map<string, number>()
  for (const e of surfaces) if (e.kind === 'surface') byMat.set(MATERIALS[e.material].text, (byMat.get(MATERIALS[e.material].text) ?? 0) + surfaceArea(e))
  const mats = [...byMat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m)
  const matText = mats.length > 1 ? `${mats.slice(0, -1).join(', ')} ו${mats[mats.length - 1]}` : (mats[0] ?? 'צמחייה')
  const style = v.name.startsWith('הצעה:') ? v.name.replace('הצעה:', '').trim() : null
  const clean = (insight ?? '').replace(/\*\*/g, '')
  const out = [
    `${p.name}: גינה של ${area.toFixed(2)} מ"ר סביב הבית, עם ${matText}. תכנון שמתחיל מהשמש ומהרוח: פינת ישיבה במקום הנוח, צל בקיץ ושמש בחורף.`,
    `מהיתר לגינה. קראנו את התוכנית, בנינו את הבית בתלת-ממד, ותכננו סביבו ${surfaces.length} אזורי גינה${style ? ` בסגנון ${style}` : ''}. ${clean || 'כל מידה מסומנת: מדוד, מוערך או הונח.'}`,
    `גינה שנבנית בשלבים: קודם מפלסים וניקוז, אחר כך ריצוף ושבילים, ובסוף שתילה וריהוט. ${matText} על ${area.toFixed(2)} מ"ר, ותקציב לכל שלב.`,
  ]
  return out
}
