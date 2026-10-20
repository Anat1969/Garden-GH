import { test, expect, type Page } from '@playwright/test'

// היתר לדוגמה: 1:100, נקודה = 0.03528 מ'. בקנבס של 2576 פיקסל לרוחב 1190 נקודות: 2.1647 פיקסל לנקודה.
const S = 2576 / 1190
const K = 72 / 0.0254 / 100 // נקודות למטר ב-1:100
const P = (mx: number, my: number) => ({ x: (260 + mx * K) * S, y: (160 + my * K) * S })
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
        { title: 'תשריט ק.מ. 1:250', kind: 'site_plan', floor: '', scale_den: 250 },
        { title: 'תכנית קומת קרקע ק.מ. 1:100', kind: 'floor_plan', floor: 'קרקע', scale_den: 100 },
        { title: 'חזית דרומית ק.מ. 1:100', kind: 'elevation', floor: '', scale_den: 100 },
        { title: 'חתך א-א ק.מ. 1:100', kind: 'section', floor: '', scale_den: 100 },
      ]
      return route.fulfill({ json: { result: { drawings: [{ ...kinds[(mapCall - 1) % 4], box: full }] } } })
    }
    if (body.task === 'structure') {
      return route.fulfill({
        json: {
          result: {
            north_angle_deg: 30,
            units: [{ name: 'יחידה מערבית', footprint: [P(0, 0), P(12, 0), P(12, 9), P(0, 9)], wall_thickness_cm: 25, floor_level_rel: 0, floor_level_abs: 699 }],
            openings: [
              { type: 'door', ...seg(P(5, 9), P(6, 9)) },
              { type: 'sliding_door', ...seg(P(12, 5), P(12, 6)) },
              { type: 'window', ...seg(P(3, 0), P(4.5, 0)) },
            ],
            plot: [P(-4, -3), P(16, -3), P(16, 15), P(-4, 15)],
            zones: [
              { kind: 'lawn', label: 'דשא', polygon: [P(-3.5, 10), P(6, 10), P(6, 14.5), P(-3.5, 14.5)], level_abs: 699.25 },
              { kind: 'paving', label: '', polygon: [P(6, 9.5), P(15.5, 9.5), P(15.5, 14.5), P(6, 14.5)], level_abs: 698.85 },
              { kind: 'planting', label: 'גינון', polygon: [P(-3.5, -2.5), P(-0.5, -2.5), P(-0.5, 9), P(-3.5, 9)], level_abs: 0 },
            ],
            levels: [
              { text: '±0.00 699.00', abs: 699, rel: 0, has_rel: true, ...xy(P(2, 2)) },
              { text: '698.85', abs: 698.85, rel: 0, has_rel: false, ...xy(P(10, 12)) },
              { text: '699.25', abs: 699.25, rel: 0, has_rel: false, ...xy(P(1, 12)) },
            ],
            trees: [{ ...xy(P(-2, 4)), r: 2 * K * S, kind: 'tree' }, { ...xy(P(10, 13)), r: 1.5 * K * S, kind: 'palm' }],
            retaining_walls: [{ ...seg(P(-4, -3), P(16, -3)), label: 'קיר תומך' }],
          },
        },
      })
    }
    if (body.task === 'heights') {
      return route.fulfill({
        json: {
          result: {
            levels: [
              { text: '±0.00', rel: 0, abs: 699, has_abs: true, meaning: 'ground_floor' },
              { text: '+3.00', rel: 3, abs: 0, has_abs: false, meaning: 'first_floor' },
              { text: '+5.80', rel: 5.8, abs: 0, has_abs: false, meaning: 'roof_eave' },
              { text: '+8.50', rel: 8.5, abs: 0, has_abs: false, meaning: 'ridge' },
            ],
            roof_type: 'gable',
            roof_pitch_deg: 30,
            storeys_above_ground: 2,
          },
        },
      })
    }
    return route.fulfill({ json: { result: { scale_text: '1:100', sheet_title: '', dimensions: [] } } })
  })
}
const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
const xy = (a: { x: number; y: number }) => ({ x: a.x, y: a.y })

test('קריאה מלאה של היתר: מיפוי, מבנה, גבהים, מודל ומידות בתלת-ממד', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await mock(page)
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/projects')
  await page.getByPlaceholder('למשל: גינת משפחת לוי').fill('קריאת היתר')
  await page.getByRole('button', { name: 'יצירה והמשך להיתר' }).click()
  await page.getByRole('button', { name: 'היתר לדוגמה' }).click()
  await expect(page.getByTestId('permit-reader')).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'קריאה מלאה של ההיתר' }).click()
  await expect(page.getByText('קריאת ההיתר הסתיימה')).toBeVisible({ timeout: 30000 })
  expect(tasks.filter((t) => t === 'map')).toHaveLength(4)
  expect(tasks).toContain('structure')
  expect(tasks.filter((t) => t === 'heights')).toHaveLength(2)
  await expect(page.getByTestId('drawing-card')).toHaveCount(4)
  await expect(page.getByTestId('reader-log')).toContainText('שרטוט העבודה: תכנית קומת קרקע')
  await expect(page.getByTestId('reader-log')).toContainText('נבנו')
  await expect(page.getByTestId('building-card')).toContainText('699.00')
  await expect(page.getByText(/צפון ב-\s*30 מעלות/)).toBeVisible()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'shots/13-reader.png', fullPage: true })

  // תוכנית: אלמנטים מהקריאה, מצולעים
  await page.getByRole('link', { name: 'תוכנית ועריכה' }).click()
  await expect(page.locator('.el-item').filter({ hasText: 'דשא' })).toHaveCount(1)
  await expect(page.locator('.el-item').filter({ hasText: 'קיר בית' })).toHaveCount(4)
  await expect(page.locator('.el-item').filter({ hasText: 'גדר גבול מגרש' })).toHaveCount(4)
  await page.locator('.el-item').filter({ hasText: 'דשא' }).click()
  await expect(page.getByTestId('element-editor')).toContainText('מצולע מההיתר')
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'shots/14-plan-structure.png' })

  // מודל עם קומה עליונה, גג, עצים ותוויות
  await page.getByRole('link', { name: 'מודל תלת-ממדי' }).click()
  await expect(page.getByTestId('model-canvas').locator('canvas')).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'shots/15-model-building.png' })
  await page.getByRole('button', { name: 'הצגת מידות' }).click()
  await page.getByRole('button', { name: 'הצגת מידות' }).click()

  // כתב כמויות: שטח המצולע
  await page.getByRole('link', { name: 'כתב כמויות' }).click()
  await expect(page.getByText('דשא 1').first()).toBeVisible()
  expect(errors).toEqual([])
})
