import { test, expect, type Page } from '@playwright/test'

// כל קומה מהתוכנית שלה: תוכנית קומה א' נקראת בנפרד, מוצבת מעל הקרקע, ונבנית במודל עם הפתחים שלה.

const S = 2576 / 1190
const K = 72 / 0.0254 / 100
const P = (mx: number, my: number) => ({ x: (260 + mx * K) * S, y: (160 + my * K) * S })
// תוכנית הקומה משורטטת במקום אחר בגיליון: היסט של 3 מ' ו-1 מ'
const Q = (mx: number, my: number) => P(mx + 3, my + 1)
const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
const tasks: string[] = []

async function mock(page: Page) {
  tasks.length = 0
  let mapCall = 0
  await page.route(/supabase\.co/, async (route) => {
    const url = route.request().url()
    if (!url.includes('/functions/v1/garden-read-plan')) return route.fulfill({ json: url.includes('settings') ? { external: {} } : [] })
    const body = JSON.parse(route.request().postData() || '{}')
    tasks.push(body.task ?? 'dims')
    const W = body.width
    const H = body.height
    const full = { x0: W * 0.03, y0: H * 0.03, x1: W * 0.97, y1: H * 0.97 }
    if (body.task === 'map') {
      mapCall++
      const kinds = [
        { title: 'תכנית קומה א ק.מ. 1:100', kind: 'floor_plan', floor: 'א', scale_den: 100 },
        { title: 'תכנית קומת קרקע ק.מ. 1:100', kind: 'floor_plan', floor: 'קרקע', scale_den: 100 },
        { title: 'חזית דרומית ק.מ. 1:100', kind: 'elevation', floor: '', scale_den: 100 },
        { title: 'חתך א-א ק.מ. 1:100', kind: 'section', floor: '', scale_den: 100 },
      ]
      // בעמוד החזית יש גם תוכנית מרתף, ובעמוד החתך גם תוכנית גג: כל אחת בחצי העמוד שלה
      const left = { x0: W * 0.03, y0: H * 0.03, x1: W * 0.49, y1: H * 0.97 }
      const right = { x0: W * 0.51, y0: H * 0.03, x1: W * 0.97, y1: H * 0.97 }
      const i = (mapCall - 1) % 4
      if (i === 2) return route.fulfill({ json: { result: { drawings: [{ ...kinds[2], box: left }, { title: 'תכנית מרתף ק.מ. 1:100', kind: 'basement_plan', floor: 'מרתף', scale_den: 100, box: right }] } } })
      if (i === 3) return route.fulfill({ json: { result: { drawings: [{ ...kinds[3], box: left }, { title: 'תכנית גג ק.מ. 1:100', kind: 'roof_plan', floor: 'גג', scale_den: 100, box: right }] } } })
      return route.fulfill({ json: { result: { drawings: [{ ...kinds[i], box: full }] } } })
    }
    if (body.task === 'structure') {
      const upper = String(body.hint || '').includes('קומה א')
      const empty = { plot: [], zones: [], levels: [], trees: [], retaining_walls: [] }
      // מרתף וגג: מלבן בתוך השרטוט שלהם
      if (/מרתף|גג/.test(String(body.hint || ''))) {
        const R = (fx: number, fy: number) => ({ x: W * fx, y: H * fy })
        return route.fulfill({ json: { result: { north_angle_deg: 0, units: [{ name: 'מפלס', footprint: [R(0.2, 0.2), R(0.8, 0.2), R(0.8, 0.5), R(0.2, 0.5)], wall_thickness_cm: 25, floor_level_rel: 0, floor_level_abs: 0 }], openings: [], ...empty } } })
      }
      if (upper)
        // קומה א': צורת ר' של 12×9 שחסרה בה הפינה הדרום-מזרחית (מרפסת גג), עם שלושה חלונות ודלת למרפסת
        return route.fulfill({
          json: {
            result: {
              north_angle_deg: 0,
              units: [{ name: 'קומה א', footprint: [Q(0, 0), Q(12, 0), Q(12, 5), Q(7, 5), Q(7, 9), Q(0, 9)], wall_thickness_cm: 25, floor_level_rel: 3, floor_level_abs: 0 }],
              openings: [
                { type: 'window', ...seg(Q(1, 9), Q(2.5, 9)) },
                { type: 'window', ...seg(Q(4, 9), Q(5.5, 9)) },
                { type: 'window', ...seg(Q(0, 2), Q(0, 3.5)) },
                { type: 'sliding_door', ...seg(Q(8, 5), Q(10.5, 5)) },
              ],
              ...empty,
            },
          },
        })
      return route.fulfill({
        json: {
          result: {
            north_angle_deg: 0,
            units: [{ name: 'הבית', footprint: [P(0, 0), P(12, 0), P(12, 9), P(0, 9)], wall_thickness_cm: 25, floor_level_rel: 0, floor_level_abs: 699 }],
            openings: [{ type: 'door', ...seg(P(5, 9), P(6, 9)) }],
            ...empty,
            plot: [P(-4, -3), P(16, -3), P(16, 15), P(-4, 15)],
            zones: [{ kind: 'lawn', label: 'דשא', polygon: [P(-3.5, 10), P(15.5, 10), P(15.5, 14.5), P(-3.5, 14.5)], level_abs: 699 }],
          },
        },
      })
    }
    if (body.task === 'heights')
      return route.fulfill({
        json: {
          result: {
            levels: [
              { text: '±0.00', rel: 0, abs: 699, has_abs: true, meaning: 'ground_floor' },
              { text: '+3.00', rel: 3, abs: 0, has_abs: false, meaning: 'first_floor' },
              { text: '+6.00', rel: 6, abs: 0, has_abs: false, meaning: 'flat_roof' },
            ],
            roof_type: 'flat',
            roof_pitch_deg: 0,
            storeys_above_ground: 2,
          },
        },
      })
    return route.fulfill({ json: { result: { scale_text: '1:100', sheet_title: '', dimensions: [] } } })
  })
}

test('קומה א נבנית מהתוכנית שלה, מוצבת מעל הקרקע ומופיעה במודל', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await mock(page)
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/projects')
  await page.getByPlaceholder('למשל: גינת משפחת לוי').fill('בית עם קומה א')
  await page.getByPlaceholder('רחוב, מספר, עיר').fill('הקומות 2, רחובות')
  await page.getByRole('button', { name: 'יצירה והמשך להיתר' }).click()
  await page.getByRole('button', { name: 'היתר לדוגמה' }).click()
  await expect(page.getByTestId('permit-reader')).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId('floors-panel')).toContainText('עוד לא נקראו מפלסים')
  await page.getByRole('button', { name: 'קריאה מלאה של ההיתר' }).click()
  await expect(page.getByText('קריאת ההיתר הסתיימה').first()).toBeVisible({ timeout: 30000 })
  // ארבע קריאות מבנה: קרקע, מרתף, קומה א וגג
  expect(tasks.filter((t) => t === 'structure')).toHaveLength(4)
  await expect(page.getByTestId('reader-result')).toContainText('3 מפלסים נבנו')
  await page.getByRole('dialog').getByRole('button', { name: 'סגירה' }).click()

  await expect(page.getByTestId('floor-card')).toHaveCount(3)
  await expect(page.getByTestId('floor-kind').nth(0)).toHaveValue('basement')
  await expect(page.getByTestId('floor-kind').nth(2)).toHaveValue('roof')
  const card = page.getByTestId('floor-card').filter({ hasText: 'תכנית קומה א' })
  await expect(card).toContainText('תכנית קומה א')
  await expect(card).toContainText('4')
  // שטח צורת הר': 12×9 פחות 5×4 = 88 מ"ר. השרטוט נחתך ב-94% מהעמוד, ולכן 88 × 0.94² = 77.76
  await expect(card).toContainText('77.76')
  // ההצבה: הקומה שורטטה בהיסט, והוחזרה אל מעל הבית
  const f = await page.evaluate(() => {
    const ps = JSON.parse(Object.values(localStorage).find((v) => v.includes('"floors"')) || '[]')
    const p = ps.find((x: { floors?: unknown[] }) => x.floors?.length)
    const s = p.permit.structure
    const m = p.permit.scale.metersPerPt
    const gx = Math.min(...s.units[0].footprint.map((v: { x: number }) => v.x * m))
    const fl = p.floors.find((x: { title: string }) => x.title.includes('קומה א'))
    const fx = Math.min(...fl.footprints[0].map((v: { x: number }) => v.x))
    return { d: Math.abs(gx - fx), how: fl.how as string }
  })
  expect(f.d).toBeLessThan(0.06)
  expect(f.how).toContain('100%')
  // כיול מחדש: סיבוב מקלקל את ההצבה, גרירה מזיזה, והצבה אוטומטית מחזירה
  const how = card.locator('.muted').last()
  await card.getByTestId('floor-rotate').click()
  await expect(how).toContainText('סובבה ידנית')
  for (let i = 0; i < 3; i++) await card.getByTestId('floor-rotate').click()
  const svg = card.getByTestId('floor-svg')
  const bb = (await svg.boundingBox())!
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await page.mouse.down()
  await page.mouse.move(bb.x + bb.width / 2 + 40, bb.y + bb.height / 2 + 10, { steps: 4 })
  await page.mouse.up()
  await expect(how).toContainText('הוזזה ידנית')
  await card.getByTestId('floor-realign').click()
  await expect(how).toContainText('הוצבה מחדש אוטומטית (100%')
  await card.getByTestId('floor-height').fill('3.2')
  await page.getByTestId('floors-panel').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'shots/43-floors-panel.png' })

  await page.getByRole('link', { name: 'מודל תלת-ממדי' }).click()
  await expect(page.getByTestId('model-canvas').locator('canvas')).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('floors-note')).toContainText('מתוכנית הקומה')
  await page.waitForTimeout(3000)
  await page.getByTestId('model-canvas').screenshot({ path: 'shots/44-floors-model.png' })
  // בלי החזיתות רואים את החיפוי: קירות עם פתחים, מעקה גג
  await expect(page.getByTestId('cladding')).toHaveValue('plaster')
  await page.getByTestId('facades-toggle').click()
  await page.waitForTimeout(900)
  await page.getByTestId('model-canvas').screenshot({ path: 'shots/45-floors-model-plain.png' })
  await page.getByTestId('cladding').selectOption('stone')
  await page.waitForTimeout(900)
  await page.getByTestId('model-canvas').screenshot({ path: 'shots/48-clad-stone.png' })
  // חתך במודל: רואים את המרתף ואת פנים הקומות
  await page.getByTestId('section-toggle').click()
  await expect(page.getByTestId('section-at')).toBeVisible()
  await page.waitForTimeout(900)
  await page.getByTestId('model-canvas').screenshot({ path: 'shots/49-section.png' })
  await page.getByTestId('section-toggle').click()
  await page.getByTestId('cladding').selectOption('none')
  await page.waitForTimeout(600)

  await page.setViewportSize({ width: 390, height: 800 })
  await page.getByRole('link', { name: 'היתר' }).first().click()
  await expect(page.getByTestId('floors-panel')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  expect(errors).toEqual([])
})
