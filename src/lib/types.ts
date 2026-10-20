// מודל הנתונים של Garden-GH. כל מידה במטרים, מערכת צירים של התוכנית (x ימינה, y למטה).

export type Label = 'measured' | 'estimated' | 'assumed'

export const LABEL_TEXT: Record<Label, string> = {
  measured: 'מדוד מהיתר',
  estimated: 'מוערך',
  assumed: 'הונח',
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

export type SurfaceMaterial = 'paving' | 'lawn' | 'bed' | 'deck' | 'gravel'

export const MATERIAL_TEXT: Record<SurfaceMaterial, string> = {
  paving: 'ריצוף',
  lawn: 'דשא',
  bed: 'ערוגת שתילה',
  deck: 'דק עץ',
  gravel: 'חצץ',
}

export const MATERIAL_COLOR: Record<SurfaceMaterial, string> = {
  paving: '#bdb6a8',
  lawn: '#8fbf86',
  bed: '#9b7653',
  deck: '#b88a55',
  gravel: '#d9d4c7',
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

export type Element = Wall | Opening | Surface | Fence

export const KIND_TEXT: Record<Element['kind'], string> = {
  wall: 'קיר',
  opening: 'פתח',
  surface: 'משטח',
  fence: 'גדר',
}

export interface Requirements {
  functions: string
  plants: string
  materials: string
  budget: number | null
  constraints: string
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

export interface Project {
  id: string
  name: string
  address: string
  north: number
  soil: string
  levelsNote: string
  permit: Permit | null
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
