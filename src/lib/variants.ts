// חלופות תכנון: הצעות אוטומטיות לפי סגנון ודרישות, וחלופה ריקה לתכנון מאפס.
import type { Project, Variant, Wall } from './types'
import { STYLES, type StyleGuide } from '../data/gardenGuide'
import { FUNCTIONS, defaultZones, designGarden, type FunctionId } from './designer'
import { newVariant, uid, updateProject } from './store'
import { isStructural } from './reset'

export type Budget = 'low' | 'mid' | 'high'

export const fnsFromText = (t: string): FunctionId[] => FUNCTIONS.filter((f) => t.includes(f.text)).map((f) => f.id)
export const budgetLevel = (b: number | null): Budget => (b !== null && b < 40000 ? 'low' : b !== null && b > 120000 ? 'high' : 'mid')

// דירוג סגנונות לפי הדרישות: חיסכון במים, תחזוקה, ילדים, מאכל, תקציב
export function rankStyles(fns: FunctionId[], budget: Budget, reqText: string): StyleGuide[] {
  const score = (s: StyleGuide) => {
    let x = 0
    if (fns.includes('lowMaint') && s.maintenance === 'נמוכה') x += 3
    if (/מים|חסכונ/.test(reqText) && s.water === 'חסכוני') x += 3
    if (fns.includes('kids') && s.id === 'family') x += 4
    if (fns.includes('edible') && s.id === 'edible') x += 4
    if (fns.includes('water') && (s.id === 'japanese' || s.id === 'tropical')) x += 1
    if (budget === 'low' && s.budget === 'נמוך') x += 2
    if (budget === 'low' && s.budget === 'גבוה') x -= 2
    if (budget === 'high' && s.budget === 'גבוה') x += 1
    if (s.id === 'mediterranean') x += 1 // מתאים לרוב הגינות בישראל
    return x
  }
  return [...STYLES].sort((a, b) => score(b) - score(a))
}

// הצעה אחת בסגנון: עותק של החלופה, אזורי הגינה מוחלפים בתכנון
export function makeDesignVariant(base: Variant, style: StyleGuide, fns: FunctionId[], budget: Budget, zoneIds?: string[]) {
  const zones = defaultZones(base.elements).filter((z) => !zoneIds || zoneIds.includes(z.id))
  const walls = base.elements.filter((e): e is Wall => e.kind === 'wall')
  const res = designGarden({ zones, walls, style, functions: fns, budget, uid })
  if (!res.elements.length) return { variant: null, notes: res.notes }
  const ids = new Set(zones.map((z) => z.id))
  const v = newVariant(`הצעה: ${style.name}`, base)
  v.elements = [...v.elements.filter((e) => !ids.has(e.id)), ...res.elements]
  v.requirements = { ...v.requirements, style: style.id }
  v.note = `נוצרה אוטומטית בסגנון ${style.name}.`
  v.lastChange = { at: new Date().toISOString(), text: `תכנון אוטומטי בסגנון ${style.name}` }
  return { variant: v, notes: res.notes }
}

export function addVariants(projectId: string, list: Variant[], activate = true) {
  if (!list.length) return
  updateProject(projectId, (p) => {
    const names = new Set(p.variants.map((v) => v.name))
    const named = list.map((v) => {
      let n = v.name
      let i = 2
      while (names.has(n)) n = `${v.name} (${i++})`
      names.add(n)
      return { ...v, name: n }
    })
    return { ...p, variants: [...p.variants, ...named], activeVariantId: activate ? named[named.length - 1].id : p.activeVariantId }
  })
}

// חלופה ריקה: רק הבית, הפתחים וגבול המגרש. הגינה מתוכננת מאפס
export function makeBlankVariant(p: Project, base: Variant): Variant {
  const v = newVariant('תכנון מאפס', base)
  v.elements = v.elements.filter(isStructural)
  v.assignments = {}
  v.note = `חלופה ריקה לתכנון ידני מאפס, על בסיס הבית של ${p.name}.`
  v.lastChange = { at: new Date().toISOString(), text: 'נוצרה חלופה ריקה לתכנון מאפס' }
  return v
}
