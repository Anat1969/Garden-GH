import type { PriceItem, Unit } from './types'

// קובץ מחירון: code,description,unit,price,category,verified,source,date
export const CSV_HEADER = 'code,description,unit,price,category,verified,source,date'

const UNIT_ALIASES: Record<string, Unit> = {
  m2: 'm2',
  'מ"ר': 'm2',
  'מר': 'm2',
  sqm: 'm2',
  m: 'm',
  'מ"א': 'm',
  'מא': 'm',
  'מטר': 'm',
  m3: 'm3',
  'מ"ק': 'm3',
  'מק': 'm3',
  unit: 'unit',
  "יח'": 'unit',
  'יח': 'unit',
  'יחידה': 'unit',
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

export interface ParseResult {
  items: PriceItem[]
  errors: string[]
}

export function parsePriceCsv(text: string): ParseResult {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  const errors: string[] = []
  const items: PriceItem[] = []
  if (!rows.length) return { items, errors: ['הקובץ ריק'] }
  const header = splitCsvLine(rows[0]).map((h) => h.toLowerCase())
  const idx = (name: string) => header.indexOf(name)
  for (const need of ['code', 'description', 'unit', 'price']) {
    if (idx(need) < 0) errors.push(`חסרה עמודה: ${need}`)
  }
  if (errors.length) return { items, errors }
  rows.slice(1).forEach((line, i) => {
    const c = splitCsvLine(line)
    const unitRaw = (c[idx('unit')] ?? '').toLowerCase()
    const unit = UNIT_ALIASES[unitRaw] ?? UNIT_ALIASES[unitRaw.replace(/\s/g, '')]
    const price = Number((c[idx('price')] ?? '').replace(/[₪,\s]/g, ''))
    if (!unit) {
      errors.push(`שורה ${i + 2}: יחידה לא מוכרת "${c[idx('unit')]}"`)
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      errors.push(`שורה ${i + 2}: מחיר לא תקין`)
      return
    }
    const verifiedRaw = idx('verified') >= 0 ? (c[idx('verified')] ?? '').toLowerCase() : ''
    items.push({
      code: c[idx('code')],
      description: c[idx('description')],
      unit,
      price,
      category: idx('category') >= 0 ? c[idx('category')] ?? '' : '',
      verified: ['true', '1', 'כן', 'yes', 'מאומת'].includes(verifiedRaw),
      source: idx('source') >= 0 ? c[idx('source')] ?? '' : '',
      date: idx('date') >= 0 ? c[idx('date')] ?? '' : '',
    })
  })
  return { items, errors }
}

// מחירון דוגמה לא מאומת. נטען רק בלחיצה, ומסומן "הונח" בכל מקום.
export const SAMPLE_CSV = `${CSV_HEADER}
S-01,חפירה ופינוי עפר,m3,95,earthwork,false,מחירון דוגמה,2026-10
S-02,מצע סוג א' מהודק,m3,180,subbase,false,מחירון דוגמה,2026-10
S-03,ריצוף אבן משתלבת כולל חול,m2,165,paving,false,מחירון דוגמה,2026-10
S-04,דק עץ איפאה כולל קונסטרוקציה,m2,1150,deck,false,מחירון דוגמה,2026-10
S-05,חצץ דקורטיבי על יריעה,m2,75,gravel,false,מחירון דוגמה,2026-10
S-06,דשא מרבדים,m2,48,lawn,false,מחירון דוגמה,2026-10
S-07,שתילה בערוגה (5 שתילים למ"ר),m2,140,planting,false,מחירון דוגמה,2026-10
S-08,אדמה גננית משופרת,m3,170,soil,false,מחירון דוגמה,2026-10
S-09,מערכת השקיה בטפטוף ומתזים,m2,38,irrigation,false,מחירון דוגמה,2026-10
S-10,גדר עץ בגובה 1.8 מ',m,620,fence,false,מחירון דוגמה,2026-10
S-11,קיר בלוקים מטויח לגינה,m2,520,garden_wall,false,מחירון דוגמה,2026-10
`
