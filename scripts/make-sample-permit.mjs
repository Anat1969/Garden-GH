// יוצר היתר לדוגמה וקטורי (public/sample-permit.pdf) לבדיקות ולהדגמה.
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import { writeFileSync } from 'node:fs'

const W = 1190, H = 842 // A3 לרוחב
const doc = await PDFDocument.create()
const font = await doc.embedFont(StandardFonts.Helvetica)
const ink = rgb(0.12, 0.13, 0.13)

function sheet(title, scaleDen) {
  const page = doc.addPage([W, H])
  page.drawRectangle({ x: 20, y: 20, width: W - 40, height: H - 40, borderColor: ink, borderWidth: 1 })
  page.drawRectangle({ x: W - 300, y: 20, width: 280, height: 90, borderColor: ink, borderWidth: 1 })
  page.drawText(title, { x: W - 290, y: 80, size: 16, font, color: ink })
  page.drawText(`SCALE 1:${scaleDen}`, { x: W - 290, y: 55, size: 12, font, color: ink })
  page.drawText('SAMPLE PERMIT - GARDEN-GH', { x: W - 290, y: 32, size: 9, font, color: ink })
  return { page, k: 72 / 0.0254 / scaleDen }
}

// עמוד 1: תשריט מגרש 1:250
{
  const { page, k } = sheet('SITE PLAN', 250)
  const ox = 200, oy = 150
  const P = (x, y) => ({ x: ox + x * k, y: H - (oy + y * k) })
  const lot = [P(0, 0), P(24, 0), P(24, 30), P(0, 30)]
  for (let i = 0; i < 4; i++) {
    const a = lot[i], b = lot[(i + 1) % 4]
    page.drawLine({ start: a, end: b, thickness: 1, color: ink, dashArray: [8, 4] })
  }
  const h = P(6, 8)
  page.drawRectangle({ x: h.x, y: h.y - 9 * k, width: 12 * k, height: 9 * k, borderColor: ink, borderWidth: 1.5 })
  page.drawText('LOT 24 x 30', { x: P(1, 28).x, y: P(1, 28).y, size: 10, font, color: ink })
}

// עמוד 2: תוכנית קומת קרקע 1:100
{
  const { page, k } = sheet('GROUND FLOOR PLAN', 100)
  const ox = 260, oy = 160
  const R = (x, y, w, d) => page.drawRectangle({ x: ox + x * k, y: H - (oy + (y + d) * k), width: w * k, height: d * k, borderColor: ink, borderWidth: 0.8 })
  const arc = (cx, cy, r, quarter) => {
    // קשת דלת (רבע עיגול) כעקומת בזייה
    const c = 0.5523 * r
    const [sx, sy] = quarter
    const pts = [[cx + sx * r, cy], [cx + sx * r, cy + sy * c], [cx + sx * c, cy + sy * r], [cx, cy + sy * r]]
    const T = ([x, y]) => `${(ox + x * k).toFixed(2)} ${(oy + y * k).toFixed(2)}`
    page.drawSvgPath(`M ${T(pts[0])} C ${T(pts[1])} ${T(pts[2])} ${T(pts[3])}`, { x: 0, y: H, borderColor: ink, borderWidth: 0.4 })
  }
  const t = 0.25, ti = 0.15
  // קיר עליון עם שני חלונות
  R(0, 0, 3, t); R(4.5, 0, 3.5, t); R(9.5, 0, 2.5, t)
  // קיר תחתון: דלת כניסה וחלון
  R(0, 9 - t, 5, t); R(6, 9 - t, 3, t); R(10.5, 9 - t, 1.5, t)
  arc(5, 9 - t, 1, [1, -1])
  // קיר שמאלי עם חלון
  R(0, 0, t, 3); R(0, 4.2, t, 4.8)
  // קיר ימני עם דלת לגינה
  R(12 - t, 0, t, 5); R(12 - t, 6, t, 3)
  arc(12 - t, 5, 1, [-1, 1])
  // קירות פנים
  R(6, t, ti, 1.75); R(6, 2.9, ti, 5.85)
  arc(6 + ti, 2, 0.9, [1, 1])
  R(t, 4.5, 1.75, ti); R(2.9, 4.5, 3.1, ti)
  arc(2, 4.5 + ti, 0.9, [1, 1])
  page.drawText('LIVING', { x: ox + 8 * k, y: H - (oy + 4 * k), size: 10, font, color: ink })

  // שרשראות מידות בס"מ, עם קווי עזר ושנתות אלכסוניות כמו בהיתר
  const PX = (x) => ox + x * k
  const PY = (y) => H - (oy + y * k)
  const tick = (x, y) => page.drawLine({ start: { x: PX(x) - 3, y: PY(y) - 3 }, end: { x: PX(x) + 3, y: PY(y) + 3 }, thickness: 0.8, color: ink })
  const chainH = (y, xs) => {
    page.drawLine({ start: { x: PX(xs[0]), y: PY(y) }, end: { x: PX(xs[xs.length - 1]), y: PY(y) }, thickness: 0.3, color: ink })
    xs.forEach((x) => tick(x, y))
    for (let i = 0; i < xs.length - 1; i++) {
      const t = String(Math.round((xs[i + 1] - xs[i]) * 100))
      const w = font.widthOfTextAtSize(t, 7)
      page.drawText(t, { x: (PX(xs[i]) + PX(xs[i + 1])) / 2 - w / 2, y: PY(y) + 2, size: 7, font, color: ink })
    }
  }
  const chainV = (x, ys) => {
    page.drawLine({ start: { x: PX(x), y: PY(ys[0]) }, end: { x: PX(x), y: PY(ys[ys.length - 1]) }, thickness: 0.3, color: ink })
    ys.forEach((y) => tick(x, y))
    for (let i = 0; i < ys.length - 1; i++) {
      const t = String(Math.round((ys[i + 1] - ys[i]) * 100))
      const w = font.widthOfTextAtSize(t, 7)
      page.drawText(t, { x: PX(x) - 2, y: (PY(ys[i]) + PY(ys[i + 1])) / 2 - w / 2, size: 7, font, color: ink, rotate: degrees(90) })
    }
  }
  chainH(-0.8, [0, 3, 4.5, 8, 9.5, 12])
  chainH(-1.6, [0, 12])
  chainH(9.8, [0, 5, 6, 9, 10.5, 12])
  chainV(-0.8, [0, 3, 4.2, 9])
  chainV(-1.6, [0, 9])
  // מפלסים
  page.drawText('\u00b10.00', { x: PX(2), y: PY(2), size: 8, font, color: ink })
  page.drawText('699.00', { x: PX(2), y: PY(2.4), size: 8, font, color: ink })
  page.drawText('-0.45', { x: PX(13.2), y: PY(5.5), size: 8, font, color: ink })
  page.drawText('698.55', { x: PX(13.2), y: PY(5.9), size: 8, font, color: ink })
}

// עמוד 3: חזית 1:100
{
  const { page, k } = sheet('SOUTH ELEVATION', 100)
  const ox = 260, base = 600
  page.drawRectangle({ x: ox, y: H - base, width: 12 * k, height: 3.2 * k, borderColor: ink, borderWidth: 1 })
  page.drawLine({ start: { x: ox - 40, y: H - base }, end: { x: ox + 12 * k + 40, y: H - base }, thickness: 1.5, color: ink })
}

// עמוד 4: חתך 1:100
{
  const { page, k } = sheet('SECTION A-A', 100)
  const ox = 260, base = 600
  page.drawRectangle({ x: ox, y: H - base, width: 9 * k, height: 3.2 * k, borderColor: ink, borderWidth: 1 })
  page.drawLine({ start: { x: ox - 40, y: H - base - 0.45 * k }, end: { x: ox, y: H - base - 0.45 * k }, thickness: 1, color: ink })
}

writeFileSync(new URL('../public/sample-permit.pdf', import.meta.url), await doc.save())
console.log('sample-permit.pdf written')
