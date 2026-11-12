// מתיקיית פרויקט (project.json, plans.json, materials.json, callouts.json, poem.txt, post.txt) למודל הגיליון.
// כל נתון חסר מושלם מההנחות שב-project.json (source = "assumption") או מברירת מחדל מתועדת, ונרשם ברשימת ההנחות.
import type { CalloutIn, Chip, FloorIn, FolderInput, OpeningIn, PlanDrawing, PlanOpening, PlanWall, Scene3D, SheetModel, XY } from './types'

const r2 = (n: number) => Math.round(n * 100) / 100
const fmt = (n: number) => n.toFixed(2)

export function fromFolder(input: FolderInput): SheetModel {
  const assumptions: string[] = []
  const checks: SheetModel['checks'] = []
  const P = input.project ?? {}
  const A = new Map((P.assumptions ?? []).map((a) => [a.key, a]))
  // ערך: מהקובץ, אחרת מההנחות שבפרויקט, אחרת ברירת מחדל. כל השלמה נרשמת
  const pick = <T,>(v: T | undefined | null, key: string, fallback: T, what: string): T => {
    if (v !== undefined && v !== null && v !== ('' as unknown)) return v
    const a = A.get(key)
    if (a) {
      assumptions.push(`${what}: ${String(a.value)}${a.note_he ? ` (${a.note_he})` : ''}, מההנחות ב-project.json`)
      return a.value as T
    }
    assumptions.push(`${what}: ${String(fallback)}, ברירת מחדל`)
    return fallback
  }
  if (!input.project) assumptions.push('project.json חסר: כל פרטי הפרויקט הם ברירות מחדל')
  if (!input.plans) assumptions.push('plans.json חסר: נבנה מבנה 7×10 מ׳ בשתי קומות מההנחות')
  if (!input.materials) assumptions.push('materials.json חסר: פלטת חומרים בסיסית')
  if (!input.callouts) assumptions.push('callouts.json חסר: תוויות נוצרו אוטומטית')
  if (!input.poem) assumptions.push('poem.txt חסר: הייקו ברירת מחדל')
  if (!input.post) assumptions.push('post.txt חסר: טקסט ברירת מחדל')

  const plans = input.plans ?? {}
  const fp = plans.footprint ?? pick(undefined, 'footprint', { x: 0, y: 0, w: 7, h: 10 }, 'מתאר המבנה')
  const needH = !(plans.floors ?? []).length || (plans.floors ?? []).some((f) => f.height_m === undefined)
  const floorH = needH ? Number(pick<number | undefined>(undefined, 'floor_height_m', 3.2, 'גובה קומה ברירת מחדל')) : (plans.floors ?? [])[0].height_m ?? 3.2
  const tExt = plans.wall_thickness_m?.exterior ?? Number(pick<number | undefined>(undefined, 'wall_exterior_m', 0.25, 'עובי קיר חוץ'))
  const tInt = plans.wall_thickness_m?.interior ?? Number(pick<number | undefined>(undefined, 'wall_interior_m', 0.12, 'עובי קיר פנים'))
  const north = plans.north_deg ?? Number(pick<number | undefined>(undefined, 'north_deg', 0, 'כיוון צפון'))
  let floors: FloorIn[] = plans.floors ?? []
  if (!floors.length) {
    floors = [
      { name_he: 'קומת קרקע', level_m: 0, height_m: floorH, rooms: [{ name_he: 'חלל מגורים', x: fp.x, y: fp.y, w: fp.w, h: fp.h }], openings: [{ type: 'sliding', side: 'S', offset_m: fp.w * 0.2, width_m: fp.w * 0.6 }] },
      { name_he: 'קומה א׳', level_m: floorH, height_m: floorH, rooms: [{ name_he: 'חדרים', x: fp.x, y: fp.y, w: fp.w, h: fp.h }], openings: [{ type: 'window', side: 'S', offset_m: fp.w * 0.3, width_m: fp.w * 0.4 }] },
    ]
    assumptions.push('קומות: שתי קומות עם חלל אחד בכל קומה, כי אין חדרים בקובץ')
  }
  floors.forEach((f) => {
    if (f.height_m === undefined) {
      f.height_m = floorH
      assumptions.push(`גובה ${f.name_he}: ${fmt(floorH)} מ׳ מההנחות`)
    }
  })

  // ---------- תוכניות ----------
  const planOf = (f: FloorIn): PlanDrawing => {
    const walls: PlanWall[] = []
    // קירות חוץ לפי המתאר
    const c = [
      { x: fp.x, y: fp.y },
      { x: fp.x + fp.w, y: fp.y },
      { x: fp.x + fp.w, y: fp.y + fp.h },
      { x: fp.x, y: fp.y + fp.h },
    ]
    for (let i = 0; i < 4; i++) walls.push({ a: c[i], b: c[(i + 1) % 4], t: tExt, exterior: true })
    // קירות פנים: צלעות החדרים שלא על המתאר, מאוחדות לפי קו
    const vert = new Map<number, [number, number][]>()
    const hor = new Map<number, [number, number][]>()
    const onBoundaryX = (x: number) => Math.abs(x - fp.x) < 0.01 || Math.abs(x - fp.x - fp.w) < 0.01
    const onBoundaryY = (y: number) => Math.abs(y - fp.y) < 0.01 || Math.abs(y - fp.y - fp.h) < 0.01
    for (const r of f.rooms) {
      for (const x of [r.x, r.x + r.w]) if (!onBoundaryX(x)) vert.set(r2(x), [...(vert.get(r2(x)) ?? []), [r.y, r.y + r.h]])
      for (const y of [r.y, r.y + r.h]) if (!onBoundaryY(y)) hor.set(r2(y), [...(hor.get(r2(y)) ?? []), [r.x, r.x + r.w]])
    }
    const merge = (iv: [number, number][]) => {
      const s = [...iv].sort((a, b) => a[0] - b[0])
      const out: [number, number][] = []
      for (const [a, b] of s) {
        const last = out[out.length - 1]
        if (last && a <= last[1] + 0.01) last[1] = Math.max(last[1], b)
        else out.push([a, b])
      }
      return out
    }
    for (const [x, iv] of vert) for (const [a, b] of merge(iv)) walls.push({ a: { x, y: a }, b: { x, y: b }, t: tInt, exterior: false })
    for (const [y, iv] of hor) for (const [a, b] of merge(iv)) walls.push({ a: { x: a, y }, b: { x: b, y }, t: tInt, exterior: false })

    const openings: PlanOpening[] = (f.openings ?? []).map((o) => openingOf(o))
    const areas = f.rooms.map((r) => ({
      name: r.name_he,
      poly: [
        { x: r.x, y: r.y },
        { x: r.x + r.w, y: r.y },
        { x: r.x + r.w, y: r.y + r.h },
        { x: r.x, y: r.y + r.h },
      ],
      area: r.w * r.h,
      dims: { w: r.w, h: r.h },
    }))
    const total = areas.reduce((s, a) => s + a.area, 0)
    const xs = [...new Set([fp.x, fp.x + fp.w, ...f.rooms.filter((r) => Math.abs(r.y + r.h - fp.y - fp.h) < 0.01).flatMap((r) => [r.x, r.x + r.w])])].sort((a, b) => a - b)
    const ys = [...new Set([fp.y, fp.y + fp.h, ...f.rooms.filter((r) => Math.abs(r.x + r.w - fp.x - fp.w) < 0.01).flatMap((r) => [r.y, r.y + r.h])])].sort((a, b) => a - b)
    return {
      title: f.name_he,
      walls,
      openings,
      areas,
      trees: f.level_m === 0 ? (plans.trees ?? []).map((t) => ({ at: { x: t.x, y: t.y }, r: t.r, name: t.name_he })) : [],
      outline: fp,
      chainS: xs,
      chainE: ys,
      totalArea: total,
      expectedArea: f.areas_total_m2,
    }
  }

  const openingOf = (o: OpeningIn): PlanOpening => {
    const w = o.width_m
    if (o.side) {
      const off = o.offset_m ?? 0
      const t = tExt
      if (o.side === 'N') return { type: o.type, a: { x: fp.x + off, y: fp.y }, b: { x: fp.x + off + w, y: fp.y }, t, inward: { x: 0, y: 1 } }
      if (o.side === 'S') return { type: o.type, a: { x: fp.x + off, y: fp.y + fp.h }, b: { x: fp.x + off + w, y: fp.y + fp.h }, t, inward: { x: 0, y: -1 } }
      if (o.side === 'E') return { type: o.type, a: { x: fp.x + fp.w, y: fp.y + off }, b: { x: fp.x + fp.w, y: fp.y + off + w }, t, inward: { x: -1, y: 0 } }
      return { type: o.type, a: { x: fp.x, y: fp.y + off }, b: { x: fp.x, y: fp.y + off + w }, t, inward: { x: 1, y: 0 } }
    }
    const x = o.x ?? 0
    const y = o.y ?? 0
    if (o.orient === 'v') return { type: o.type, a: { x, y: y - w / 2 }, b: { x, y: y + w / 2 }, t: tInt, inward: { x: 1, y: 0 } }
    return { type: o.type, a: { x: x - w / 2, y }, b: { x: x + w / 2, y }, t: tInt, inward: { x: 0, y: 1 } }
  }

  const planDrawings = floors.map(planOf)

  // ---------- שטחים ובדיקות ----------
  const fpArea = fp.w * fp.h
  const built = P.areas?.built_area_gross_m2 ?? Number(pick<number | undefined>(undefined, 'built_area_gross_m2', fpArea * floors.length, 'שטח בנוי ברוטו'))
  for (const d of planDrawings) {
    const exp = d.expectedArea ?? fpArea
    if (d.expectedArea === undefined) assumptions.push(`סך שטח ${d.title}: ${fmt(exp)} מ"ר לפי המתאר`)
    const dev = Math.abs((d.totalArea ?? 0) - exp) / exp
    checks.push({ ok: dev <= 0.02, text: `${d.title}: סכום החדרים ${fmt(d.totalArea ?? 0)} מ"ר מול ${fmt(exp)} מ"ר, סטייה ${fmt(dev * 100)}%` })
  }
  const gross = fpArea * floors.length
  checks.push({ ok: Math.abs(gross - built) / built <= 0.02, text: `שטח בנוי ברוטו: ${fmt(gross)} מ"ר מהתוכניות מול ${fmt(built)} מ"ר בפרויקט` })

  // מגרש וגינה: מלבן המגרש מהקובץ, או מלבן סביב המבנה בשטח שמתאים לגינה
  const gardenArea = P.areas?.garden_area_m2 ?? Number(pick<number | undefined>(undefined, 'garden_area_m2', fpArea * 2, 'שטח גינה'))
  let plotRect = P.plot?.rect
  if (!plotRect) {
    // שוליים שווים בצדדים ובצפון, והגינה העיקרית בדרום
    const total = gardenArea + fpArea
    const side = 3
    const W = fp.w + side * 2
    const H = total / W
    plotRect = { x: fp.x - side, y: fp.y - side, w: W, h: H }
    assumptions.push(`מלבן המגרש: ${fmt(W)}×${fmt(H)} מ׳, 3 מ׳ מצדדים ומצפון והשאר בדרום, כך ששטח הגינה ${fmt(gardenArea)} מ"ר`)
  }
  const gardenCalc = plotRect.w * plotRect.h - fpArea
  checks.push({ ok: Math.abs(gardenCalc - gardenArea) / gardenArea <= 0.02, text: `שטח גינה: ${fmt(gardenCalc)} מ"ר במודל מול ${fmt(gardenArea)} מ"ר בפרויקט` })

  // ---------- חומרים ----------
  const M = input.materials ?? {}
  const mats = M.materials ?? []
  const byId = new Map(mats.map((m) => [m.id, m]))
  const role = (r: keyof NonNullable<typeof M.roles>, fallbackId: string, hex: string, he: string, en: string): Chip => {
    const id = M.roles?.[r] ?? fallbackId
    const m = byId.get(id)
    if (m) return m
    assumptions.push(`חומר ${he}: ${hex}, ברירת מחדל`)
    return { id, name_he: he, name_en: en, hex }
  }
  const envelope = role('envelope', 'concrete', '#b9b4aa', 'בטון חשוף', 'Exposed concrete')
  const roof = role('roof', envelope.id, envelope.hex, 'דקת גג בטון', 'Concrete roof slab')
  const glass = role('glass', 'glass', '#9fb4bd', 'זכוכית', 'Glass')
  const ground = role('groundcover', 'groundcover', '#7d8a52', 'כיסוי קרקע ירוק זית', 'Olive groundcover')
  let chips = (M.palette?.chips ?? []).map((id) => byId.get(id)).filter((x): x is Chip => Boolean(x))
  if (chips.length < 5) {
    const extra = [envelope, glass, ground, ...mats].filter((m, i, a) => a.findIndex((x) => x.id === m.id) === i && !chips.some((c) => c.id === m.id))
    chips = [...chips, ...extra].slice(0, 5)
    if ((M.palette?.chips ?? []).length < 5) assumptions.push('פלטת הצבעים הושלמה לחמישה ריבועים מתוך רשימת החומרים')
  }

  // ---------- סצנה ----------
  const rect = (x: number, y: number, w: number, h: number): XY[] => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
  const top = Math.max(...floors.map((f) => f.level_m + (f.height_m ?? floorH)))
  const ov = 0.3
  const scene: Scene3D = {
    volumes: [
      ...floors.map((f) => ({ poly: rect(fp.x, fp.y, fp.w, fp.h), z0: f.level_m, z1: f.level_m + (f.height_m ?? floorH), role: 'envelope' as const })),
      ...floors.slice(1).map((f) => ({ poly: rect(fp.x - 0.06, fp.y - 0.06, fp.w + 0.12, fp.h + 0.12), z0: f.level_m - 0.12, z1: f.level_m + 0.05, role: 'slab' as const })),
      { poly: rect(fp.x - ov, fp.y - ov, fp.w + ov * 2, fp.h + ov * 2), z0: top, z1: top + 0.28, role: 'roof' },
    ],
    glass: floors.flatMap((f) =>
      (f.openings ?? [])
        .filter((o) => o.side)
        .map((o) => {
          const p = openingOf(o)
          const sill = o.sill_m ?? (o.type === 'window' ? 0.9 : 0)
          const h = o.height_m ?? (o.type === 'window' ? 1.4 : o.type === 'sliding' ? 2.5 : 2.2)
          return { a: p.a, b: p.b, z0: f.level_m + sill, z1: f.level_m + sill + h, type: o.type }
        }),
    ),
    ground: [{ poly: rect(plotRect.x, plotRect.y, plotRect.w, plotRect.h), color: ground.hex, z: 0, name: 'גינה' }],
    trees: (plans.trees ?? []).map((t) => ({ at: { x: t.x, y: t.y }, r: t.r, h: t.h })),
    north,
    colors: { envelope: envelope.hex, roof: roof.hex, glass: glass.hex, ground: ground.hex, frame: '#3a3a3a' },
    expect: { w: fp.w, d: fp.h, floors: floors.length, floorH },
  }

  // ---------- תוויות ----------
  let callouts: CalloutIn[] = input.callouts ?? []
  if (!callouts.length) {
    callouts = [
      { text_he: roof.name_he, anchor: { x: fp.x + fp.w / 2, y: fp.y + fp.h / 2, z: top + 0.28 } },
      { text_he: envelope.name_he, anchor: { x: fp.x + fp.w, y: fp.y + fp.h * 0.3, z: top * 0.7 } },
      { text_he: 'הזזה לגינה, דרום', anchor: { x: fp.x + fp.w / 2, y: fp.y + fp.h, z: 1.2 } },
      { text_he: ground.name_he, anchor: { x: plotRect.x + plotRect.w * 0.3, y: plotRect.y + plotRect.h - 1.5, z: 0 } },
    ]
  }

  const meta = {
    title: pick(P.title_he, 'title_he', 'בית וגינה', 'שם הפרויקט'),
    subtitle: pick(P.subtitle_he, 'subtitle_he', 'גיליון הדמיה ותוכניות', 'כותרת משנה'),
    studioName: pick(P.studio?.name_he, 'studio.name_he', 'סטודיו', 'שם הסטודיו'),
    studioAddress: pick(P.studio?.address_he, 'studio.address_he', '', 'כתובת הסטודיו'),
    logo: input.logo,
    address: pick(P.address_he, 'address_he', 'ללא כתובת', 'כתובת הפרויקט'),
    gush: pick(P.plot?.gush, 'gush', 'לא צוין', 'גוש'),
    helka: pick(P.plot?.helka, 'helka', 'לא צוין', 'חלקה'),
    plotArea: P.plot?.area_m2 ?? P.areas?.plot_area_m2 ?? r2(plotRect.w * plotRect.h),
    builtArea: built,
    gardenArea,
    year: String(pick(P.year, 'year', new Date().getFullYear(), 'שנה')),
    planner: pick(P.planner_he, 'planner_he', P.studio?.name_he ?? 'לא צוין', 'מתכנן'),
    scale: pick(P.scale, 'scale', '1:100', 'קנה מידה'),
    drawingNo: pick(P.drawing_no, 'drawing_no', 'A-101', 'מספר שרטוט'),
    date: pick(P.date, 'date', new Date().toISOString().slice(0, 10), 'תאריך'),
  }
  if (!input.logo) assumptions.push('לוגו: assets/logo.svg חסר, הגיליון בלי לוגו')

  return {
    meta,
    plans: planDrawings,
    scene,
    chips,
    callouts,
    poem: (input.poem ?? 'צל הזית נח\nעל בטון חשוף וחם\nרוח מן הים').trim(),
    post: (input.post ?? '').trim() || 'בית של בטון חשוף שנפתח דרומה אל גינה ירוקה. הדמיה ויזואלית לשלב התכנון.',
    assumptions,
    checks,
  }
}
