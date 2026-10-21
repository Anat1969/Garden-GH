import type { LineType, ObjectType, SurfaceMaterial } from './garden'
export type { LineType, ObjectType, SurfaceMaterial } from './garden'
export { MATERIAL_COLOR, MATERIAL_TEXT } from './garden'

// מודל הנתונים של Garden-GH. כל מידה במטרים, מערכת צירים של התוכנית (x ימינה, y למטה).

export type Label = 'measured' | 'estimated' | 'assumed'

export const LABEL_TEXT: Record<Label, string> = {
  measured: 'מדוד מהיתר',
  estimated: 'מוערך',
  assumed: 'הונח',
}

// הסבר לכל תווית, מוצג במעבר עכבר או בלחיצה על התווית
export const LABEL_HELP: Record<Label, string> = {
  measured: 'מדוד מהיתר: המספר נקרא ממידה שכתובה בהיתר, או אושר מולה. זה הנתון הכי אמין.',
  estimated: 'מוערך: האפליקציה חישבה את המספר מהשרטוט (קנה מידה, זיהוי אוטומטי). עוד לא אומת מול מידה כתובה, צריך לבדוק.',
  assumed: 'הונח: ערך ברירת מחדל או ערך שהוקלד ידנית, בלי מדידה. מתאים להערכה ראשונית בלבד.',
}

export type PageKind = 'plan' | 'elevation' | 'section' | 'site' | 'other'

export const PAGE_KIND_TEXT: Record<PageKind, string> = {
  plan: 'תוכנית קומה',
  elevation: 'חזית',
  section: 'חתך',
  site: 'תשריט / מגרש',
  other: 'לא מסווג',
}

export interface PermitPage {
  index: number
  kind: PageKind
  scaleDen: number | null
  widthPt: number
  heightPt: number
  vectorSegments: number
  textSample: string
}

export interface ScaleInfo {
  metersPerPt: number | null
  den: number | null
  source: 'text' | 'calibrated' | 'dimensions' | 'manual-only' | null
}

// מידה שנקראה מההיתר. קואורדינטות ביחידות העמוד (נקודות PDF; בתמונה: פיקסל אחד = נקודה אחת).
export type DimKind = 'length' | 'level'
export type DimStatus = 'pending' | 'confirmed' | 'rejected'

export interface PlanDimension {
  id: string
  page: number
  raw: string
  value: number // במטרים. למפלס: הערך כפי שנכתב, במטרים
  unit: 'cm' | 'm' | 'mm'
  kind: DimKind
  relative: boolean // מפלס יחסי (±0.00, +0.40)
  orientation: 'h' | 'v' | 'other'
  box: { x: number; y: number; w: number; h: number }
  line: { x1: number; y1: number; x2: number; y2: number } | null
  agrees: boolean | null // האם אורך קו המידה תואם לקנה המידה
  source: 'text-layer' | 'ai'
  confidence: 'high' | 'medium' | 'low'
  status: DimStatus
}

export type DrawingKind =
  | 'floor_plan'
  | 'development_plan'
  | 'site_plan'
  | 'roof_plan'
  | 'basement_plan'
  | 'section'
  | 'elevation'
  | 'area_table'
  | 'title_block'
  | 'notes'
  | 'other'

export const DRAWING_KIND_TEXT: Record<DrawingKind, string> = {
  floor_plan: 'תוכנית קומה',
  development_plan: 'תכנית פיתוח שטח',
  site_plan: 'תשריט / מפה מצבית',
  roof_plan: 'תכנית גג',
  basement_plan: 'מרתף / חניה ומסד',
  section: 'חתך',
  elevation: 'חזית',
  area_table: 'טבלת שטחים',
  title_block: 'גוש כותרת',
  notes: 'הערות',
  other: 'אחר',
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

// שרטוט אחד בתוך גיליון ההיתר. קואורדינטות ביחידות העמוד.
export interface Drawing {
  id: string
  page: number
  box: Box
  kind: DrawingKind
  title: string
  floor: string
  scaleDen: number | null
}

export interface Pt {
  x: number
  y: number
}

// קריאת מבנה מתוכנית: ביחידות העמוד
export interface PlanStructure {
  drawingId: string
  northDeg: number
  units: { name: string; footprint: Pt[]; wallCm: number; levelRel: number; levelAbs: number | null }[]
  openings: { type: 'door' | 'sliding_door' | 'window' | 'opening'; a: Pt; b: Pt }[]
  plot: Pt[]
  zones: { kind: string; label: string; polygon: Pt[]; levelAbs: number | null }[]
  levels: { text: string; abs: number | null; rel: number | null; at: Pt }[]
  trees: { at: Pt; r: number; kind: 'tree' | 'palm' | 'shrub' }[]
  retaining: { a: Pt; b: Pt; label: string }[]
  readAt: string
}

export interface BuildingLevel {
  text: string
  rel: number
  abs: number | null
  meaning: string
  drawing: string
}

// הבניין בגובה: מקריאת חתכים וחזיתות
export interface Building {
  baseAbs: number | null // המפלס המוחלט של ±0.00
  groundHeight: number // גובה קומת הקרקע (עד הרצפה הבאה)
  eaveRel: number | null
  ridgeRel: number | null
  roofType: 'gable' | 'hip' | 'flat' | 'shed' | 'mixed'
  storeys: number
  levels: BuildingLevel[]
  source: string
}

export interface DimScale {
  page: number
  metersPerPt: number
  support: number
  total: number
  spread: number
}

export interface Permit {
  fileName: string
  declaredType: 'vector' | 'scan'
  pageCount: number
  pages: PermitPage[]
  planPage: number
  scale: ScaleInfo
  detectedAt?: string
  detection?: { walls: number; openings: number }
  cloudPath?: string
  sourceType?: 'pdf' | 'image'
  dims?: PlanDimension[]
  dimScales?: DimScale[]
  aiReadAt?: string
  drawings?: Drawing[]
  region?: Box // השרטוט שעליו עובדים בעמוד התוכנית
  workDrawingId?: string
  structure?: PlanStructure
}

interface Base {
  id: string
  label: Label
  source: string
  approved: boolean
  existing?: boolean // קיים בשטח: מוצג בכתב הכמויות בלי תמחור. גדר גבול מגרש קיימת כברירת מחדל
}

export interface Wall extends Base {
  kind: 'wall'
  scope: 'house' | 'garden'
  x1: number
  y1: number
  x2: number
  y2: number
  thickness: number
  height: number
}

export type OpeningType = 'door' | 'window' | 'gate'

export interface Opening extends Base {
  kind: 'opening'
  wallId: string
  type: OpeningType
  offset: number
  width: number
  height: number
  sill: number
}

export interface Surface extends Base {
  kind: 'surface'
  material: SurfaceMaterial
  poly?: { x: number; y: number }[] // מצולע במטרים. כשקיים, x,y,w,d הם המלבן החוסם
  x: number
  y: number
  w: number
  d: number
  level: number
  color?: string // צבע שגובר על צבע החומר
}

export interface Fence extends Base {
  kind: 'fence'
  x1: number
  y1: number
  x2: number
  y2: number
  height: number
  boundary: boolean
}

// פריט נקודתי מהספרייה: עץ, ספסל, פרגולה, פנס. x,y הם המרכז.
export interface GardenObject extends Base {
  kind: 'object'
  type: ObjectType
  x: number
  y: number
  w: number
  d: number
  h: number
  rot: number // מעלות
  level: number
  color?: string
}

// אלמנט קווי: גדר חיה, אבן שפה, שביל, קו השקיה
export interface GardenLine extends Base {
  kind: 'line'
  type: LineType
  pts: Pt[]
  width: number
  height: number
  level: number
  color?: string
}

// שרטוט חופשי לסקיצה: לא נכנס לכתב הכמויות
export interface Sketch extends Base {
  kind: 'sketch'
  pts: Pt[]
  color: string
  stroke: number // עובי במטרים
  closed: boolean
}

export type Element = Wall | Opening | Surface | Fence | GardenObject | GardenLine | Sketch

export const KIND_TEXT: Record<Element['kind'], string> = {
  wall: 'קיר',
  opening: 'פתח',
  surface: 'משטח',
  fence: 'גדר',
  object: 'פריט',
  line: 'אלמנט קווי',
  sketch: 'שרטוט חופשי',
}

export interface Requirements {
  functions: string
  plants: string
  materials: string
  budget: number | null
  constraints: string
  style?: string // סגנון גינה מהמדריך (StyleId)
}

export interface Variant {
  id: string
  name: string
  createdAt: string
  note: string
  elements: Element[]
  requirements: Requirements
  assignments: Record<string, string>
}

// מסמך מצורף לפרויקט: כל סוג קובץ. הקובץ עצמו נשמר במכשיר (IndexedDB), כאן רק הפרטים
export type DocKind = 'permit' | 'plan' | 'survey' | 'photo' | 'spec' | 'other'

export const DOC_KIND_TEXT: Record<DocKind, string> = {
  permit: 'היתר',
  plan: 'תוכנית / שרטוט',
  survey: 'מדידה',
  photo: 'תמונה',
  spec: 'מפרט / כתב כמויות',
  other: 'אחר',
}

export interface ProjectDoc {
  id: string
  name: string
  type: string
  size: number
  kind: DocKind
  addedAt: string
}

export interface Project {
  id: string
  name: string
  address: string
  city?: string // עיר שנבחרה ידנית (כשלא זוהתה מהכתובת)
  north: number
  northSet?: boolean // כיוון הצפון אושר או הוזן ידנית
  sheet?: { subtitle?: string; studioName?: string; studioAddress?: string; gush?: string; helka?: string; drawingNo?: string; planner?: string; poem?: string; post?: string } // שדות גיליון ההדפסה
  soil: string
  levelsNote: string
  permit: Permit | null
  documents?: ProjectDoc[]
  plotArea?: number // שטח המגרש במ"ר
  baseLevel?: number // המפלס המוחלט של ±0.00
  // שדות שמולאו מקריאת ההיתר: שם השדה ומאיפה חולץ. עריכה ידנית מסירה את הסימון
  extracted?: Partial<Record<'north' | 'levelsNote' | 'plotArea' | 'baseLevel', string>>
  building?: Building
  variants: Variant[]
  activeVariantId: string
  createdAt: string
  updatedAt: string
}

export interface PriceItem {
  code: string
  description: string
  unit: Unit
  price: number
  category: string
  verified: boolean
  source: string
  date: string
}

export type Unit = 'm2' | 'm' | 'm3' | 'unit'

export const UNIT_TEXT: Record<Unit, string> = {
  m2: 'מ"ר',
  m: 'מ"א',
  m3: 'מ"ק',
  unit: 'יח\'',
}
