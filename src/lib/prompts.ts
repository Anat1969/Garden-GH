// פרומפט להמחשה מתוך הפרויקט עצמו: הסגנון, החומרים והפריטים שבתוכנית, והאור מדרום-מערב.
// מבנה קבוע: משפט זיקוק בעברית, פרומפט בעברית, ובלוק פרמטרים למידג'רני.
import type { Variant } from './types'
import type { StyleGuide } from '../data/gardenGuide'
import { MATERIALS, OBJECTS, LINES } from './garden'
import { surfaceArea } from './bom'

const END = 'Documentary realism, Professional architecture photography, 1:1'
export const MJ_PARAMS = '--ar 1:1 --style raw --s 150 --no text, words, writing, frame divisions'

export function projectPrompt(v: Variant, style: StyleGuide | null): { distill: string; text: string; mj: string } {
  const surfaces = v.elements.filter((e) => e.kind === 'surface')
  const byMat = new Map<string, number>()
  for (const s of surfaces) if (s.kind === 'surface') byMat.set(MATERIALS[s.material].text, (byMat.get(MATERIALS[s.material].text) ?? 0) + surfaceArea(s))
  const mats = [...byMat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m]) => m)
  const objs = [...new Set(v.elements.filter((e) => e.kind === 'object').map((e) => (e.kind === 'object' ? OBJECTS[e.type].text : '')))].slice(0, 5)
  const lines = [...new Set(v.elements.filter((e) => e.kind === 'line').map((e) => (e.kind === 'line' ? LINES[e.type].text : '')))].slice(0, 2)
  const styleTxt = style ? `בסגנון ${style.name}` : ''
  const distill = style ? `${style.tagline} הגינה של הפרויקט, כפי שתוכננה, ברגע שהאור הנמוך מדרום-מערב מגלה את החומרים.` : 'הגינה של הפרויקט כפי שתוכננה, ברגע שהאור הנמוך מדרום-מערב מגלה את החומרים.'
  const parts = [
    `גינת קרקע קטנה ${styleTxt} צמודה לבית ישראלי, קיר הבית ופתח היציאה לגינה בשוליים של הפריים.`,
    mats.length ? `משטחים: ${mats.join(', ')}, בגבולות חדים ובמרקם מוחשי.` : '',
    objs.length ? `בתוך הגינה: ${objs.join(', ')}.` : '',
    lines.length ? `קווים מובילים: ${lines.join(' ו')}.` : '',
    'אור שקיעה נמוך מדרום-מערב, צללים ארוכים על המשטחים, מצלמה בגובה עיניים מעט מוגבהת, קו מוביל אל נקודת מוקד בשליש הרחוק של הפריים.',
    style ? `פלטה ותחושה: ${style.materials.slice(0, 3).join(', ')}.` : '',
    'מתח בין משטח קשה ומסודר לצמחייה רכה ופרועה.',
    END,
  ]
  return { distill, text: parts.filter(Boolean).join(' '), mj: MJ_PARAMS }
}
