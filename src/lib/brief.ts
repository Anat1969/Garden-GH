// תיאור האתגרים של הגינה והצעה תכנונית: קודם המצב האובייקטיבי (אתר, אקלים, היתר), ואז דרישות הלקוח.
// כל טענה נשענת על נתון עם תווית ומקור. אין כאן חוות דעת הנדסית: מים, ניקוז, קירות תמך ומבנה מסומנים לבעל מקצוע.
import type { Element, Label, Opening, Project, Pt, Surface, Variant, Wall } from './types'
import { LABEL_TEXT } from './types'
import { siteField, siteNum, type SiteKey } from './siteData'
import { bearingOf, compassText, type Climate3 } from './climateScores'
import { fnsFromText, budgetLevel, rankStyles } from './variants'
import { FUNCTIONS, type FunctionId } from './designer'
import { unitFootprints } from './structureToElements'
import { polyArea } from './geom'
import { surfaceArea, fmtNum, fmtMoney, hasBasis } from './bom'
import { WIND } from './climate'

export interface Fact {
  k: string
  v: string
  label?: Label
  note?: string
  missing?: boolean
}

export interface SideGap {
  dir: string
  depth: number
}

export interface PermitGeo {
  houseArea: number | null
  houseLabel: Label
  plotArea: number | null
  plotLabel: Label
  gardenArea: number | null
  sides: SideGap[]
  main: SideGap | null
  narrow: SideGap | null
  levelMin: number | null
  levelMax: number | null
  stairs: number
  retaining: number
  trees: number
  doors: string[]
  north: number
  northKnown: boolean
}

const TREE_TYPES = ['tree', 'fruit_tree', 'palm']

function wallPoint(w: Wall, t: number): Pt {
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1
  return { x: w.x1 + ((w.x2 - w.x1) * t) / L, y: w.y1 + ((w.y2 - w.y1) * t) / L }
}

function boxOf(pts: Pt[]) {
  if (!pts.length) return null
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

// גיאומטריה מההיתר ומהתוכנית: בית, מגרש, צדדי הגינה, מפלסים, יציאות לגינה
export function permitGeo(p: Project, v: Variant): PermitGeo {
  const els = v.elements
  const north = p.north || 0
  const northKnown = Boolean(p.extracted?.north || p.northSet)
  const house = els.filter((e): e is Wall => e.kind === 'wall' && e.scope === 'house')
  const hb = boxOf(house.flatMap((w) => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]))
  const fences = els.filter((e) => e.kind === 'fence' && e.boundary)
  const pb = boxOf(fences.flatMap((f) => (f.kind === 'fence' ? [{ x: f.x1, y: f.y1 }, { x: f.x2, y: f.y2 }] : [])))
  const prints = unitFootprints(p)
  let houseArea: number | null = null
  let houseLabel: Label = 'estimated'
  if (prints.length) {
    houseArea = prints.reduce((a, f) => a + Math.abs(polyArea(f)), 0)
    houseLabel = p.permit?.scale.source === 'text' || p.permit?.scale.source === 'dimensions' ? 'measured' : 'estimated'
  } else if (hb) houseArea = (hb.x1 - hb.x0) * (hb.y1 - hb.y0)
  let plotArea: number | null = p.plotArea && p.plotArea > 0 ? p.plotArea : null
  const plotLabel: Label = plotArea ? (p.extracted?.plotArea ? 'measured' : 'assumed') : 'estimated'
  if (!plotArea && pb) plotArea = (pb.x1 - pb.x0) * (pb.y1 - pb.y0)
  const gardenArea = plotArea !== null && houseArea !== null ? Math.max(0, plotArea - houseArea) : null

  const sides: SideGap[] = []
  if (hb && pb) {
    const push = (dx: number, dy: number, depth: number) => sides.push({ dir: compassText(bearingOf(dx, dy, north)), depth: Math.max(0, depth) })
    push(0, -1, hb.y0 - pb.y0)
    push(0, 1, pb.y1 - hb.y1)
    push(1, 0, pb.x1 - hb.x1)
    push(-1, 0, hb.x0 - pb.x0)
  }
  const sorted = [...sides].sort((a, b) => b.depth - a.depth)
  const main = sorted[0] ?? null
  const narrow = sorted.length ? sorted[sorted.length - 1] : null

  const levels: number[] = []
  let stairs = 0
  for (const e of els) {
    if (e.kind !== 'surface') continue
    levels.push(e.level)
    if (e.stairs) {
      stairs++
      levels.push(e.stairs.bottom)
    }
  }
  const retaining = els.filter((e) => e.kind === 'wall' && e.scope === 'garden').length
  const trees = els.filter((e) => e.kind === 'object' && TREE_TYPES.includes(e.type)).length

  const doors: string[] = []
  if (hb) {
    const cx = (hb.x0 + hb.x1) / 2
    const cy = (hb.y0 + hb.y1) / 2
    const byId = new Map(house.map((w) => [w.id, w]))
    for (const o of els.filter((e): e is Opening => e.kind === 'opening' && e.type === 'door')) {
      const w = byId.get(o.wallId)
      if (!w) continue
      const m = wallPoint(w, o.offset + o.width / 2)
      doors.push(compassText(bearingOf(m.x - cx, m.y - cy, north)))
    }
  }
  return {
    houseArea,
    houseLabel,
    plotArea,
    plotLabel,
    gardenArea,
    sides,
    main,
    narrow,
    levelMin: levels.length ? Math.min(...levels) : null,
    levelMax: levels.length ? Math.max(...levels) : null,
    stairs,
    retaining,
    trees,
    doors,
    north,
    northKnown,
  }
}

const count = (list: string[]) => {
  const m = new Map<string, number>()
  for (const x of list) m.set(x, (m.get(x) ?? 0) + 1)
  return [...m.entries()].map(([k, n]) => (n > 1 ? `${n} ב${k}` : `ב${k}`)).join(', ')
}

// הנתונים מההיתר, כרשימת עובדות עם תווית
export function permitFacts(p: Project, v: Variant, g = permitGeo(p, v)): Fact[] {
  const f: Fact[] = []
  f.push(
    g.northKnown
      ? { k: 'חץ הצפון', v: `${fmtNum(g.north, 0)} מעלות`, label: p.extracted?.north ? 'measured' : 'assumed', note: p.extracted?.north ? `חולץ ${p.extracted.north}` : 'הוזן ידנית' }
      : { k: 'חץ הצפון', v: 'לא חולץ', missing: true, note: 'בלי צפון אין כיווני שמש ורוח אמינים' },
  )
  f.push(
    p.baseLevel !== undefined || p.building?.baseAbs
      ? { k: '±0.00 מוחלט', v: `${fmtNum(p.baseLevel ?? p.building?.baseAbs ?? 0)} מ'`, label: p.extracted?.baseLevel ? 'measured' : 'assumed' }
      : { k: '±0.00 מוחלט', v: 'לא ידוע', missing: true },
  )
  f.push(g.plotArea !== null ? { k: 'שטח המגרש', v: `${fmtNum(g.plotArea)} מ"ר`, label: g.plotLabel, note: g.plotLabel === 'estimated' ? 'מהמלבן החוסם של גבול המגרש' : undefined } : { k: 'שטח המגרש', v: 'לא ידוע', missing: true })
  f.push(g.houseArea !== null ? { k: 'תכסית הבית', v: `${fmtNum(g.houseArea)} מ"ר`, label: g.houseLabel } : { k: 'תכסית הבית', v: 'לא נבנה הבית', missing: true })
  if (g.gardenArea !== null) f.push({ k: 'שטח הגינה', v: `${fmtNum(g.gardenArea)} מ"ר`, label: 'estimated', note: 'מגרש פחות תכסית' })
  if (g.sides.length) {
    f.push({ k: 'צדדי הגינה (עומק מהבית לגבול)', v: [...g.sides].sort((a, b) => b.depth - a.depth).map((s) => `${s.dir} ${fmtNum(s.depth)} מ'`).join(' · '), label: 'estimated', note: g.northKnown ? undefined : 'הכיוונים לפי צפון שלא אושר' })
    if (g.main) f.push({ k: 'החצר העיקרית', v: `צד ה${g.main.dir}, עומק ${fmtNum(g.main.depth)} מ'`, label: 'estimated' })
  } else f.push({ k: 'העמדת הבית במגרש', v: 'חסר בית או גבול מגרש בתוכנית', missing: true })
  f.push(g.doors.length ? { k: 'יציאות מהבית', v: count(g.doors), label: 'estimated' } : { k: 'יציאות מהבית', v: 'לא זוהו דלתות', missing: true })
  if (g.levelMin !== null && g.levelMax !== null)
    f.push({ k: 'הפרש מפלסים בגינה', v: `${fmtNum(g.levelMax - g.levelMin)} מ' (${fmtNum(g.levelMin)} עד ${fmtNum(g.levelMax)})`, label: 'estimated', note: g.stairs ? `${g.stairs} גרמי מדרגות` : undefined })
  f.push({ k: 'קירות פיתוח ותמך', v: g.retaining ? `${g.retaining}` : 'אין', label: 'estimated' })
  f.push({ k: 'עצים בתוכנית', v: g.trees ? `${g.trees}` : 'לא סומנו', label: g.trees ? 'estimated' : undefined, missing: !g.trees, note: g.trees ? 'לבדוק בשטח אילו קיימים ולשימור' : 'סקר צמחייה קיימת חסר' })
  if (p.building?.storeys) f.push({ k: 'קומות', v: `${p.building.storeys}`, label: 'measured', note: p.building.ridgeRel ? `רום גג ${fmtNum(p.building.ridgeRel)} מ'` : undefined })
  return f
}

// ---------- ניתוח לפי צדדים ----------

interface Sector {
  name: string
  n: number
  sunW: number
  shS: number
  wind: number
  comf: number
}

export function sectorStats(c: Climate3): Sector[] {
  const g = c.grid
  let hx = 0, hy = 0, hn = 0
  for (let i = 0; i < g.house.length; i++)
    if (g.house[i]) {
      hx += i % g.nx
      hy += Math.floor(i / g.nx)
      hn++
    }
  if (!hn) return []
  const cx = g.x0 + (hx / hn + 0.5) * g.cell
  const cy = g.y0 + (hy / hn + 0.5) * g.cell
  const DIRS = ['צפון', 'צפון-מזרח', 'מזרח', 'דרום-מזרח', 'דרום', 'דרום-מערב', 'מערב', 'צפון-מערב']
  const acc = DIRS.map((name) => ({ name, n: 0, sunW: 0, shS: 0, wind: 0, comf: 0 }))
  for (let i = 0; i < g.house.length; i++) {
    if (!g.inSite[i] || g.house[i] || Number.isNaN(c.shade.summer[i])) continue
    const x = g.x0 + ((i % g.nx) + 0.5) * g.cell
    const y = g.y0 + (Math.floor(i / g.nx) + 0.5) * g.cell
    const a = acc[Math.round(bearingOf(x - cx, y - cy, c.site.north) / 45) % 8]
    a.n++
    a.sunW += c.sunHours.winter[i]
    a.shS += c.shade.summer[i]
    a.wind += Math.max(c.wind.winter[i], c.wind.summer[i])
    a.comf += c.comfort.year[i]
  }
  return acc.filter((a) => a.n >= 12).map((a) => ({ ...a, sunW: a.sunW / a.n, shS: a.shS / a.n, wind: a.wind / a.n, comf: a.comf / a.n }))
}

const best = (list: Sector[], f: (s: Sector) => number) => (list.length ? [...list].sort((a, b) => f(b) - f(a))[0] : null)

// ---------- אתגרים ----------

export type Level = 'גבוה' | 'בינוני' | 'נמוך'

export interface Challenge {
  id: string
  area: 'אקלים' | 'מים' | 'קרקע' | 'מפלסים' | 'העמדה ופריסה' | 'סביבה' | 'ודאות הנתונים' | 'דרישות הלקוח'
  level: Level
  title: string
  text: string
  evidence: string
}

export interface Proposal {
  title: string
  text: string
  answers?: string // לאיזה אתגר או דרישה
}

export interface Brief {
  geo: PermitGeo
  facts: Fact[]
  sectors: Sector[]
  challenges: Challenge[]
  objective: Proposal[]
  client: Proposal[]
  conflicts: Proposal[]
  styleName: string | null
  summary: string
}

const ev = (p: Project, k: SiteKey, unit = '') => {
  const f = siteField(p, k)
  if (!f) return ''
  const v = typeof f.v === 'number' ? fmtNum(f.v, Number.isInteger(f.v) ? 0 : 1) : f.v
  return `${v}${unit ? ' ' + unit : ''} (${LABEL_TEXT[f.label]}, ${f.source})`
}

const LEVEL_ORDER: Record<Level, number> = { גבוה: 0, בינוני: 1, נמוך: 2 }

export function buildBrief(p: Project, v: Variant, c: Climate3 | null): Brief {
  const geo = permitGeo(p, v)
  const facts = permitFacts(p, v, geo)
  const sectors = c ? sectorStats(c) : []
  const ch: Challenge[] = []
  const add = (x: Challenge) => ch.push(x)
  const region = String(siteField(p, 'region')?.v ?? '')

  const augMax = siteNum(p, 'augMax')
  const hot = siteNum(p, 'hotDays') ?? 0
  const janMin = siteNum(p, 'janMin')
  const frost = siteNum(p, 'frostDays') ?? 0
  const rain = siteNum(p, 'rainYear')
  const et0 = siteNum(p, 'et0Year')
  const deficit = siteNum(p, 'waterDeficit') ?? (rain !== null && et0 !== null ? et0 - rain : null)
  const coast = siteNum(p, 'coastKm')
  const elev = siteNum(p, 'elevation')
  const soil = p.soil || String(siteField(p, 'soilTypical')?.v ?? '')
  const exposed = sectors.filter((s) => ['דרום', 'דרום-מערב', 'מערב', 'דרום-מזרח'].includes(s.name)).sort((a, b) => a.shS - b.shS)[0]
  const windy = best(sectors, (s) => s.wind)
  const sunny = best(sectors, (s) => s.sunW)
  const shady = best(sectors, (s) => s.shS)
  const comfy = best(sectors, (s) => s.comf)

  // אקלים: חום הקיץ ושמש אחר הצהריים
  if (augMax !== null)
    add({
      id: 'heat',
      area: 'אקלים',
      level: augMax >= 34 || hot >= 20 ? 'גבוה' : augMax >= 31 ? 'בינוני' : 'נמוך',
      title: 'חום הקיץ ושמש אחר הצהריים',
      text:
        `הקיץ ארוך וחם, ${hot ? `כ-**${hot} ימים בשנה מעל 35 מעלות**` : 'עם גלי שרב'}.` +
        (exposed ? ` **צד ה${exposed.name}** של הגינה כמעט בלי צל בקיץ (${Math.round(exposed.shS * 100)}% מהיום), ומשטחים קשים שם יתחממו ויקרינו לבית.` : ' צד המערב והדרום-מערב חשופים לשמש הנמוכה של אחר הצהריים.') +
        ' הגינה צריכה **צל אמיתי** במקומות השהייה, לא רק צמחייה.',
      evidence: `מקסימום אוגוסט ${ev(p, 'augMax', '°C')}; ימים חמים ${ev(p, 'hotDays', 'ימים')}`,
    })
  // אקלים: חורף, קרה ושמש נמוכה
  if (janMin !== null)
    add({
      id: 'winter',
      area: 'אקלים',
      level: frost >= 5 ? 'גבוה' : frost >= 1 || janMin < 5 ? 'בינוני' : 'נמוך',
      title: frost >= 1 ? 'קרה בחורף ושמש נמוכה' : 'חורף מתון ושמש נמוכה',
      text:
        (frost >= 1 ? `יש כ-**${frost} לילות קרה בשנה**: צמחים טרופיים, בוגנוויליה צעירה ופיקוס רגיש ייפגעו. ` : 'קרה נדירה, אבל לילות החורף קרים. ') +
        `השמש בצהרי החורף בגובה **${ev(p, 'sunWinterNoon', '°').split(' (')[0]}** בלבד, ולכן צל של הבית והגדרות ארוך.` +
        (sunny ? ` השמש של החורף נשארת ב**צד ה${sunny.name}** (${fmtNum(sunny.sunW)} שעות ביום).` : ''),
      evidence: `מינימום ינואר ${ev(p, 'janMin', '°C')}; ימי קרה ${ev(p, 'frostDays', 'ימים')}`,
    })
  // רוח
  const ww = WIND[c?.site.region ?? 'inland']
  add({
    id: 'wind',
    area: 'אקלים',
    level: (elev ?? 0) > 500 || (coast ?? 99) < 2 ? 'גבוה' : 'בינוני',
    title: 'רוח: סופות חורף ובריזת קיץ',
    text:
      `בחורף הרוח החזקה מגיעה מ**${ww.winter.text}**, ובקיץ הבריזה מ**${ww.summer.text}**. ` +
      (windy ? `בגינה הצד החשוף ביותר הוא **צד ה${windy.name}** (${fmtNum(windy.wind)} מ"ש בגובה ישיבה). ` : '') +
      'האתגר כפול: **לחסום את רוח החורף בלי לחסום את בריזת הקיץ**.',
    evidence: `רוח בחורף ${ev(p, 'windWinter')}; בקיץ ${ev(p, 'windSummer')}`,
  })
  // מליחות ורסס ים
  if (coast !== null && coast < 3)
    add({
      id: 'salt',
      area: 'סביבה',
      level: coast < 1 ? 'גבוה' : 'בינוני',
      title: 'רסס ים ומליחות',
      text: `האתר במרחק **${fmtNum(coast, 1)} ק"מ מהים**. הרוח המערבית נושאת מלח שפוגע בעלווה, מחליד מתכת ושוחק עץ. צריך **צמחים עמידי מליחות** בחזית הרוח, ופרזול מנירוסטה או אלומיניום.`,
      evidence: `מרחק מהים ${ev(p, 'coastKm', 'ק"מ')}`,
    })
  // מים
  if (deficit !== null)
    add({
      id: 'water',
      area: 'מים',
      level: deficit > 1100 ? 'גבוה' : deficit > 700 ? 'בינוני' : 'נמוך',
      title: 'גירעון מים והשקיה',
      text:
        `הגשם (${rain !== null ? `**${fmtNum(rain, 0)} מ"מ**` : 'לא ידוע'}) יורד בחורף בלבד, וההתאדות השנתית ${et0 !== null ? `**${fmtNum(et0, 0)} מ"מ**` : 'גבוהה'}: גירעון של כ-**${fmtNum(deficit, 0)} מ"מ בשנה**. ` +
        'כל מ"ר של דשא דורש השקיה מאפריל עד נובמבר. האתגר: **גינה ירוקה עם מעט מים**, וקליטת מי הגגות בחורף במקום להזרים אותם לרחוב.',
      evidence: `משקעים ${ev(p, 'rainYear', 'מ"מ')}; ET0 ${ev(p, 'et0Year', 'מ"מ')}`,
    })
  // קרקע
  add({
    id: 'soil',
    area: 'קרקע',
    level: /חרסית|מילוי|סלע|מלוח/.test(soil) ? 'גבוה' : p.soil ? 'נמוך' : 'בינוני',
    title: 'קרקע וניקוז',
    text:
      (p.soil ? `הקרקע שהוזנה: **${p.soil}**. ` : `לא נבדקה קרקע. באזור ${region} הקרקע האופיינית: **${soil}**. `) +
      (/חרסית/.test(soil)
        ? 'חרסית נאטמת בחורף וסודקת בקיץ: צריך **שיפור קרקע ושכבת ניקוז** בערוגות, ולהרחיק מים מהיסודות.'
        : /חול|חולית/.test(soil)
          ? 'קרקע חולית מנקזת מהר ולא שומרת מים ודשן: צריך **קומפוסט וחיפוי** כדי להחזיק מים.'
          : /סלע|רדוד|גיר/.test(soil)
            ? 'שכבת קרקע רדודה על סלע: לעצים צריך **בורות שתילה גדולים** או ערוגות מוגבהות.'
            : 'סביב בית חדש יש לרוב **פסולת בנייה ומילוי מהודק**: צריך לפנות ולהביא אדמה גננית.') +
      ' ניקוז לבית ולמבנה: **דורש מהנדס מוסמך**.',
    evidence: p.soil ? 'סוג קרקע שהוזן בפרויקט (הונח)' : `קרקע אופיינית ${ev(p, 'soilTypical')}`,
  })
  // מפלסים
  if (geo.levelMin !== null && geo.levelMax !== null && geo.levelMax - geo.levelMin >= 0.3)
    add({
      id: 'levels',
      area: 'מפלסים',
      level: geo.levelMax - geo.levelMin >= 1.2 ? 'גבוה' : 'בינוני',
      title: 'הפרשי מפלסים',
      text: `בין המפלסים בגינה יש **${fmtNum(geo.levelMax - geo.levelMin)} מ'**${geo.stairs ? `, ו-**${geo.stairs} גרמי מדרגות**` : ''}${geo.retaining ? ` ו-${geo.retaining} קירות פיתוח` : ''}. האתגר: לחבר את המפלסים **בנוחות ובבטיחות** (מעקה מעל 0.50 מ' הפרש לפי התקנות, לבדיקה), ולנקז את המים במורד בלי להציף את המפלס התחתון. קירות תמך: **דורש מהנדס מוסמך**.`,
      evidence: 'מפלסי המשטחים בתוכנית (מוערך)',
    })
  // העמדה ופריסה
  if (geo.main && geo.narrow && geo.sides.length)
    add({
      id: 'layout',
      area: 'העמדה ופריסה',
      level: geo.narrow.depth < 1.5 ? 'בינוני' : 'נמוך',
      title: 'העמדת הבית במגרש',
      text:
        `החצר העיקרית ב**צד ה${geo.main.dir}** (עומק ${fmtNum(geo.main.depth)} מ'), והצרה ב**צד ה${geo.narrow.dir}** (${fmtNum(geo.narrow.depth)} מ').` +
        (geo.narrow.depth < 1.5 ? ' המעבר הצר מגביל **הכנסת ציוד, אדמה ועצים גדולים**, ויש לתכנן את סדר הביצוע בהתאם.' : '') +
        (geo.doors.length ? ` היציאות מהבית ${count(geo.doors)}: שם תהיה התנועה העיקרית.` : '') +
        (geo.main && comfy && comfy.name !== geo.main.dir ? ` המקום הנוח אקלימית הוא דווקא **צד ה${comfy.name}**, לא החצר הגדולה.` : ''),
      evidence: `צדדים מהתוכנית ומחץ הצפון (${geo.northKnown ? 'אושר' : 'לא אושר'})`,
    })
  // ודאות
  const missing = facts.filter((f) => f.missing).map((f) => f.k)
  if (!p.location || !geo.northKnown || missing.length || !p.site?.live)
    add({
      id: 'data',
      area: 'ודאות הנתונים',
      level: !geo.northKnown || !p.location ? 'גבוה' : 'בינוני',
      title: 'נתונים חסרים',
      text:
        [
          !p.location ? 'הפרויקט **לא מוקם על המפה**' : '',
          !geo.northKnown ? '**כיוון הצפון לא אושר**, ולכן כל ניתוח השמש והרוח על תנאי' : '',
          p.location && !p.site?.live ? 'נתוני האקלים הם **ממוצע אזורי** ולא נתוני המיקום' : '',
          missing.length ? `חסרים: ${missing.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('. ') + '.',
      evidence: 'תמונת המצב של התהליך',
    })

  // ---------- דרישות הלקוח ----------
  const req = v.requirements
  const fns = fnsFromText(req.functions)
  const budget = budgetLevel(req.budget)
  const ranked = rankStyles(fns, budget, `${req.plants} ${req.constraints}`)
  const style = ranked[0] ?? null
  const conflicts: Proposal[] = []
  const wantsLawn = /דשא(?! סינתטי)/.test(req.materials)
  if (wantsLawn && deficit !== null && deficit > 700)
    conflicts.push({ title: 'דשא מול גירעון מים', text: `הלקוח ביקש **דשא**, והגירעון ${fmtNum(deficit, 0)} מ"מ בשנה. הצעה: מדשאה אחת קטנה ושימושית (עד כ-**15% מהגינה**) במקום השטוח והשמשי, ושאר השטח בצמחייה חסכונית וחיפוי.`, answers: 'מים' })
  if (fns.includes('lowMaint') && (fns.includes('edible') || /פורחת/.test(req.plants)))
    conflicts.push({ title: 'תחזוקה נמוכה מול ירקות ופריחה', text: 'ערוגות ירק ופריחה עונתית דורשות עבודה שבועית. הצעה: **ערוגה מוגבהת אחת** קרובה למטבח עם טפטוף ושעון, ושאר הגינה רב-שנתית.', answers: 'תחזוקה' })
  if (fns.includes('kids') && fns.includes('water'))
    conflicts.push({ title: 'ילדים ומים', text: 'מים פתוחים ליד ילדים קטנים: עדיף **מזרקה ללא מאגר פתוח** (מים על חצץ), או בריכה מגודרת. בטיחות: לבדיקה מול תקן.', answers: 'בטיחות' })
  if (fns.includes('kids') && /קוצ|בצקנ|צבר/.test(`${req.plants}`))
    conflicts.push({ title: 'ילדים וצמחים קוצניים', text: 'צמחים קוצניים רחוקים ממשטח המשחק ומהשבילים.', answers: 'בטיחות' })
  if (/צל כבד/.test(req.constraints) && wantsLawn) conflicts.push({ title: 'צל כבד ודשא', text: 'דשא לא מחזיק בצל של יותר מחצי יום. הצעה: **חיפוי, שרכים ומכסי קרקע לצל** במקום דשא.', answers: 'אקלים' })
  if (req.budget && geo.gardenArea) {
    const perM = req.budget / geo.gardenArea
    if (perM < 250)
      conflicts.push({ title: 'תקציב מול שטח', text: `התקציב **${fmtMoney(req.budget)}** הוא כ-**${fmtMoney(perM)} למ"ר** גינה. זה מספיק לתשתית, השקיה, שתילה וחיפוי, לא לריצוף נרחב ולפרגולות. הצעה: **ביצוע בשלבים**, קודם תשתיות ומשטח אחד.`, answers: 'תקציב' })
  }
  for (const x of conflicts) add({ id: `c-${x.title}`, area: 'דרישות הלקוח', level: 'בינוני', title: x.title, text: x.text, evidence: 'דרישות הלקוח מול נתוני האתר' })

  ch.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])

  // ---------- הצעה: מענה למצב האובייקטיבי ----------
  const objective: Proposal[] = []
  objective.push({
    title: 'חלוקה לאזורים לפי שמש ורוח',
    answers: 'אקלים',
    text:
      [
        comfy ? `**פינת השהייה העיקרית** בצד ה${comfy.name}, המקום הנוח ביותר כל השנה` : '**פינת השהייה העיקרית** במקום שיש בו שמש בחורף וצל בקיץ (לבדוק במסך האקלים)',
        sunny ? `**ישיבת חורף**, דשא וערוגות שמש בצד ה${sunny.name}` : '',
        shady ? `**ישיבת קיץ** בצד ה${shady.name}, שם הצל העמוק` : '',
      ]
        .filter(Boolean)
        .join('. ') + '.',
  })
  objective.push({
    title: 'צל נשיר ולא רק קבוע',
    answers: 'חום',
    text: `${exposed ? `בצד ה${exposed.name}` : 'בצד הדרום-מערבי'} **עץ נשיר** (מילה, צאלון, ברכיכיטון נשיר) או **פרגולה עם מטפס נשיר**: צל בקיץ ושמש בחורף. עצים במרחק של לפחות 3 מ' מהבית ומצנרת. משטחים קשים בגוון בהיר שלא מתחמם.`,
  })
  objective.push({
    title: 'שבירת רוח בלי לחסום בריזה',
    answers: 'רוח',
    text: `**גדר חיה חדירה למחצה** (כ-50% חדירות) בצד ${ww.winter.text}, שמקטינה את הרוח בכחצי לאורך פי 5 עד 10 מגובהה. בצד ${ww.summer.text} משאירים פתוח לבריזה. קיר אטום יוצר מערבולת, ולכן עדיף צמחייה או סבכה.`,
  })
  objective.push({
    title: 'הידרוזונים: מים לפי צורך',
    answers: 'מים',
    text: '**שלושה אזורי השקיה**: ליד הבית צמחייה רוויה יותר (מעט), באמצע צמחייה ים-תיכונית, ובשוליים צמחייה שלא צריכה השקיה אחרי שנתיים. טפטוף בלבד בערוגות, חיפוי של 7 עד 10 ס"מ, ו**קליטת מי גגות** בערוגה שקועה או בור חלחול (מיקום מול מהנדס).',
  })
  objective.push({
    title: 'קרקע ומפלסים',
    answers: 'קרקע',
    text:
      'בדיקת קרקע לפני שתילה, פינוי פסולת בנייה, ושיפוע של 1% עד 2% **הרחק מהבית** בכל משטח.' +
      (geo.levelMin !== null && geo.levelMax !== null && geo.levelMax - geo.levelMin >= 0.3 ? ' המפלסים מחוברים במדרגות רחבות (שלח 30 עד 40 ס"מ) עם ערוגה בצד במקום מעקה, ככל שהתקנות מאפשרות.' : ''),
  })
  if (coast !== null && coast < 3) objective.push({ title: 'חזית מלח', answers: 'סביבה', text: 'בשורה הראשונה מול הים: **מיאופורום, אטריפלקס, פיטוספורום, תמריקס**, ומאחוריהם הצמחייה העדינה.' })
  if (frost >= 1) objective.push({ title: 'בחירת צמחים לקרה', answers: 'אקלים', text: 'צמחים רגישים לקרה רק בצמוד לקיר דרומי של הבית, ושאר הצמחייה עמידה עד מינוס 3.' })

  // ---------- הצעה: מענה לדרישות הלקוח ----------
  const client: Proposal[] = []
  const place = (fid: FunctionId): string => {
    switch (fid) {
      case 'dining':
      case 'bbq':
        return comfy ? `בצד ה${comfy.name}, קרוב ליציאה מהמטבח${geo.doors.length ? ` (יציאות ${count(geo.doors)})` : ''}` : 'קרוב ליציאה מהמטבח'
      case 'lounge':
        return shady ? `בצד ה${shady.name} לקיץ, ובצד ה${sunny?.name ?? 'הדרום'} לחורף` : 'במקום מוצל בקיץ'
      case 'kids':
        return `במקום שרואים מהבית${geo.main ? `, בחצר העיקרית בצד ה${geo.main.dir}` : ''}, עם צל אחר הצהריים`
      case 'edible':
        return sunny ? `בצד ה${sunny.name}, לפחות 6 שעות שמש` : 'במקום עם לפחות 6 שעות שמש'
      case 'water':
        return 'בחצי צל, ליד פינת הישיבה, כדי לשמוע אותם ולהפחית אידוי'
      case 'shade':
        return exposed ? `בצד ה${exposed.name}, החשוף בקיץ` : 'מעל פינת השהייה'
      case 'privacy':
        return 'לאורך הגבולות מול חלונות השכנים: לאמת בשטח מאיזה צד המבט'
      case 'pets':
        return windy && shady ? `פינה מוצלת ושקטה מרוח, לא בצד ה${windy.name}` : 'פינה מוצלת עם משטח קשיח לניקוי'
      case 'lowMaint':
        return 'בכל הגינה: רב-שנתיים, חיפוי, טפטוף עם מחשב השקיה'
    }
  }
  for (const fid of fns) {
    const f = FUNCTIONS.find((x) => x.id === fid)
    if (f) client.push({ title: f.text, text: place(fid), answers: 'דרישה' })
  }
  if (req.plants.trim()) client.push({ title: 'צמחייה', text: `${req.plants}: לבחור מתוך הצמחים שמתאימים ל${region || 'אזור'}, ${deficit !== null && deficit > 700 ? 'בדגש על חסכוניים במים' : 'עם השקיה מותאמת'}.` })
  if (req.materials.trim()) client.push({ title: 'חומרים', text: `${req.materials}: ${augMax !== null && augMax >= 31 ? 'בגוונים בהירים, ובלי משטח קשה גדול בשמש מלאה' : 'לפי הסגנון'}${coast !== null && coast < 3 ? '; עץ ומתכת עמידים למליחות' : ''}.` })
  if (style) client.push({ title: `סגנון מומלץ: ${style.name}`, text: `${style.tagline}. תחזוקה ${style.maintenance}, מים ${style.water}, תקציב ${style.budget}.` })

  const hi = ch.filter((x) => x.level === 'גבוה').map((x) => x.title)
  const summary =
    `הגינה ${geo.gardenArea !== null ? `(כ-${fmtNum(geo.gardenArea, 0)} מ"ר)` : ''} ${region ? `ב${region}` : ''} צריכה לעמוד ב-${ch.length} אתגרים` +
    (hi.length ? `, והעיקריים: ${hi.join(', ')}.` : '.') +
    (hasBasis(p) ? '' : ' אין עדיין קנה מידה מההיתר, ולכן המידות לא סופיות.')
  return { geo, facts, sectors, challenges: ch, objective, client, conflicts, styleName: style?.name ?? null, summary: summary.replace(/\s+/g, ' ').trim() }
}

const strip = (s: string) => s.replace(/\*\*/g, '')

// נוסח מוכן להעתקה: האתגרים, ההצעה למצב האובייקטיבי וההצעה לדרישות הלקוח
export function briefText(p: Project, b: Brief): string {
  const L: string[] = []
  L.push(`אתגרי הגינה והצעה תכנונית: ${p.name}`)
  if (p.address) L.push(p.address)
  L.push('')
  L.push(strip(b.summary))
  L.push('')
  L.push('האתגרים')
  b.challenges.forEach((c, i) => L.push(`${i + 1}. ${c.title} (${c.area}, חשיבות ${c.level}): ${strip(c.text)}`))
  L.push('')
  L.push('הצעה תכנונית: מענה למצב האובייקטיבי')
  b.objective.forEach((o, i) => L.push(`${i + 1}. ${o.title}: ${strip(o.text)}`))
  L.push('')
  L.push('הצעה תכנונית: מענה לדרישות הלקוח')
  if (!b.client.length) L.push('עוד לא הוגדרו דרישות לקוח.')
  b.client.forEach((o, i) => L.push(`${i + 1}. ${o.title}: ${strip(o.text)}`))
  L.push('')
  L.push('כל הנתונים מסומנים מדוד, מוערך או הונח. ניקוז, קירות תמך, חשמל ומים: דורש מהנדס או חשמלאי מוסמך.')
  return L.join('\n')
}

export const surfaceSum = (els: Element[]) => els.filter((e): e is Surface => e.kind === 'surface').reduce((a, s) => a + surfaceArea(s), 0)
