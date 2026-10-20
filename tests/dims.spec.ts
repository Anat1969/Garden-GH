import { test, expect, type Page } from '@playwright/test'

const aiCalls: string[] = []

async function mock(page: Page) {
  aiCalls.length = 0
  await page.route(/supabase\.co/, async (route) => {
    const url = route.request().url()
    if (url.includes('/functions/v1/garden-read-plan')) {
      const body = JSON.parse(route.request().postData() || '{}')
      aiCalls.push(`${body.width}x${body.height}`)
      // 1:100 בסריקה של 150dpi: מטר אחד = 59.06 פיקסל
      const px = 59.055
      const x0 = 537
      const y0 = 292
      const L = (cm: number, x: number, y: number, len: number, o: 'horizontal' | 'vertical') => ({
        text: String(cm),
        value: cm,
        unit: 'cm',
        kind: 'length',
        relative: false,
        orientation: o,
        text_box: { x0: x - 15, y0: y - 18, x1: x + 15, y1: y - 4 },
        has_line: true,
        line: o === 'horizontal' ? { x1: x - len / 2, y1: y, x2: x + len / 2, y2: y } : { x1: x, y1: y - len / 2, x2: x, y2: y + len / 2 },
        confidence: 'high',
      })
      return route.fulfill({
        json: {
          result: {
            scale_text: '1:100',
            sheet_title: 'GROUND FLOOR PLAN',
            dimensions: [
              L(1200, x0 + 6 * px, y0 - 60, 12 * px, 'horizontal'),
              L(300, x0 + 1.5 * px, y0, 3 * px, 'horizontal'),
              L(350, x0 + 6.25 * px, y0, 3.5 * px, 'horizontal'),
              L(900, x0 - 100, y0 + 4.5 * px, 9 * px, 'vertical'),
              { ...L(480, x0 - 50, y0 + 6.6 * px, 4.8 * px, 'vertical'), confidence: 'medium' },
              L(777, x0 + 3 * px, y0 + 12 * px, 5 * px, 'horizontal'),
              {
                text: '±0.00', value: 0, unit: 'm', kind: 'level', relative: true, orientation: 'other',
                text_box: { x0: 650, y0: 440, x1: 700, y1: 458 }, has_line: false, line: { x1: 0, y1: 0, x2: 0, y2: 0 }, confidence: 'high',
              },
            ],
          },
        },
      })
    }
    if (url.includes('/auth/v1/settings')) return route.fulfill({ json: { external: { google: false } } })
    return route.fulfill({ json: [] })
  })
}

test('PDF וקטורי: מידות משכבת הטקסט, קנה מידה, והחלה על קיר', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await mock(page)
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/projects')
  await page.getByPlaceholder('למשל: גינת משפחת לוי').fill('מידות וקטורי')
  await page.getByRole('button', { name: 'יצירה והמשך להיתר' }).click()
  await page.getByRole('button', { name: 'היתר לדוגמה' }).click()
  await expect(page.getByText(/נטענו 4 עמודים ונקראו \d+ מידות/)).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/מתאימות לאורך קווי המידה, קנה מידה 1:100\.0\. תואם לקנה המידה הפעיל/)).toBeVisible()
  await page.getByRole('link', { name: 'מידות מההיתר' }).click()
  await expect(page).toHaveURL(/\/dims/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText(/אורכים \(15\)/)).toBeVisible()
  await expect(page.getByText(/מפלסים \(4\)/)).toBeVisible()
  await expect(page.getByText(/15 מתוך 15 מידות אורך מסכימות/)).toBeVisible()
  await expect(page.getByText('תואם לקנה המידה הפעיל.')).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'shots/10-dims-vector.png' })
  await page.locator('.el-item').filter({ hasText: '(350)' }).first().click()
  await expect(page.getByTestId('dim-editor')).toContainText('3.50')
  await page.getByRole('button', { name: 'התמקדות' }).click()
  await page.getByRole('button', { name: 'דחייה' }).click()
  await expect(page.getByTestId('dim-editor')).toContainText('החזרה לבדיקה')
  await page.getByRole('button', { name: 'החזרה לבדיקה' }).click()
  for (const f of ['לבדיקה', 'מאושרות', 'הכול']) await page.getByRole('button', { name: f, exact: true }).click()

  // זיהוי קירות ואז התאמה למידה
  await page.getByRole('link', { name: 'היתר', exact: true }).click()
  await page.getByRole('button', { name: 'זיהוי אוטומטי' }).click()
  await page.getByRole('button', { name: 'לבדיקה ותיקון' }).click()
  await page.locator('.el-item').first().click()
  await expect(page.getByTestId('dim-match')).toBeVisible()
  await page.getByTestId('dim-match').getByRole('button').first().click()
  await expect(page.getByTestId('element-editor')).toContainText('מידה')
  await expect(page.getByTestId('element-editor')).toContainText('מדוד מהיתר')
  // כיול לפי מידה כתובה
  await page.getByRole('button', { name: 'כיול', exact: true }).click()
  await expect(page.getByText('או כיול לפי מידה כתובה בהיתר')).toBeVisible()
  await page.screenshot({ path: 'shots/11-plan-dim-match.png' })
  expect(errors).toEqual([])
})

test('סריקה: קריאה חכמה (מדומה), אישור וקביעת קנה מידה מהמידות', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await mock(page)
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/projects')
  await page.getByPlaceholder('למשל: גינת משפחת לוי').fill('סריקה')
  await page.getByRole('button', { name: 'יצירה והמשך להיתר' }).click()
  await page.getByRole('button', { name: 'סריקה לדוגמה' }).click()
  await expect(page.getByText('1 עמודים · סרוק')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/בסריקה קנה המידה נקבע מהמידות/)).toBeVisible()
  await page.getByRole('link', { name: 'מידות', exact: true }).click()
  await expect(page.getByText('לא נקראו מידות בעמוד', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'קריאה חכמה' }).click()
  await expect(page.getByText(/נקראו 7 מידות/)).toBeVisible({ timeout: 20000 })
  expect(aiCalls).toEqual(['2480x1755'])
  await expect(page.getByText(/5 מתוך 6 מידות אורך מסכימות/)).toBeVisible()
  await page.locator('.el-item').filter({ hasText: '(777)' }).click()
  await expect(page.getByTestId('dim-editor')).toContainText('קו מידה לא תואם')
  await page.getByRole('button', { name: 'דחייה' }).click()
  await page.getByRole('button', { name: 'אישור המידות בביטחון גבוה' }).click()
  await page.getByRole('button', { name: 'שימוש כקנה מידה של התוכנית' }).click()
  await expect(page.getByText('קנה המידה נקבע מהמידות')).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'shots/12-dims-scan.png' })
  // קריאה מפורטת: אריחים
  await page.getByRole('button', { name: 'קריאה מפורטת (אריחים)' }).click()
  await expect.poll(() => aiCalls.length).toBeGreaterThan(2)
  await expect(page.getByText(/נקראו \d+ מידות/).first()).toBeVisible({ timeout: 20000 })
  await page.getByRole('link', { name: 'סקירה' }).click()
  await expect(page.getByText('מהמידות')).toBeVisible()
  await page.getByRole('link', { name: 'תוכנית ועריכה' }).click()
  await page.getByRole('tab', { name: 'מבנה הבית' }).click()
  await expect(page.getByRole('button', { name: 'קיר בית', exact: true })).toBeEnabled()
  expect(errors).toEqual([])
})

test('מובייל: מסך המידות בלי גלילה אופקית', async ({ page }) => {
  await mock(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'פרויקט חדש' }).first().click()
  await page.getByRole('button', { name: 'היתר לדוגמה' }).click()
  await expect(page.getByText('4 עמודים · וקטורי')).toBeVisible({ timeout: 30000 })
  await page.getByRole('link', { name: 'מידות', exact: true }).click()
  await page.waitForTimeout(800)
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'shots/m-dims.png', fullPage: true })
})
