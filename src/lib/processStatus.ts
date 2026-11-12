// תמונת מצב של תהליך העבודה: מה קיים, מה מוערך ומה חסר, לפי ששת שלבי המסלול.
// בנוסף: פערים בתהליך עצמו, מידע שהאפליקציה לא אוספת היום ונדרש לתכנון טוב.
import type { Project, Variant } from './types'
import { hasBasis } from './bom'
import { getState } from './store'

export type StepState = 'ok' | 'partial' | 'missing'

export interface StatusItem {
  stage: number
  t: string
  state: StepState
  note: string
  to: string // לשונית בפרויקט
}

export const STATE_TEXT: Record<StepState, string> = { ok: 'קיים', partial: 'חלקי או מוערך', missing: 'חסר' }

export function processStatus(p: Project, v: Variant): StatusItem[] {
  const els = v.elements
  const req = v.requirements
  const S: StatusItem[] = []
  const add = (stage: number, t: string, state: StepState, note: string, to = '') => S.push({ stage, t, state, note, to })

  add(1, 'כתובת', p.address.trim() ? 'ok' : 'missing', p.address.trim() || 'שדה חובה')
  add(1, 'מיקום על המפה', p.location ? 'ok' : 'missing', p.location ? (p.location.source === 'pin' ? 'לפי דקירה' : p.location.source === 'address' ? 'לפי כתובת' : 'לפי קואורדינטות') : 'בלי מיקום אין נתוני אקלים מדויקים')
  add(1, 'נתוני אתר ואקלים', p.site?.live ? 'ok' : p.site ? 'partial' : 'missing', p.site?.live ? 'מ-Open-Meteo, מוערך' : p.site ? 'ממוצע אזורי' : 'לא חולצו')
  add(1, 'היתר', p.permit ? 'ok' : 'missing', p.permit ? `${p.permit.fileName}, ${p.permit.pageCount} עמודים` : 'לא הועלה', 'permit')
  add(1, 'קנה מידה', hasBasis(p) ? (p.permit?.scale.source === 'calibrated' ? 'partial' : 'ok') : 'missing', hasBasis(p) ? (p.permit?.scale.den ? `1:${p.permit.scale.den}` : 'מהמידות') : 'אין בסיס למספרים', 'dims')
  add(1, 'חץ צפון', p.extracted?.north ? 'ok' : p.northSet ? 'partial' : 'missing', p.extracted?.north ? 'חולץ מההיתר' : p.northSet ? 'הוזן ידנית' : 'לא חולץ', '')
  add(1, 'מפלס ±0.00', p.extracted?.baseLevel ? 'ok' : p.baseLevel !== undefined ? 'partial' : 'missing', p.extracted?.baseLevel ? 'חולץ מההיתר' : p.baseLevel !== undefined ? 'הוזן ידנית' : 'לא ידוע')
  add(1, 'שטח המגרש', p.extracted?.plotArea ? 'ok' : p.plotArea ? 'partial' : 'missing', p.plotArea ? `${Math.round(p.plotArea)} מ"ר` : 'לא ידוע')
  add(1, 'סוג קרקע', p.soil ? 'partial' : 'missing', p.soil ? `${p.soil} (לא נבדק במעבדה)` : 'לא הוזן')

  const house = els.filter((e) => e.kind === 'wall' && e.scope === 'house').length
  const boundary = els.filter((e) => e.kind === 'fence' && e.boundary).length
  const pending = els.filter((e) => !e.approved && e.kind !== 'sketch').length
  add(2, 'קירות הבית', house ? 'ok' : 'missing', house ? `${house} קירות` : 'לא נבנה הבית', 'plan')
  add(2, 'גבול מגרש', boundary ? 'partial' : 'missing', boundary ? 'מההיתר, לאימות במדידה' : 'לא סומן', 'plan')
  add(2, 'אישור אלמנטים', els.length && !pending ? 'ok' : els.length ? 'partial' : 'missing', pending ? `${pending} ממתינים לאישור` : els.length ? 'הכול אושר' : 'אין אלמנטים', 'plan')

  const fnsSet = Boolean(req.functions.trim())
  add(3, 'דרישות הלקוח', fnsSet && req.budget ? 'ok' : fnsSet || req.budget ? 'partial' : 'missing', [fnsSet ? 'פונקציות' : '', req.budget ? 'תקציב' : '', req.plants ? 'צמחייה' : '', req.materials ? 'חומרים' : ''].filter(Boolean).join(', ') || 'לא הוגדרו')
  add(3, 'אתגרים והצעה', p.brief ? 'ok' : 'missing', p.brief ? `נשמר ${new Date(p.brief.at).toLocaleDateString('he-IL')}` : 'לא נשמר', 'brief')
  const garden = els.filter((e) => (e.kind === 'surface' && !e.stairs) || e.kind === 'object' || e.kind === 'line').length
  add(3, 'תכנון הגינה', garden ? 'ok' : 'missing', garden ? `${garden} אלמנטים בחלופה` : 'לא תוכנן', 'design')

  add(4, 'ניתוח אקלים', (p.extracted?.north || p.northSet) && p.location ? 'ok' : 'partial', (p.extracted?.north || p.northSet) && p.location ? 'מיקום וצפון ידועים' : 'על תנאי: חסר צפון או מיקום', 'model')

  const prices = getState().prices
  const verified = prices.filter((x) => x.verified).length
  add(5, 'מחירון', verified ? (verified === prices.length ? 'ok' : 'partial') : 'partial', verified ? `${verified} מתוך ${prices.length} מאומתים` : 'ברירת מחדל ציבורית, לא מאומת', 'bom')
  add(5, 'תקציב לקוח', req.budget ? 'ok' : 'missing', req.budget ? 'הוזן' : 'לא הוזן', '')

  add(6, 'חלופות', p.variants.length > 1 ? 'ok' : 'partial', `${p.variants.length} חלופות`, 'variants')
  add(6, 'גליון להדפסה', p.sheet?.poem || p.sheet?.post ? 'ok' : 'missing', p.sheet?.poem || p.sheet?.post ? 'נערך' : 'לא נערך', 'sheet')
  return S
}

// פערים בתהליך העבודה עצמו: מידע שנדרש לתכנון טוב ואין לו מקום מסודר באפליקציה, או שלא נאסף
export function processGaps(p: Project, v: Variant): string[] {
  const docs = p.documents ?? []
  const has = (k: string) => docs.some((d) => d.kind === k)
  const g: string[] = []
  if (!has('survey')) g.push('**מדידה טופוגרפית** של המגרש: היום הגבולות והמפלסים מגיעים מההיתר בלבד, ולא ממודד.')
  if (!has('photo')) g.push('**תמונות מהשטח**: מצב קיים, נוף, מבטים לשכנים, צל של עצים שכנים.')
  if (!v.elements.some((e) => e.kind === 'object' && e.existing)) g.push('**סקר צמחייה קיימת**: עצים לשימור, עצים בוגרים (רישיון פקיד יערות), שורשים ליד מבנה.')
  if (!p.soil) g.push('**בדיקת קרקע**: סוג, עומק, מליחות ו-pH. היום רק ערך אופייני לאזור.')
  g.push('**ראיון לקוח מעמיק**: מתי ומי משתמש בגינה, שעות שהייה, הרגלים, אחזקה שמוכנים לקבל. הטופס מכסה רק פונקציות ותקציב.')
  g.push('**תשתיות קיימות**: ברז, חשמל, ביוב, מרזבים ופתחי ניקוז. אין שדות לכך, וחלק דורש חשמלאי או מהנדס מוסמך.')
  g.push('**תקנות מקומיות**: גובה גדר, מצללות, חלחול מים (תמ"א 34), עצים מוגנים. לא נבדק מול הוועדה.')
  g.push('**הסביבה מחוץ למגרש**: בניינים ועצים שכנים שמטילים צל, רעש, מבטים. ניתוח האקלים רואה רק את המגרש.')
  if (!p.site?.live) g.push('**נתוני אקלים למיקום המדויק**: עדיין ממוצע אזורי. לחלץ מחדש כשיש רשת.')
  return g
}

const strip = (s: string) => s.replace(/\*\*/g, '')

export function statusText(p: Project, items: StatusItem[], gaps: string[]): string {
  const ok = items.filter((i) => i.state === 'ok').length
  const L = [`תמונת מצב: ${p.name}, ${new Date().toLocaleDateString('he-IL')}`, `${ok} מתוך ${items.length} פריטים קיימים.`, '']
  const miss = items.filter((i) => i.state === 'missing')
  const part = items.filter((i) => i.state === 'partial')
  if (miss.length) {
    L.push('חסר:')
    miss.forEach((i) => L.push(`- שלב ${i.stage}, ${i.t}: ${i.note}`))
    L.push('')
  }
  if (part.length) {
    L.push('חלקי או מוערך:')
    part.forEach((i) => L.push(`- שלב ${i.stage}, ${i.t}: ${i.note}`))
    L.push('')
  }
  L.push('פערים בתהליך העבודה:')
  gaps.forEach((x) => L.push(`- ${strip(x)}`))
  if (p.processNotes?.trim()) L.push('', 'הערות:', p.processNotes.trim())
  return L.join('\n')
}
