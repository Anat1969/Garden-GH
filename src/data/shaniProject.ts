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

// קריאה שנייה מול התוכנית (גרסה 2): פטיו מעגלי בדרום, מדרגות לאורך הגבול המערבי והמזרחי,
// דשא בפינות, רצועת גינון עם דקלים, גגוני חניה בצפון, שבילים משערי הרחוב, ותיקון קו הבית.
const westUnit: Pt[] = [
  P(800, 1000), P(1105, 1000), P(1105, 1400), P(1435, 1400), P(1435, 1225), P(1700, 1225),
  P(1700, 1985), P(1460, 1985), P(1460, 2040), P(1080, 2040), P(1035, 2025), P(1000, 1990),
  P(983, 1935), P(983, 1456), P(900, 1456), P(900, 1320), P(800, 1320),
]

type Op = PlanStructure['openings'][number]
const westOpenings: Op[] = [
  { type: 'door', a: P(983, 1490), b: P(983, 1580) },
  { type: 'window', a: P(983, 1592), b: P(983, 1625) },
  { type: 'sliding_door', a: P(983, 1690), b: P(983, 1930) },
  { type: 'window', a: P(1088, 2040), b: P(1171, 2040) },
  { type: 'sliding_door', a: P(1374, 2040), b: P(1458, 2040) },
  { type: 'window', a: P(1600, 1985), b: P(1690, 1985) },
]
const eastOpenings: Op[] = westOpenings.map((o) => ({ type: o.type, a: m(o.a.x, o.a.y), b: m(o.b.x, o.b.y) }))

// גבול המגרש הצפוני יורד מזרחה: y = 640 - 0.1207 (x - 300)
const northY = (x: number) => Math.round(640 - 0.1207 * (x - 300))
const plot: Pt[] = [P(299, 613), P(2975, 290), P(2992, 2486), P(2399, 2460), P(1700, 2455), P(1010, 2470), P(406, 2497)]
// שימור צורה בתוך גבול המגרש במזרח (המגרש לא סימטרי לגמרי)
const clampE = (ps: Pt[]) => ps.map((p) => ({ x: Math.min(p.x, 2980), y: p.y }))

// הפטיו: רצועה לאורך החזית המערבית וקשת מעגלית מתחת לחזית הדרומית
const westPatio: Pt[] = [
  P(400, 1400), P(983, 1400), P(983, 1935), P(1000, 1990), P(1035, 2025), P(1080, 2040), P(1460, 2040), P(1460, 1985), P(1700, 1985),
  P(1700, 2320), P(1386, 2299), P(1178, 2257), P(970, 2164), P(834, 2028), P(751, 1883), P(730, 1758), P(593, 1700), P(396, 1665),
]
const westStairs: Pt[] = [P(396, 1665), P(593, 1700), P(600, 2485), P(406, 2497)]
const swLawn: Pt[] = [P(600, 2050), P(708, 2050), P(780, 1960), P(834, 2028), P(970, 2164), P(1004, 2180), P(1004, 2470), P(600, 2485)]
const westPlanter: Pt[] = [P(562, 1903), P(708, 1903), P(708, 2049), P(562, 2049)]
const nwLawn: Pt[] = [P(305, 650), P(949, northY(949)), P(949, 800), P(803, 800), P(803, 1000), P(689, 1014), P(689, 1440), P(345, 1440)]
const nwSteps: Pt[] = [P(689, 1014), P(803, 1014), P(803, 1400), P(689, 1400)]
const southPlanting: Pt[] = [
  P(1004, 2180), P(1178, 2257), P(1386, 2299), P(1700, 2320), P(2014, 2299), P(2222, 2257), P(2396, 2180), P(2399, 2460), P(1700, 2455), P(1010, 2470),
]
const northPaving: Pt[] = [
  P(949, northY(949)), P(2451, northY(2451)), P(2451, 800), P(2597, 800), P(2597, 1108), P(1827, 1108), P(1827, 1225),
  P(1573, 1225), P(1573, 1108), P(803, 1108), P(803, 800), P(949, 800),
]
// הדשא הצפון-מזרחי עולה עד הגבול הצפוני המשופע, ולכן אינו מראה של המערבי
const neLawn: Pt[] = [P(2451, northY(2451)), P(2975, northY(2975)), P(2980, 1440), P(2711, 1440), P(2711, 1014), P(2597, 1000), P(2597, 800), P(2451, 800)]

export const SHANI_STRUCTURE: Omit<PlanStructure, 'drawingId' | 'readAt'> = {
  northDeg: 315,
  units: [
    { name: 'יחידה מערבית', footprint: westUnit, wallCm: 25, levelRel: 0, levelAbs: 699 },
    { name: 'יחידה מזרחית', footprint: mirror(westUnit), wallCm: 25, levelRel: 0, levelAbs: 699 },
  ],
  openings: [...westOpenings, ...eastOpenings],
  plot,
  zones: [
    { kind: 'paving', label: 'פטיו מערבי', polygon: westPatio, levelAbs: 698.85 },
    { kind: 'paving', label: 'פטיו מזרחי', polygon: clampE(mirror(westPatio)), levelAbs: 698.85 },
    { kind: 'stairs', label: 'מדרגות מערביות לרחוב', polygon: westStairs, levelAbs: 698.25 },
    { kind: 'stairs', label: 'מדרגות מזרחיות לרחוב', polygon: clampE(mirror(westStairs)), levelAbs: 698.25 },
    { kind: 'lawn', label: 'דשא דרום-מערבי', polygon: swLawn, levelAbs: 699.25 },
    { kind: 'lawn', label: 'דשא דרום-מזרחי', polygon: clampE(mirror(swLawn)), levelAbs: 699.25 },
    { kind: 'planting', label: 'ערוגת עץ מערבית', polygon: westPlanter, levelAbs: 699.25 },
    { kind: 'planting', label: 'ערוגת עץ מזרחית', polygon: mirror(westPlanter), levelAbs: 699.25 },
    { kind: 'planting', label: 'גינון דרומי עם דקלים', polygon: southPlanting, levelAbs: 699.25 },
    { kind: 'lawn', label: 'דשא צפון-מערבי', polygon: nwLawn, levelAbs: 698.8 },
    { kind: 'lawn', label: 'דשא צפון-מזרחי', polygon: neLawn, levelAbs: 698.8 },
    { kind: 'stairs', label: 'מדרגות למחסן מערבי', polygon: nwSteps, levelAbs: 698.5 },
    { kind: 'stairs', label: 'מדרגות למחסן מזרחי', polygon: mirror(nwSteps), levelAbs: 698.5 },
    { kind: 'parking', label: 'חניה וחצר כניסה', polygon: northPaving, levelAbs: 698.9 },
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
    { text: '701.20', abs: 701.2, rel: null, at: P(300, 640) },
    { text: '700.40', abs: 700.4, rel: null, at: P(935, 490) },
    { text: '701.00', abs: 701, rel: null, at: P(2975, 560) },
    { text: '698.90', abs: 698.9, rel: null, at: P(1180, 710) },
    { text: '-1.00 698.00 מחסן', abs: 698, rel: -1, at: P(885, 1125) },
  ],
  trees: [
    { at: P(445, 1170), r: 115, kind: 'tree' },
    { at: P(2955, 1170), r: 115, kind: 'tree' },
    { at: P(614, 1966), r: 190, kind: 'tree' },
    { at: P(2786, 1966), r: 190, kind: 'tree' },
    { at: P(427, 1446), r: 60, kind: 'palm' },
    { at: P(1488, 2393), r: 90, kind: 'palm' },
    { at: P(1889, 2351), r: 90, kind: 'palm' },
    { at: P(765, 2179), r: 35, kind: 'shrub' },
    { at: P(874, 2205), r: 35, kind: 'shrub' },
    { at: P(1613, 2216), r: 40, kind: 'shrub' },
    { at: P(1785, 2184), r: 40, kind: 'shrub' },
  ],
  retaining: [{ a: P(300, 580), b: P(2975, 258), label: 'קיר תומך לכביש בצפון' }],
}

// גגוני החניה ושבילי הכניסה מהרחוב, במטרים (לא חלק מקריאת המבנה)
export const SHANI_EXTRAS = {
  canopies: [
    { x: (803 + 1573) / 2 / PX_PER_M, y: (800 + 1108) / 2 / PX_PER_M, w: (1573 - 803) / PX_PER_M, d: (1108 - 800) / PX_PER_M },
    { x: (1827 + 2597) / 2 / PX_PER_M, y: (800 + 1108) / 2 / PX_PER_M, w: (2597 - 1827) / PX_PER_M, d: (1108 - 800) / PX_PER_M },
  ],
  paths: [
    [P(1004, 2465), P(1004, 2180)],
    [P(2396, 2455), P(2396, 2180)],
  ].map((l) => l.map((q) => ({ x: q.x / PX_PER_M, y: q.y / PX_PER_M }))),
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

export const SHANI_FLAG = 'garden-gh:shani-seeded-v2'

export function buildShaniProject(): Project {
  const now = new Date().toISOString()
  const base = newVariant('חלופה ראשית')
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
    baseLevel: 699,
    extracted: { north: 'מחץ הצפון בתוכנית', levelsNote: 'מסימוני הגובה בהיתר', baseLevel: 'מהחתכים והחזיתות' },
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
  const src = 'קריאה ידנית מהתוכנית'
  for (const c of SHANI_EXTRAS.canopies)
    base.elements.push({ id: uid(), kind: 'object', type: 'pergola', x: c.x, y: c.y, w: c.w, d: c.d, h: 2.6, rot: 0, level: -0.1, color: '#8d8a84', label: 'estimated', source: `${src} (גגון חניה)`, approved: false })
  for (const pts of SHANI_EXTRAS.paths)
    base.elements.push({ id: uid(), kind: 'line', type: 'path', pts, width: 1.2, height: 0.06, level: 0.25, label: 'estimated', source: `${src} (שביל משער הרחוב)`, approved: false })
  return p
}
