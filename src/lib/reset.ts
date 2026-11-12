// איפוס התכנון: המבנה (בית, פתחים, גבול מגרש, קירות תמך ומדרגות מההיתר) נשאר, והגינה מתחילה מחדש
import type { Element, Project, Variant } from './types'
import { structureToElements } from './structureToElements'
import { uid } from './store'

export const isStructural = (e: Element) =>
  (e.kind === 'wall' && (e.scope === 'house' || e.source.includes('קריאת מבנה'))) ||
  e.kind === 'opening' ||
  (e.kind === 'fence' && e.boundary) ||
  (e.kind === 'surface' && Boolean(e.stairs))

// mode: 'permit' מחזיר את אזורי הגינה כפי שנקראו מההיתר, 'empty' משאיר רק את המבנה
export function resetElements(p: Project, v: Variant, mode: 'permit' | 'empty'): Element[] {
  const keep = v.elements.filter(isStructural)
  if (mode === 'empty') return keep
  const zones = structureToElements(p, uid).filter((e) => e.kind === 'surface' && !e.stairs)
  return [...keep, ...zones]
}
