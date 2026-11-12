import { test, expect, type Page } from '@playwright/test'

// היתר סרוק בלי קנה מידה: המידות נקראות בלי קווי מידה, והבית נבנה מהתאמת המידות לצלעות קו המתאר
async function mock(page: Page) {
  await page.route(/supabase\.co/, async (route) => {
    const url = route.request().url()
    if (!url.includes('/functions/v1/garden-read-plan')) return route.fulfill({ json: url.includes('settings') ? { external: {} } : [] })
    const body = JSON.parse(route.request().postData() || '{}')
    const W = body.width
    const H = body.height
    // בית 12×9 מ' בקנה מידה לא ידוע: 0.04 מרוחב התמונה לכל מטר
    const k = W * 0.04
    const P = (mx: number, my: number) => ({ x: W * 0.2 + mx * k, y: H * 0.2 + my * k })
    if (body.task === 'map') return route.fulfill({ json: { result: { drawings: [{ title: 'תכנית קומת קרקע', kind: 'floor_plan', floor: 'קרקע', scale_den: 100, box: { x0: 0, y0: 0, x1: W, y1: H } }] } } })
    if (body.task === 'structure')
      return route.fulfill({
        json: {
          result: {
            north_angle_deg: 0,
            units: [{ name: 'הבית', footprint: [P(0, 0), P(12, 0), P(12, 9), P(0, 9)], wall_thickness_cm: 25, floor_level_rel: 0, floor_level_abs: 0 }],
            openings: [{ type: 'door', x1: P(5, 9).x, y1: P(5, 9).y, x2: P(6, 9).x, y2: P(6, 9).y }],
            plot: [P(-3, -3), P(15, -3), P(15, 13), P(-3, 13)],
            zones: [{ kind: 'lawn', label: 'דשא', polygon: [P(-2.5, 9.5), P(14.5, 9.5), P(14.5, 12.5), P(-2.5, 12.5)], level_abs: 0 }],
            levels: [],
            trees: [],
            retaining_walls: [],
          },
        },
      })
    if (body.task === 'heights') return route.fulfill({ json: { result: { levels: [], roof_type: 'flat', roof_pitch_deg: 0, storeys_above_ground: 1 } } })
    const dim = (v: number, x: number, y: number) => ({ text: v.toFixed(2), value: v, unit: 'm', kind: 'length', relative: false, orientation: 'horizontal', text_box: { x0: x, y0: y, x1: x + 40, y1: y + 14 }, has_line: false, line: { x1: 0, y1: 0, x2: 0, y2: 0 }, confidence: 'high' })
    return route.fulfill({ json: { result: { scale_text: '', dimensions: [dim(12, W * 0.4, H * 0.1), dim(9, W * 0.1, H * 0.4), dim(12, W * 0.4, H * 0.7)] } } })
  })
}

test('היתר סרוק בלי קנה מידה: קריאה מלאה בונה את הבית בתלת-ממד', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await mock(page)
  await page.setViewportSize({ width: 1366, height: 1000 })
  await page.goto('/projects')
  await page.getByPlaceholder('למשל: גינת משפחת לוי').fill('הבית של בתיה')
  await page.getByPlaceholder('רחוב, מספר, עיר').fill('הזית 3, מודיעין')
  await page.getByRole('button', { name: 'יצירה והמשך להיתר' }).click()
  await page.getByRole('button', { name: 'סריקה לדוגמה' }).click()
  await expect(page.getByText('1 עמודים · סרוק')).toBeVisible({ timeout: 30000 })

  // לפני הקריאה: במודל יש כפתור בנייה שמסביר מה חסר
  await page.getByRole('link', { name: 'מודל תלת-ממדי' }).click()
  await page.getByTestId('build-house-btn').click()
  await expect(page.getByTestId('build-house-result')).toContainText('עוד לא נקרא המבנה')

  // קריאה מלאה: קנה מידה מהמידות, ובניית הבית
  await page.getByRole('link', { name: 'היתר', exact: true }).click()
  await page.getByRole('button', { name: 'קריאה מלאה של ההיתר' }).click()
  await expect(page.getByTestId('reader-result')).toContainText('קנה המידה הוערך', { timeout: 30000 })
  await expect(page.getByTestId('reader-result')).toContainText('קירות')
  await page.screenshot({ path: 'shots/60-house-result.png' })
  await page.getByRole('dialog').getByRole('link', { name: 'למודל התלת-ממדי' }).click()
  await expect(page.getByTestId('model-canvas').locator('canvas')).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('build-house')).toHaveCount(0)
  await expect(page.locator('.el-item').filter({ hasText: 'קיר בית' })).toHaveCount(4)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'shots/61-house-model.png' })
  expect(errors).toEqual([])
})
