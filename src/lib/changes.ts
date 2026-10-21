// השינוי התכנוני האחרון בחלופה: משפט קצר שנגזר מההבדל בין רשימת האלמנטים לפני ואחרי
import type { Element, Project, Variant } from './types'
import { elementName } from './bom'

const pos = (e: Element) => JSON.stringify(e)

export function describeChange(before: Element[], after: Element[]): string | null {
  const b = new Map(before.map((e) => [e.id, e]))
  const a = new Map(after.map((e) => [e.id, e]))
  const added = after.filter((e) => !b.has(e.id) && e.kind !== 'sketch')
  const removed = before.filter((e) => !a.has(e.id) && e.kind !== 'sketch')
  const edited = after.filter((e) => b.has(e.id) && pos(b.get(e.id)!) !== pos(e))
  const names = (list: Element[]) => {
    const m = new Map<string, number>()
    for (const e of list) {
      const n = elementName(e)
      m.set(n, (m.get(n) ?? 0) + 1)
    }
    return [...m.entries()].slice(0, 3).map(([n, c]) => (c > 1 ? `${c} ${n}` : n)).join(', ') + (m.size > 3 ? ' ועוד' : '')
  }
  if (added.length && removed.length) return `הוחלפו ${removed.length} אלמנטים ב-${added.length}: ${names(added)}`
  if (added.length) return `נוסף ${names(added)}`
  if (removed.length) return `נמחק ${names(removed)}`
  if (edited.length) {
    const e = edited[0]
    const o = b.get(e.id)!
    const what =
      e.approved !== o.approved && edited.every((x) => x.approved !== b.get(x.id)!.approved)
        ? 'אושר'
        : e.kind === 'surface' && o.kind === 'surface' && e.material !== o.material
          ? 'הוחלף חומר ב'
          : 'נערך'
    return edited.length > 1 ? `${what} ${edited.length} אלמנטים (${names(edited)})` : `${what} ${names([e])}`
  }
  return null
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'עכשיו'
  if (m < 60) return `לפני ${m} דקות`
  const h = Math.round(m / 60)
  if (h < 24) return `לפני ${h} שעות`
  return new Date(iso).toLocaleDateString('he-IL')
}

export function lastChangeText(v: Variant): string | null {
  return v.lastChange ? `${v.lastChange.text} · ${ago(v.lastChange.at)}` : null
}

// השינוי האחרון בפרויקט: האחרון מכל החלופות, עם שם החלופה
export function projectLastChange(p: Project): { text: string; variant: string } | null {
  const v = [...p.variants].filter((x) => x.lastChange).sort((x, y) => y.lastChange!.at.localeCompare(x.lastChange!.at))[0]
  return v ? { text: lastChangeText(v)!, variant: v.name } : null
}
