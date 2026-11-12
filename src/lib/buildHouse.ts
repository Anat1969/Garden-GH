// בניית הבית מקריאת ההיתר: קנה מידה אוטומטי מהמידות, ובנייה של הקירות, הפתחים, גבול המגרש ואזורי הגינה.
// כל כישלון מחזיר סיבה ברורה וצעד הבא, במקום מודל ריק בלי הסבר.
import type { PlanDimension, Pt } from './types'
import { getState, setPlanScale, uid, updateVariant } from './store'
import { attachLines, inferScale, reliableDimScale } from './dims'
import { isAutoHouse, replaceAuto, STRUCT_SRC, structureToElements } from './structureToElements'

const latest = (id: string) => getState().projects.find((p) => p.id === id)

// קנה מידה מהמידות הכתובות: קודם לפי קווי המידה, ואם אין, לפי התאמה בין המידות לצלעות קו המתאר של הבית
export function ensureScale(projectId: string): { ok: boolean; how: string } {
  const p = latest(projectId)
  const permit = p?.permit
  if (!p || !permit) return { ok: false, how: 'אין היתר' }
  if (permit.scale.metersPerPt) return { ok: true, how: 'קנה המידה כבר קבוע' }
  const page = permit.planPage
  const dims = (permit.dims ?? []).filter((d) => d.page === page && d.kind === 'length' && d.status !== 'rejected')

  // 1. לפי קווי המידה
  const att = attachLines(permit.dims ?? [], [], page)
  if (att.scale && reliableDimScale(att.scale)) {
    setPlanScale(projectId, { den: null, metersPerPt: att.scale.metersPerPt, source: 'dimensions' })
    return { ok: true, how: `קנה המידה נקבע מ-${att.scale.support} מידות כתובות שמסכימות ביניהן` }
  }

  // 2. לפי צלעות הבית: כל מידה מוצעת לכל צלע, וקנה המידה שהכי הרבה מידות מסכימות עליו נבחר
  const s = permit.structure
  const edges: number[] = []
  for (const u of s?.units ?? []) {
    const f = u.footprint
    for (let i = 0; i < f.length; i++) {
      const a: Pt = f[i]
      const b: Pt = f[(i + 1) % f.length]
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      if (L > 1) edges.push(L)
    }
  }
  const big = dims.filter((d: PlanDimension) => d.value >= 2 && d.value <= 40)
  if (edges.length && big.length >= 2) {
    const cands = big.map((d) => edges.map((L) => ({ line: { x1: 0, y1: 0, x2: L, y2: 0 }, mpp: d.value / L })))
    const inf = inferScale(cands)
    if (inf && inf.support >= 2) {
      // מוערך: התאמה סטטיסטית, לא קו מידה מאושר
      setPlanScale(projectId, { den: null, metersPerPt: inf.mpp, source: 'calibrated' })
      return { ok: true, how: `קנה המידה הוערך מהתאמה של ${inf.support} מידות כתובות לצלעות הבית. כדאי לאשר במסך המידות.` }
    }
  }
  if (att.scale && att.scale.support >= 2) {
    setPlanScale(projectId, { den: null, metersPerPt: att.scale.metersPerPt, source: 'calibrated' })
    return { ok: true, how: `קנה המידה הוערך מ-${att.scale.support} מידות בלבד. כדאי לאשר במסך המידות.` }
  }
  return {
    ok: false,
    how: dims.length ? `נקראו ${dims.length} מידות, אבל לא מספיק כדי לקבוע קנה מידה.` : 'לא נקראו מידות בשרטוט העבודה.',
  }
}

export interface BuildResult {
  ok: boolean
  count: number
  replaced: number
  lines: string[]
  next?: { to: string; t: string }
}

export function buildHouse(projectId: string): BuildResult {
  const lines: string[] = []
  let p = latest(projectId)
  if (!p?.permit) return { ok: false, count: 0, replaced: 0, lines: ['אין היתר בפרויקט.'], next: { to: 'permit', t: 'העלאת היתר' } }
  if (!p.permit.structure) {
    return {
      ok: false,
      count: 0,
      replaced: 0,
      lines: ['עוד לא נקרא המבנה מההיתר: קו הבית, הפתחים וגבול המגרש.', 'במסך ההיתר: "קריאה מלאה של ההיתר", או "קריאת מבנה וגינה" משרטוט העבודה.'],
      next: { to: 'permit', t: 'לקריאת ההיתר' },
    }
  }
  if (!p.permit.scale.metersPerPt) {
    const sc = ensureScale(projectId)
    lines.push(sc.how)
    if (!sc.ok)
      return {
        ok: false,
        count: 0,
        replaced: 0,
        lines: [...lines, 'בלי קנה מידה אין מטרים, ולכן אי אפשר לבנות את הבית.', 'במסך המידות: "קריאה חכמה", ואז "שימוש כקנה מידה". או כיול ידני: שתי לחיצות על מידה ידועה.'],
        next: { to: 'dims', t: 'לקביעת קנה מידה' },
      }
    p = latest(projectId)!
  }
  const els = structureToElements(p, uid)
  if (!els.some((e) => e.kind === 'wall')) {
    return {
      ok: false,
      count: 0,
      replaced: 0,
      lines: [...lines, 'בקריאת המבנה לא נמצא קו מתאר של הבית.', 'אפשר לבחור שרטוט עבודה אחר (תוכנית קומת קרקע) ולקרוא שוב, או לשרטט קירות ידנית בתוכנית.'],
      next: { to: 'permit', t: 'לבחירת שרטוט' },
    }
  }
  const v = p.variants.find((x) => x.id === p!.activeVariantId)!
  const replaced = v.elements.filter((e) => isAutoHouse(e) || e.source.startsWith(STRUCT_SRC)).length
  updateVariant(projectId, (x) => ({ ...x, elements: replaceAuto(x.elements, els, true) }))
  const walls = els.filter((e) => e.kind === 'wall').length
  const openings = els.filter((e) => e.kind === 'opening').length
  lines.push(`נבנו ${els.length} אלמנטים: ${walls} קירות, ${openings} פתחים, גבול מגרש ואזורי גינה${replaced ? `, במקום ${replaced} שנבנו קודם` : ''}.`)
  lines.push('כולם מסומנים "מוערך" עד שמאשרים אותם בתוכנית.')
  return { ok: true, count: els.length, replaced, lines, next: { to: 'model', t: 'למודל התלת-ממדי' } }
}
