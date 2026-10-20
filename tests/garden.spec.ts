import { test, expect, type Page } from '@playwright/test'

async function at(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId('plan-canvas').boundingBox())!
  return { x: box.x + box.width * fx, y: box.y + box.height * fy }
}
async function click(page: Page, fx: number, fy: number) {
  const p = await at(page, fx, fy)
  await page.mouse.click(p.x, p.y)
}
async function drag(page: Page, pts: [number, number][]) {
  const first = await at(page, ...pts[0])
  await page.mouse.move(first.x, first.y)
  await page.mouse.down()
  for (const q of pts.slice(1)) {
    const p = await at(page, ...q)
    await page.mouse.move(p.x, p.y, { steps: 6 })
  }
  await page.mouse.up()
}

test('ספריית הגינה: פריטים, משטח מצולע וחופשי, קו חופשי, אלמנט קווי, חומרים וצבע, מודל', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.setViewportSize({ width: 1366, height: 1500 })
  await page.goto('/projects')
  const card = page.locator('.grid-cards .card').filter({ hasText: 'הבית של שני' })
  await card.getByRole('link', { name: 'פתיחה' }).click()
  await page.getByRole('link', { name: 'תוכנית ועריכה' }).click()
  await expect(page.getByTestId('garden-palette')).toBeVisible()
  const count = () => page.locator('.el-item').count()
  const n0 = await count()

  // כל הקבוצות נפתחות
  for (const g of ['משטחים', 'צמחייה', 'מבנים ופרטים', 'מים ותאורה', 'קווים', 'מבנה הבית', 'שרטוט']) {
    await page.getByRole('tab', { name: g }).click()
    await expect(page.getByRole('tab', { name: g })).toHaveAttribute('aria-selected', 'true')
  }

  // פריטים נקודתיים
  await page.getByRole('tab', { name: 'צמחייה' }).click()
  await page.getByRole('button', { name: 'עץ', exact: true }).click()
  await click(page, 0.2, 0.75)
  await expect(page.getByTestId('element-editor')).toContainText('פריט')
  await page.getByRole('button', { name: 'דקל', exact: true }).click()
  await click(page, 0.3, 0.85)
  await page.getByRole('tab', { name: 'מבנים ופרטים' }).click()
  await page.getByRole('button', { name: 'פרגולה', exact: true }).click()
  await click(page, 0.5, 0.8)
  await page.getByRole('button', { name: 'ספסל', exact: true }).click()
  await click(page, 0.62, 0.9)
  await page.getByRole('tab', { name: 'מים ותאורה' }).click()
  await page.getByRole('button', { name: 'פנס גינה', exact: true }).click()
  await click(page, 0.4, 0.9)
  await expect(page.getByTestId('element-editor')).toContainText('דורש חשמלאי מוסמך')
  // שינוי צבע בעורך
  await page.getByLabel('צבע האלמנט').fill('#d04a3a')
  expect(await count()).toBe(n0 + 5)

  // משטח מצולע עם דק עץ וצבע
  await page.getByRole('tab', { name: 'משטחים' }).click()
  await page.getByRole('button', { name: 'משטח מצולע', exact: true }).click()
  await page.getByRole('button', { name: 'דק עץ', exact: true }).click()
  await page.getByLabel('צבע המשטח').fill('#a0703c')
  await click(page, 0.7, 0.7)
  await click(page, 0.85, 0.7)
  await click(page, 0.88, 0.85)
  await click(page, 0.72, 0.9)
  await page.getByRole('button', { name: 'סיום', exact: true }).click()
  await expect(page.getByTestId('element-editor')).toContainText('דק עץ')
  expect(await count()).toBe(n0 + 6)

  // משטח חופשי בציור
  await page.getByRole('button', { name: 'משטח חופשי', exact: true }).click()
  await page.getByRole('button', { name: 'חלוקי נחל', exact: true }).click()
  await drag(page, [[0.1, 0.6], [0.18, 0.55], [0.25, 0.62], [0.22, 0.72], [0.12, 0.7]])
  expect(await count()).toBe(n0 + 7)

  // קו חופשי לסקיצה
  await page.getByRole('tab', { name: 'שרטוט' }).click()
  await page.getByRole('button', { name: 'קו חופשי', exact: true }).click()
  await page.getByRole('button', { name: 'עבה', exact: true }).click()
  await drag(page, [[0.3, 0.6], [0.4, 0.65], [0.5, 0.6], [0.6, 0.66]])
  expect(await count()).toBe(n0 + 8)

  // אלמנט קווי: גדר חיה ושביל
  await page.getByRole('tab', { name: 'קווים' }).click()
  await page.getByRole('button', { name: 'גדר חיה', exact: true }).click()
  await click(page, 0.1, 0.95)
  await click(page, 0.5, 0.96)
  await click(page, 0.9, 0.95)
  await page.getByRole('button', { name: 'סיום', exact: true }).click()
  await expect(page.getByTestId('element-editor')).toContainText('אורך')
  await page.getByRole('button', { name: 'שביל', exact: true }).click()
  await click(page, 0.45, 0.7)
  await click(page, 0.55, 0.78)
  await page.keyboard.press('Enter')
  expect(await count()).toBe(n0 + 10)
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'shots/20-garden-plan.png' })

  // מודל תלת-ממדי
  await page.getByRole('link', { name: 'מודל תלת-ממדי' }).click()
  await expect(page.getByTestId('model-canvas').locator('canvas')).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'shots/21-garden-model.png' })
  await expect(page.locator('.model-legend')).toContainText('דק עץ')
  await expect(page.locator('.model-legend')).toContainText('חלוקי נחל')

  // כתב כמויות כולל את הפריטים
  await page.getByRole('link', { name: 'כתב כמויות' }).click()
  await expect(page.getByText('הערכה בלבד עד לאישור מול מחירון מעודכן וספק.').first()).toBeVisible()
  await expect(page.getByText('פרגולה').first()).toBeVisible()
  await expect(page.getByText('גדר חיה').first()).toBeVisible()

  // נייד: ספרייה בלי גלילה אופקית
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('link', { name: 'תוכנית ועריכה' }).click()
  await expect(page.getByTestId('garden-palette')).toBeVisible()
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'shots/m-garden.png', fullPage: true })
  expect(errors).toEqual([])
})
