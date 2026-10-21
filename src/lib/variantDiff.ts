// מה מייחד כל חלופה: שטחים לפי חומר, פריטים, סגנון ודרישות, מול החלופה הראשית ומול שאר החלופות
import type { Project, Variant } from './types'
import { MATERIALS, OBJECTS, LINES } from './garden'
import { fmtNum, surfaceArea } from './bom'
import { STYLES } from '../data/gardenGuide'

export interface VariantSummary {
  areas: Map<string, number>
  objects: Map<string, number>
  lines: Map<string, number>
  total: number
}

export function summarize(v: Variant): VariantSummary {
  const areas = new Map<string, number>()
  const objects = new Map<string, number>()
  const lines = new Map<string, number>()
  let total = 0
  for (const e of v.elements) {
    if (e.kind === 'surface' && !e.stairs) {
      const a = surfaceArea(e)
      total += a
      const k = MATERIALS[e.material].text
      areas.set(k, (areas.get(k) ?? 0) + a)
    } else if (e.kind === 'object') {
      const k = OBJECTS[e.type].text
      objects.set(k, (objects.get(k) ?? 0) + 1)
    } else if (e.kind === 'line') {
      const k = LINES[e.type].text
      lines.set(k, (lines.get(k) ?? 0) + 1)
    }
  }
  return { areas, objects, lines, total }
}

const REQ_FIELDS: { k: 'functions' | 'plants' | 'materials' | 'constraints'; t: string }[] = [
  { k: 'functions', t: 'פונקציות' },
  { k: 'plants', t: 'צמחייה' },
  { k: 'materials', t: 'חומרים' },
  { k: 'constraints', t: 'אילוצים' },
]

// הסבר השינוי: מה שונה בחלופה הזו לעומת החלופה הראשית, ומה ייחודי לה מול כל השאר
export function explainVariant(p: Project, v: Variant): string[] {
  const base = p.variants[0]
  const out: string[] = []
  const style = STYLES.find((s) => s.id === v.requirements.style)
  if (v.id === base.id) {
    out.push('**החלופה הראשית**: הבסיס שאליו מושוות שאר החלופות.')
  } else {
    if (style && style.id !== base.requirements.style) out.push(`**סגנון ${style.name}**: ${style.tagline}`)
    const a = summarize(v)
    const b = summarize(base)
    const keys = new Set([...a.areas.keys(), ...b.areas.keys()])
    const deltas = [...keys]
      .map((k) => ({ k, d: (a.areas.get(k) ?? 0) - (b.areas.get(k) ?? 0) }))
      .filter((x) => Math.abs(x.d) >= 1)
      .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
      .slice(0, 4)
    if (deltas.length) out.push('שטחים מול הראשית: ' + deltas.map((x) => `**${x.d > 0 ? '+' : '-'}${fmtNum(Math.abs(x.d))} מ"ר ${x.k}**`).join(', '))
    const okeys = new Set([...a.objects.keys(), ...b.objects.keys()])
    const od = [...okeys].map((k) => ({ k, d: (a.objects.get(k) ?? 0) - (b.objects.get(k) ?? 0) })).filter((x) => x.d !== 0)
    const added = od.filter((x) => x.d > 0).map((x) => `${x.d > 1 ? `${x.d} ` : ''}${x.k}`)
    const removed = od.filter((x) => x.d < 0).map((x) => `${-x.d > 1 ? `${-x.d} ` : ''}${x.k}`)
    if (added.length) out.push(`נוספו: **${added.slice(0, 5).join(', ')}**`)
    if (removed.length) out.push(`הוסרו: ${removed.slice(0, 5).join(', ')}`)
    for (const f of REQ_FIELDS) {
      const x = v.requirements[f.k].trim()
      const y = base.requirements[f.k].trim()
      if (x && x !== y) out.push(`${f.t}: **${x}**${y ? ` (בראשית: ${y})` : ''}`)
    }
    if (v.requirements.budget && v.requirements.budget !== base.requirements.budget) out.push(`תקציב יעד שונה: **${fmtNum(v.requirements.budget)} ש"ח**`)
    if (!out.length) out.push('זהה כמעט לחלופה הראשית. אפשר לשנות בתוכנית או לבחור סגנון.')
  }
  // ייחודי מול כל השאר: חומרים ופריטים שרק כאן
  const others = p.variants.filter((x) => x.id !== v.id).map(summarize)
  if (others.length) {
    const me = summarize(v)
    const only = [...me.areas.keys(), ...me.objects.keys()].filter((k) => others.every((o) => !o.areas.has(k) && !o.objects.has(k)))
    if (only.length) out.push(`רק בחלופה הזו: **${only.slice(0, 5).join(', ')}**`)
  }
  return out
}
