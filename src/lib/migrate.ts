// שדרוג פרויקטים קיימים במכשיר: מוסיף מה שנבנה מאז שנוצרו, בלי לגעת בתכנון של המשתמש.
// מדרגות: אזור "stairs" בקריאת ההיתר הופך למדרגות אמיתיות בכל החלופות (זה המבנה המקורי, לא תכנון).
import type { Element, Project, Surface } from './types'
import { structureToElements } from './structureToElements'
import { SHANI_STRUCTURE } from '../data/shaniProject'
import { getState, uid, updateProject } from './store'

const zoneTag = (label: string) => `(${label})`

export function upgradeStairs(p: Project): Project | null {
  const s = p.permit?.structure
  if (!s) return null
  let changed = false
  let zones = s.zones
  // הבית של שני: מפלסי המדרגות וכיוון הירידה מהקריאה המעודכנת
  if (p.name === 'הבית של שני') {
    zones = s.zones.map((z) => {
      const fresh = SHANI_STRUCTURE.zones.find((f) => f.label === z.label)
      if (!fresh || z.kind !== 'stairs' || (z.levelToAbs != null && z.down)) return z
      changed = true
      return { ...z, levelAbs: fresh.levelAbs, levelToAbs: fresh.levelToAbs, down: fresh.down }
    })
  }
  const withZones: Project = { ...p, permit: { ...p.permit!, structure: { ...s, zones } } }
  const stairs = structureToElements(withZones, uid).filter((e): e is Surface => e.kind === 'surface' && Boolean(e.stairs))
  if (!stairs.length) return changed ? withZones : null
  const manual = p.name === 'הבית של שני'
  const variants = withZones.variants.map((v) => {
    const hasHouse = v.elements.some((e) => e.kind === 'wall' && e.scope === 'house')
    let els: Element[] = v.elements
    let vChanged = false
    for (const f of stairs) {
      const label = /\(([^)]+)\)\s*$/.exec(f.source)?.[1] ?? ''
      const cur = els.find((e) => e.kind === 'surface' && label && e.source.includes(zoneTag(label)))
      if (cur && cur.kind === 'surface') {
        if (cur.stairs) continue
        els = els.map((e) => (e.id === cur.id ? { ...cur, level: f.level, stairs: f.stairs, poly: cur.poly ?? f.poly } : e))
        vChanged = true
      } else if (hasHouse) {
        els = [...els, { ...f, id: uid(), source: manual ? f.source.replace('קריאת מבנה', 'קריאת מבנה ידנית') : f.source }]
        vChanged = true
      }
    }
    if (!vChanged) return v
    changed = true
    return { ...v, elements: els }
  })
  return changed ? { ...withZones, variants } : null
}

export function runMigrations() {
  for (const p of getState().projects) {
    const up = upgradeStairs(p)
    if (up) updateProject(p.id, () => up)
  }
}
