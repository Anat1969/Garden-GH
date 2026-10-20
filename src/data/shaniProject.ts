import type { Building, PlanStructure, Project, Pt } from '../lib/types'
import { newVariant, uid } from '../lib/store'
import { structureToElements } from '../lib/structureToElements'

// פרויקט לדוגמה: הבית של שני. נבנה מקריאה ידנית של תוכנית קומת הקרקע בהיתר הסרוק
// (בית דו-משפחתי, שתי יחידות מראה). היחידות: פיקסלים של הסריקה ב-200dpi,
// קנה מידה 81.1 פיקסל למטר, נמדד משרשראות המידה 1115, 910 ו-205.
// קובץ ההיתר עצמו לא נכלל באפליקציה הציבורית.

const PX_PER_M = 81.1
const MIRROR_X = 3400 // קיר ההפרדה בין היחידות ב-1700
const m = (x: number, y: number): Pt => ({ x: MIRROR_X - x, y })
const mirror = (ps: Pt[]) => ps.map((p) => m(p.x, p.y)).reverse()
const P = (x: number, y: number): Pt => ({ x, y })

const westUnit: Pt[] = [
  P(800, 975), P(1105, 975), P(1105, 1400), P(1435, 1400), P(1435, 1225), P(1700, 1225),
  P(1700, 1945), P(1460, 1945), P(1460, 2000), P(1080, 2000), P(1040, 1990), P(1010, 1960),
  P(1000, 1920), P(1000, 1440), P(900, 1440), P(900, 1320), P(800, 1320),
]

type Op = PlanStructure['openings'][number]
const westOpenings: Op[] = [
  { type: 'door', a: P(1000, 1460), b: P(1000, 1550) },
  { type: 'window', a: P(1000, 1560), b: P(1000, 1610) },
  { type: 'sliding_door', a: P(1000, 1660), b: P(1000, 1905) },
  { type: 'window', a: P(1080, 2000), b: P(1165, 2000) },
  { type: 'sliding_door', a: P(1330, 2000), b: P(1455, 2000) },
  { type: 'window', a: P(1560, 1945), b: P(1665, 1945) },
]
const eastOpenings: Op[] = westOpenings.map((o) => ({ type: o.type, a: m(o.a.x, o.a.y), b: m(o.b.x, o.b.y) }))

const nwLawn = [P(330, 700), P(1100, 620), P(1100, 975), P(800, 975), P(800, 1380), P(380, 1380)]

export const SHANI_STRUCTURE: Omit<PlanStructure, 'drawingId' | 'readAt'> = {
  northDeg: 315,
  units: [
    { name: 'יחידה מערבית', footprint: westUnit, wallCm: 25, levelRel: 0, levelAbs: 699 },
    { name: 'יחידה מזרחית', footprint: mirror(westUnit), wallCm: 25, levelRel: 0, levelAbs: 699 },
  ],
  openings: [...westOpenings, ...eastOpenings],
  plot: [P(295, 590), P(2975, 300), P(2985, 2460), P(2300, 2440), P(1700, 2425), P(1100, 2440), P(440, 2460)],
  zones: [
    {
      kind: 'paving',
      label: 'ריצוף מערבי ודרומי',
      polygon: [P(560, 1450), P(1000, 1450), P(1000, 2000), P(1700, 2000), P(1700, 2320), P(900, 2300), P(560, 2150)],
      levelAbs: 698.85,
    },
    {
      kind: 'paving',
      label: 'ריצוף מזרחי ודרומי',
      polygon: [P(1700, 2000), P(2400, 2000), P(2400, 1450), P(2840, 1450), P(2840, 2150), P(2500, 2300), P(1700, 2320)],
      levelAbs: 698.85,
    },
    { kind: 'lawn', label: 'דשא דרום-מערבי', polygon: [P(450, 2160), P(900, 2310), P(1000, 2440), P(445, 2455)], levelAbs: 699.25 },
    { kind: 'planting', label: 'גינון', polygon: [P(1000, 2330), P(2400, 2330), P(2300, 2435), P(1100, 2438)], levelAbs: 699.25 },
    { kind: 'lawn', label: 'דשא דרום-מזרחי', polygon: [P(2500, 2310), P(2950, 2160), P(2960, 2455), P(2400, 2440)], levelAbs: 699.25 },
    { kind: 'lawn', label: 'דשא צפון-מערבי', polygon: nwLawn, levelAbs: 698.8 },
    { kind: 'lawn', label: 'דשא צפון-מזרחי', polygon: [P(2300, 620), P(2975, 560), P(2975, 1380), P(2600, 1380), P(2600, 975), P(2300, 975)], levelAbs: 698.8 },
    { kind: 'paving', label: 'חצר צפונית', polygon: [P(1100, 610), P(2300, 500), P(2300, 975), P(1100, 975)], levelAbs: 698.9 },
    { kind: 'stairs', label: 'מדרגות מערביות', polygon: [P(380, 1650), P(570, 1650), P(570, 2150), P(420, 2150)], levelAbs: 0 },
  ],
  levels: [
    { text: '±0.00 699.00', abs: 699, rel: 0, at: P(1170, 1585) },
    { text: '698.85', abs: 698.85, rel: null, at: P(1280, 2110) },
    { text: '698.85', abs: 698.85, rel: null, at: P(2120, 2140) },
    { text: '699.25', abs: 699.25, rel: null, at: P(735, 2440) },
    { text: '699.25', abs: 699.25, rel: null, at: P(345, 1265) },
    { text: '698.80', abs: 698.8, rel: null, at: P(550, 1240) },
    { text: '699.85', abs: 699.85, rel: null, at: P(1700, 2290) },
    { text: '694.21 רחוב', abs: 694.21, rel: null, at: P(1390, 2525) },
    { text: '694.30 רחוב', abs: 694.3, rel: null, at: P(2040, 2525) },
    { text: '701.00', abs: 701, rel: null, at: P(295, 590) },
    { text: '700.40', abs: 700.4, rel: null, at: P(935, 490) },
    { text: '698.90', abs: 698.9, rel: null, at: P(1180, 710) },
    { text: '-1.00 698.00 מחסן', abs: 698, rel: -1, at: P(885, 1125) },
  ],
  trees: [
    { at: P(440, 1140), r: 110, kind: 'tree' },
    { at: P(585, 1775), r: 105, kind: 'tree' },
    { at: P(420, 1730), r: 60, kind: 'palm' },
    { at: P(1390, 2310), r: 90, kind: 'palm' },
    { at: P(1880, 2280), r: 90, kind: 'palm' },
    { at: P(900, 2160), r: 35, kind: 'shrub' },
    { at: P(1000, 2180), r: 35, kind: 'shrub' },
    { at: P(1630, 2190), r: 40, kind: 'shrub' },
    { at: P(1770, 2170), r: 40, kind: 'shrub' },
    { at: P(2900, 1140), r: 110, kind: 'tree' },
  ],
  retaining: [{ a: P(300, 560), b: P(2975, 290), label: 'קיר תומך לקיר פיתוח' }],
}

// מהחתכים והחזיתות בהיתר: ±0.00 = 699.00, קומה א +3.00, תחילת גג +6.00, רכס +8.50
export const SHANI_BUILDING: Building = {
  baseAbs: 699,
  groundHeight: 3,
  eaveRel: 6,
  ridgeRel: 8.5,
  roofType: 'gable',
  storeys: 2,
  levels: [
    { text: '-1.00', rel: -1, abs: 698, meaning: 'basement', drawing: 'חתך ב-ב' },
    { text: '±0.00', rel: 0, abs: 699, meaning: 'ground_floor', drawing: 'חזית דרומית' },
    { text: '+3.00', rel: 3, abs: null, meaning: 'first_floor', drawing: 'חתך א-א' },
    { text: '+6.00', rel: 6, abs: null, meaning: 'roof_eave', drawing: 'חזית דרומית' },
    { text: '+8.50', rel: 8.5, abs: null, meaning: 'ridge', drawing: 'חזית דרומית' },
    { text: '698.85', rel: -0.15, abs: 698.85, meaning: 'garden', drawing: 'חזית דרומית' },
    { text: '694.21', rel: -4.79, abs: 694.21, meaning: 'street', drawing: 'תכנית קומת קרקע' },
  ],
  source: 'קריאה ידנית של חתכים וחזיתות בהיתר',
}

export const SHANI_FLAG = 'garden-gh:shani-seeded'

export function buildShaniProject(): Project {
  const now = new Date().toISOString()
  const base = newVariant('בסיס')
  base.requirements = {
    functions: 'תכנון הגינה הדרום-מערבית של היחידה המערבית: פינת ישיבה, צל, מעבר לרחוב',
    plants: 'ים-תיכונית, חסכונית במים',
    materials: 'אבן, עץ, חצץ',
    budget: null,
    constraints: 'הפרשי מפלסים: גינה 698.85 עד 699.25, רחוב 694.21. מדרגות במערב. קיר תומך בצפון.',
  }
  const drawingId = uid()
  const p: Project = {
    id: uid(),
    name: 'הבית של שני',
    address: 'בית דו-משפחתי, יחידה מערבית',
    north: 315,
    soil: '',
    levelsNote: '±0.00 = 699.00. גינה דרומית 698.85, דשא 699.25, רחוב 694.21-694.30',
    permit: {
      fileName: 'היתר סרוק (לא מצורף לאפליקציה)',
      declaredType: 'scan',
      sourceType: 'image',
      pageCount: 0,
      pages: [],
      planPage: 0,
      scale: { den: null, metersPerPt: 1 / PX_PER_M, source: 'dimensions' },
      drawings: [{ id: drawingId, page: 1, box: { x: 0, y: 0, w: 3400, h: 3050 }, kind: 'floor_plan', title: 'תכנית קומת קרקע ק.מ. 1:100', floor: 'קרקע', scaleDen: 100 }],
      workDrawingId: drawingId,
      structure: { ...SHANI_STRUCTURE, drawingId, readAt: now },
    },
    building: SHANI_BUILDING,
    variants: [base],
    activeVariantId: base.id,
    createdAt: now,
    updatedAt: now,
  }
  base.elements = structureToElements(p, uid).map((e) => ({ ...e, source: e.source.replace('קריאת מבנה', 'קריאת מבנה ידנית') }))
  return p
}
