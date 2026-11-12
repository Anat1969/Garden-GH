// ייצוא כתב כמויות ל-CSV מסודר בעברית: ראש עם פרטי הפרויקט, טבלה לפי סעיפים עם סכום לכל סעיף,
// סיכום ללא מע"מ ועם מע"מ, פרטים קיימים בנפרד, ואיך מחושב. נפתח נכון ב-Excel (UTF-8 עם BOM) ומוכן להדפסה.
import type { Project } from './types'
import { UNIT_TEXT, LABEL_TEXT } from './types'
import { CATEGORY_TEXT, DISCLAIMER, VAT, sumRange, type BomLine } from './bom'
import { DEKEL_DATE } from '../data/dekelPrices'

const esc = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const money = (n: number | null) => (n === null ? '' : n.toFixed(2))

export function bomCsv(project: Project, variantName: string, lines: BomLine[]): string {
  const rows: (string | number | null)[][] = []
  const today = new Date().toLocaleDateString('he-IL')
  rows.push(['כתב כמויות והערכת עלות'])
  rows.push(['פרויקט', project.name])
  rows.push(['כתובת', project.address])
  rows.push(['חלופה', variantName])
  rows.push(['תאריך הפקה', today])
  rows.push(['מחירון', `מחירון גינון ופיתוח נוף לפי מקורות ציבוריים, ${DEKEL_DATE}`])
  rows.push(['מחירים', 'בש"ח, ללא מע"מ'])
  rows.push([])

  const header = ['מס\'', 'סעיף', 'אלמנט', 'סעיף מחירון', 'קוד', 'כמות', 'יחידה', 'איך חושבה הכמות', 'מחיר יחידה', 'עלות', 'טווח נמוך', 'טווח גבוה', 'תווית כמות', 'הערה']
  rows.push(header)

  const active = lines.filter((l) => !l.existing)
  const cats = [...new Set(active.map((l) => l.category))]
  let n = 0
  for (const c of cats) {
    const group = active.filter((l) => l.category === c)
    rows.push([`סעיף: ${CATEGORY_TEXT[c]}`])
    for (const l of group) {
      n++
      rows.push([
        n,
        CATEGORY_TEXT[l.category],
        l.elementName,
        l.item?.description ?? 'אין סעיף מתאים',
        l.item?.code ?? '',
        l.unit === 'unit' ? Math.round(l.qty) : l.qty.toFixed(2),
        UNIT_TEXT[l.unit],
        l.how,
        l.item ? money(l.item.price) : '',
        money(l.total),
        money(l.min),
        money(l.max),
        LABEL_TEXT[l.qtyLabel],
        l.warning ?? '',
      ])
    }
    const s = sumRange(group)
    rows.push(['', `סה"כ ${CATEGORY_TEXT[c]}`, '', '', '', '', '', '', '', money(s.total), money(s.min), money(s.max), '', ''])
    rows.push([])
  }

  const t = sumRange(active)
  rows.push(['', 'סה"כ ללא מע"מ', '', '', '', '', '', '', '', money(t.total), money(t.min), money(t.max), '', ''])
  rows.push(['', `מע"מ ${Math.round(VAT * 100)}%`, '', '', '', '', '', '', '', money(t.total * VAT), money(t.min * VAT), money(t.max * VAT), '', ''])
  rows.push(['', 'סה"כ כולל מע"מ', '', '', '', '', '', '', '', money(t.total * (1 + VAT)), money(t.min * (1 + VAT)), money(t.max * (1 + VAT)), '', ''])
  if (t.missing) rows.push(['', `שורות בלי מחיר: ${t.missing}`])
  rows.push([])

  const ex = lines.filter((l) => l.existing)
  if (ex.length) {
    rows.push(['קיים בשטח, לא מתומחר'])
    for (const l of ex) rows.push(['', CATEGORY_TEXT[l.category], l.elementName, '', '', l.qty.toFixed(2), UNIT_TEXT[l.unit], l.how, '', '', '', '', LABEL_TEXT[l.qtyLabel], l.warning ?? ''])
    rows.push([])
  }

  rows.push(['איך מחושב'])
  rows.push(['1', 'כמות לפי הגיאומטריה בתוכנית: שטח, אורך, אורך כפול גובה, או יחידה.'])
  rows.push(['2', 'עבודות נלוות לפי עומק מקובל: ריצוף חפירה 0.30 מ\' ומצע 0.15 מ\'. דשא אדמה 0.10 מ\' ומתזים. ערוגה אדמה 0.30 מ\' וטפטוף.'])
  rows.push(['3', 'עלות = כמות × מחיר יחידה.'])
  rows.push(['4', 'טווח לפי אי ודאות: בכמות מדוד 3%, מוערך 10%, הונח 25%. במחיר סעיף מאומת 5%, לא מאומת 20%.'])
  rows.push([])
  rows.push([DISCLAIMER])
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

export function exportBomCsv(project: Project, variantName: string, lines: BomLine[]) {
  const blob = new Blob([bomCsv(project, variantName, lines)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `כתב-כמויות-${project.name}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
