// מפרויקט באפליקציה למודל הגיליון: קומת הקרקע והגינה בתוכנית, הבית והגינה בתלת-ממד, חומרים מהמשטחים בשימוש.
import type { GardenObject, Opening, Project, Surface, Wall } from '../types'
import { activeVariant } from '../store'
import { MATERIALS, type SurfaceMaterial } from '../garden'
import { polyArea } from '../geom'
import { surfaceArea } from '../bom'
import { unitFootprints } from '../structureToElements'
import type { CalloutIn, Chip, PlanDrawing, Scene3D, SheetModel, XY } from './types'

import { haikuSuggestions, postSuggestions } from './suggest'

export interface SheetOverrides {
  subtitle?: string
  studioName?: string
  studioAddress?: string
  gush?: string
  helka?: string
  drawingNo?: string
  planner?: string
  poem?: string
  post?: string
  camAz?: number
  camEl?: number
  camZoom?: number
}

const EN: Record<SurfaceMaterial, string> = {
  paving: 'Interlocking pavers',
  tiles: 'Outdoor tiles',
  stone: 'Natural stone',
  concrete: 'Smooth concrete',
  deck: 'Timber deck',
  gravel: 'Gravel',
  pebbles: 'River pebbles',
  lawn: 'Lawn',
  turf: 'Artificial turf',
  bed: 'Planting bed',
  mulch: 'Wood mulch',
  sand: 'Sand',
  water: 'Water',
}

const centroid = (p: XY[]) => ({ x: p.reduce((s, v) => s + v.x, 0) / p.length, y: p.reduce((s, v) => s + v.y, 0) / p.length })
const rectPoly = (x: number, y: number, w: number, h: number): XY[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]
const surfPoly = (s: Surface) => s.poly ?? rectPoly(s.x, s.y, s.w, s.d)

export const DEFAULT_POEM = 'אבן ומים\nצל ראשון על הדשא\nהבית נושם'

export function fromProject(p: Project, o: SheetOverrides = {}): SheetModel {
  const v = activeVariant(p)
  const els = v.elements
  const assumptions: string[] = []
  const walls = els.filter((e): e is Wall => e.kind === 'wall')
  const house = walls.filter((w) => w.scope === 'house')
  const openings = els.filter((e): e is Opening => e.kind === 'opening')
  const surfaces = els.filter((e): e is Surface => e.kind === 'surface')
  const objects = els.filter((e): e is GardenObject => e.kind === 'object')
  const b = p.building

  // קו מתאר הבית: מההיתר, או המלבן החוסם של קירות הבית
  let fps = unitFootprints(p)
  if (!fps.length && house.length) {
    const xs = house.flatMap((w) => [w.x1, w.x2])
    const ys = house.flatMap((w) => [w.y1, w.y2])
    fps = [rectPoly(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))]
    assumptions.push('קו מתאר הבית: המלבן החוסם של קירות הבית')
  }
  const fpArea = fps.reduce((s, f) => s + Math.abs(polyArea(f)), 0)
  const groundH = b?.groundHeight ?? (house.length ? Math.max(...house.map((w) => w.height)) : 3)
  const storeys = Math.max(1, b?.storeys ?? 1)
  if (!b) assumptions.push(`גובה הבית: קומה אחת של ${groundH.toFixed(2)} מ׳ לפי גובה הקירות`)

  // ---------- תוכנית ----------
  const center = fps.length ? centroid(fps.flat()) : { x: 0, y: 0 }
  const planWalls = [
    ...walls.map((w) => ({ a: { x: w.x1, y: w.y1 }, b: { x: w.x2, y: w.y2 }, t: Math.max(0.1, w.thickness), exterior: w.scope === 'house' })),
    ...els.filter((e) => e.kind === 'fence').map((f) => (f.kind === 'fence' ? { a: { x: f.x1, y: f.y1 }, b: { x: f.x2, y: f.y2 }, t: 0.06, exterior: false } : null)).filter((x): x is NonNullable<typeof x> => Boolean(x)),
  ]
  const planOpenings = openings
    .map((op) => {
      const w = walls.find((x) => x.id === op.wallId)
      if (!w) return null
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1
      const ux = (w.x2 - w.x1) / L
      const uy = (w.y2 - w.y1) / L
      const a = { x: w.x1 + ux * op.offset, y: w.y1 + uy * op.offset }
      const bb = { x: a.x + ux * op.width, y: a.y + uy * op.width }
      let n = { x: -uy, y: ux }
      if ((center.x - a.x) * n.x + (center.y - a.y) * n.y < 0) n = { x: -n.x, y: -n.y }
      return { type: op.type, a, b: bb, t: w.thickness, inward: n }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
  const areas = [
    ...fps.map((f, i) => ({ name: fps.length > 1 ? `מבנה ${i + 1}` : 'מבנה', poly: f, area: Math.abs(polyArea(f)), fill: '#f1ede4' })),
    ...surfaces.map((s) => ({ name: MATERIALS[s.material].text, poly: surfPoly(s), area: surfaceArea(s), fill: `${MATERIALS[s.material].color}55` })),
  ]
  const trees = [
    ...objects.filter((t) => t.type === 'tree' || t.type === 'fruit_tree' || t.type === 'palm').map((t) => ({ at: { x: t.x, y: t.y }, r: Math.max(t.w, t.d) / 2, h: t.h })),
    ...(() => {
      const st = p.permit?.structure
      const mpp = p.permit?.scale.metersPerPt ?? 0
      return st && mpp ? st.trees.filter((t) => t.kind !== 'shrub').map((t) => ({ at: { x: t.at.x * mpp, y: t.at.y * mpp }, r: Math.min(5, Math.max(0.6, t.r * mpp)), h: t.kind === 'palm' ? 6 : 5 })) : []
    })(),
  ]
  const fpAll = fps.flat()
  const fx = fpAll.map((q) => q.x)
  const fy = fpAll.map((q) => q.y)
  const outline = fpAll.length ? { x: Math.min(...fx), y: Math.min(...fy), w: Math.max(...fx) - Math.min(...fx), h: Math.max(...fy) - Math.min(...fy) } : undefined
  // שרשרת מידות קריאה: נקודות במרחק מטר לפחות זו מזו, והקצוות תמיד נשמרים
  const uniq = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y)
    const out = s.filter((x, i) => i === 0 || i === s.length - 1 || x - s[0] >= 1)
    return out.filter((x, i) => i === 0 || i === out.length - 1 || (x - out[i - 1] >= 1 && out[out.length - 1] - x >= 1))
  }
  const plan: PlanDrawing = {
    title: 'קומת קרקע ופיתוח',
    walls: planWalls,
    openings: planOpenings,
    areas,
    trees: trees.map((t) => ({ at: t.at, r: t.r })),
    outline,
    chainS: outline ? uniq([...fx]) : undefined,
    chainE: outline ? uniq([...fy]) : undefined,
    totalArea: surfaces.reduce((s, x) => s + surfaceArea(x), 0) + fpArea,
  }

  // ---------- סצנה ----------
  const top = groundH * storeys
  const scene: Scene3D = {
    volumes: [
      ...fps.flatMap((f) => Array.from({ length: storeys }, (_, i) => ({ poly: f, z0: i * groundH, z1: (i + 1) * groundH, role: 'envelope' as const }))),
      ...fps.map((f) => ({ poly: f, z0: top, z1: top + 0.25, role: 'roof' as const })),
    ],
    glass: planOpenings.map((op, i) => {
      const src = openings[i]
      return { a: op.a, b: op.b, z0: src?.sill ?? 0, z1: (src?.sill ?? 0) + (src?.height ?? 2.1), type: op.type }
    }),
    ground: surfaces.map((s) => ({ poly: surfPoly(s), color: s.color || MATERIALS[s.material].color, z: s.level, name: MATERIALS[s.material].text })),
    trees,
    north: p.north || 0,
    colors: { envelope: '#d2ccbf', roof: '#b9b4aa', glass: '#9fb4bd', ground: '#7d8a52', frame: '#3a3a3a' },
  }

  // ---------- חומרים ----------
  const byMat = new Map<SurfaceMaterial, number>()
  for (const s of surfaces) byMat.set(s.material, (byMat.get(s.material) ?? 0) + surfaceArea(s))
  const chips: Chip[] = [...byMat.entries()]
    .sort((a, c) => c[1] - a[1])
    .map(([m]) => ({ id: m, name_he: MATERIALS[m].text, name_en: EN[m], hex: MATERIALS[m].color }))
  const base: Chip[] = [
    { id: 'plaster', name_he: 'טיח חוץ בהיר', name_en: 'Light render', hex: '#d2ccbf' },
    { id: 'glass', name_he: 'זכוכית', name_en: 'Glass', hex: '#9fb4bd' },
    { id: 'olive', name_he: 'צמחייה ירוקת זית', name_en: 'Olive planting', hex: '#7d8a52' },
    { id: 'gravel', name_he: 'חצץ בהיר', name_en: 'Light gravel', hex: '#d9d4c7' },
    { id: 'wood', name_he: 'עץ', name_en: 'Timber', hex: '#8a5a3c' },
  ]
  const allChips = [...chips, ...base.filter((c) => !chips.some((x) => x.hex === c.hex))].slice(0, 5)
  if (chips.length < 5) assumptions.push('לוח החומרים הושלם לחמישה בחומרי הבית')

  // ---------- תוויות ----------
  const callouts: CalloutIn[] = []
  if (fps.length) {
    const c = centroid(fps[0])
    callouts.push({ text_he: storeys > 1 ? `מבנה המגורים, ${storeys} קומות` : 'מבנה המגורים', anchor: { x: c.x, y: c.y, z: top + 0.25 } })
  }
  const bigSurf = [...surfaces].sort((a, c) => surfaceArea(c) - surfaceArea(a))
  const seen = new Set<string>()
  for (const s of bigSurf) {
    if (seen.has(s.material) || callouts.length >= 5) continue
    seen.add(s.material)
    const c = centroid(surfPoly(s))
    callouts.push({ text_he: `${MATERIALS[s.material].text}, ${surfaceArea(s).toFixed(2)} מ"ר`, anchor: { x: c.x, y: c.y, z: s.level } })
  }
  if (trees[0] && callouts.length < 6) callouts.push({ text_he: 'עץ', anchor: { x: trees[0].at.x, y: trees[0].at.y, z: trees[0].h * 0.8 } })

  const gardenArea = surfaces.reduce((s, x) => s + surfaceArea(x), 0)
  const today = new Date().toISOString().slice(0, 10)
  if (!o.gush) assumptions.push('גוש וחלקה: לא צוינו')
  return {
    meta: {
      title: p.name,
      subtitle: o.subtitle || 'תכנון גינה, הדמיה ותוכנית',
      studioName: o.studioName || 'אד׳ ענת שטיבלמן',
      studioAddress: o.studioAddress || '',
      logo: '/logo-anat.png',
      address: p.address || 'ללא כתובת',
      gush: o.gush || 'לא צוין',
      helka: o.helka || 'לא צוין',
      plotArea: p.plotArea ?? null,
      builtArea: fpArea ? fpArea * storeys : null,
      gardenArea: gardenArea || null,
      year: String(new Date().getFullYear()),
      planner: o.planner || 'אד׳ ענת שטיבלמן',
      scale: '1:100',
      drawingNo: o.drawingNo || `GH-${p.id.slice(0, 4).toUpperCase()}`,
      date: today,
    },
    plans: [plan],
    scene,
    chips: allChips,
    callouts,
    poem: o.poem || haikuSuggestions(p)[0] || DEFAULT_POEM,
    post: o.post || postSuggestions(p)[0],
    camera: { az: o.camAz ?? 0, el: o.camEl ?? 20, zoom: o.camZoom ?? 1 },
    assumptions,
    checks: [],
  }
}

