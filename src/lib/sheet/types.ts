// מודל הגיליון: מבנה אחיד שנבנה מתיקיית פרויקט (קבצי JSON) או מפרויקט באפליקציה,
// וממנו נוצרים ההדמיה התלת-ממדית, התוכניות והגיליון.

export type XY = { x: number; y: number } // מטרים בתוכנית: x מזרחה, y דרומה (הצפון למעלה כשהזווית 0)

// ---------- קלט מתיקייה ----------

export interface Assumption {
  key: string
  value: unknown
  source: 'assumption'
  note_he?: string
}

export interface ProjectFile {
  title_he?: string
  subtitle_he?: string
  studio?: { name_he?: string; address_he?: string; logo?: string }
  address_he?: string
  plot?: { gush?: string; helka?: string; area_m2?: number; rect?: { x: number; y: number; w: number; h: number } }
  areas?: { built_area_gross_m2?: number; garden_area_m2?: number; plot_area_m2?: number }
  year?: number
  planner_he?: string
  scale?: string
  drawing_no?: string
  date?: string
  assumptions?: Assumption[]
}

export interface RoomIn {
  name_he: string
  x: number
  y: number
  w: number
  h: number
}

export interface OpeningIn {
  type: 'window' | 'door' | 'sliding'
  side?: 'N' | 'S' | 'E' | 'W' // פתח בקיר חוץ
  offset_m?: number // מתחילת הצלע: בצלע צפון ודרום ממערב, במזרח ומערב מצפון
  x?: number // פתח פנימי: מרכז הפתח
  y?: number
  orient?: 'h' | 'v' // כיוון הקיר הפנימי
  width_m: number
  sill_m?: number
  height_m?: number
}

export interface FloorIn {
  id?: string
  name_he: string
  level_m: number
  height_m?: number
  areas_total_m2?: number
  rooms: RoomIn[]
  openings?: OpeningIn[]
}

export interface PlansFile {
  north_deg?: number
  wall_thickness_m?: { exterior?: number; interior?: number }
  footprint?: { x: number; y: number; w: number; h: number }
  floors?: FloorIn[]
  trees?: { name_he?: string; x: number; y: number; r: number; h: number }[]
}

export interface MaterialIn {
  id: string
  name_he: string
  name_en: string
  hex: string
  behavior_he?: string
  maintenance_he?: string
}

export interface MaterialsFile {
  materials?: MaterialIn[]
  palette?: { chips?: string[] }
  roles?: { envelope?: string; roof?: string; glass?: string; groundcover?: string; paving?: string }
}

export interface CalloutIn {
  text_he: string
  anchor: { x: number; y: number; z: number }
}

export interface FolderInput {
  project: ProjectFile | null
  plans: PlansFile | null
  materials: MaterialsFile | null
  callouts: CalloutIn[] | null
  poem: string | null
  post: string | null
  logo: string | null // data URL או נתיב
}

// ---------- מודל אחיד ----------

export interface PlanWall {
  a: XY
  b: XY
  t: number // עובי
  exterior: boolean
}
export interface PlanOpening {
  type: 'window' | 'door' | 'sliding' | 'gate'
  a: XY // תחילת הפתח על ציר הקיר
  b: XY
  t: number
  inward?: XY // כיוון פתיחה לדלת
}
export interface PlanArea {
  name: string
  poly: XY[]
  area: number
  dims?: { w: number; h: number } // מידות פנימיות לחדר מלבני
  fill?: string
}
export interface PlanTree {
  at: XY
  r: number
  name?: string
}
export interface PlanDrawing {
  title: string
  walls: PlanWall[]
  openings: PlanOpening[]
  areas: PlanArea[]
  trees: PlanTree[]
  outline?: { x: number; y: number; w: number; h: number } // מלבן חיצוני למידות כוללות
  chainS?: number[] // נקודות x לשרשרת מידות בצד הדרומי
  chainE?: number[] // נקודות y לשרשרת מידות בצד המזרחי
  totalArea?: number
  expectedArea?: number
}

export interface Volume {
  poly: XY[]
  z0: number
  z1: number
  role: 'envelope' | 'roof' | 'slab'
}
export interface Glass {
  a: XY
  b: XY
  z0: number
  z1: number
  type: 'window' | 'door' | 'sliding' | 'gate'
}
export interface GroundPatch {
  poly: XY[]
  color: string
  z: number
  name?: string
}
export interface Scene3D {
  volumes: Volume[]
  glass: Glass[]
  ground: GroundPatch[]
  trees: { at: XY; r: number; h: number }[]
  north: number
  colors: { envelope: string; roof: string; glass: string; ground: string; frame: string }
  expect?: { w: number; d: number; floors: number; floorH: number }
}

export interface Chip {
  id: string
  name_he: string
  name_en: string
  hex: string
  behavior_he?: string
  maintenance_he?: string
}

export interface SheetMeta {
  title: string
  subtitle: string
  studioName: string
  studioAddress: string
  logo: string | null
  address: string
  gush: string
  helka: string
  plotArea: number | null
  builtArea: number | null
  gardenArea: number | null
  year: string
  planner: string
  scale: string
  drawingNo: string
  date: string
}

export interface SheetModel {
  meta: SheetMeta
  plans: PlanDrawing[]
  scene: Scene3D
  chips: Chip[]
  callouts: CalloutIn[]
  poem: string
  post: string
  camera?: { az: number; el: number; zoom: number } // זווית ההדמיה הראשית: סיבוב, גובה מבט וקרבה
  assumptions: string[] // מה הושלם בהנחה
  checks: { ok: boolean; text: string }[]
}
