import { test, expect as base } from '@playwright/test'

// המודל המפורט כבד בגרפיקה התוכנתית של סביבת הבדיקה, לכן זמני המתנה ארוכים
const expect = base.configure({ timeout: 30000 })

test('אקלים במודל: שמש וצל, רוח, נוחות לישיבה, צפון ועיר, ושמירת תמונה', async ({ page }) => {
  test.setTimeout(600000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.setViewportSize({ width: 1366, height: 1000 })
  await page.goto('/projects')
  await page.locator('.grid-cards .card').filter({ hasText: 'הבית של שני' }).getByRole('link', { name: 'פתיחה' }).click()
  await page.getByRole('link', { name: 'מודל תלת-ממדי' }).click()
  await expect(page.getByTestId('climate-panel')).toBeVisible({ timeout: 30000 })
  const layers = page.getByRole('radiogroup', { name: 'שכבת ניתוח' })

  // שמש וצל: הגובה האבסולוטי מההיתר, מסלול שמש, שעות שמש ומפה
  await layers.getByRole('radio', { name: 'שמש וצל' }).click()
  await expect(page.getByTestId('climate-panel')).toContainText('699.00')
  await expect(page.getByTestId('climate-stats')).toContainText('שעות שמש בממוצע בגינה', { timeout: 30000 })
  await expect(page.getByTestId('climate-legend')).toContainText('צל מלא')
  await page.getByTestId('sun-hour').fill('14')
  await expect(page.getByTestId('climate-panel')).toContainText('14:00')
  await page.getByRole('radio', { name: 'צל בשעה שנבחרה' }).click()
  await expect(page.getByTestId('climate-legend')).toContainText('צל ב-14:00')
  await page.getByRole('radiogroup', { name: 'עונה' }).getByRole('radio', { name: 'קיץ' }).click()
  await expect(page.getByTestId('climate-insights')).toContainText('קיץ')
  await page.getByRole('button', { name: 'הנפשת היום' }).click()
  await page.getByRole('button', { name: 'עצירה' }).click()
  await page.getByTestId('model-canvas').evaluate((e) => e.scrollIntoView({ block: 'end' }))
  await page.screenshot({ path: 'shots/82-sun.png' })

  // עיר: נבחרת ידנית כשלא זוהתה בכתובת
  await page.getByLabel('עיר').selectOption('ירושלים')
  await expect(page.getByTestId('climate-panel')).toContainText('הרי יהודה ושומרון')

  // רוח: משטר הרוחות, תרחיש כיוון אחר
  await layers.getByRole('radio', { name: 'רוח', exact: true }).click()
  await expect(page.getByTestId('climate-stats')).toContainText('הרוח השולטת', { timeout: 30000 })
  await expect(page.getByTestId('climate-panel')).toContainText('משטר הרוחות')
  await page.getByLabel('כיוון הרוח').selectOption('90')
  await expect(page.getByTestId('climate-stats')).toContainText('ממזרח')
  await page.getByTestId('model-canvas').evaluate((e) => e.scrollIntoView({ block: 'end' }))
  await page.screenshot({ path: 'shots/83-wind.png' })

  // נוחות לישיבה: מקומות מומלצים
  await layers.getByRole('radio', { name: 'נוחות לישיבה' }).click()
  await expect(page.getByTestId('climate-stats')).toContainText('מקומות מומלצים', { timeout: 30000 })
  const before = await page.locator('.el-item').count()
  await page.getByTestId('place-seating').click()
  await expect(page.locator('.el-item')).not.toHaveCount(before)
  await page.getByTestId('model-canvas').evaluate((e) => e.scrollIntoView({ block: 'end' }))
  await page.screenshot({ path: 'shots/84-comfort.png' })

  // צפון: כשאין כיוון ידוע, האפליקציה שואלת
  await page.getByRole('button', { name: 'שינוי' }).click()
  await expect(page.getByTestId('north-ask')).toBeVisible()
  await page.getByTestId('north-ask').getByRole('button', { name: 'ימינה' }).click()
  await page.getByTestId('north-confirm').click()
  await expect(page.getByTestId('north-ask')).toHaveCount(0)
  await expect(page.getByTestId('climate-panel')).toContainText('90.00°')

  // שמירת תמונה מהמודל
  const dl = page.waitForEvent('download')
  await page.getByTestId('model-snapshot').click()
  expect(await (await dl).path()).toBeTruthy()

  // מובייל: בלי גלילה אופקית
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'shots/85-climate-mobile.png' })
  expect(errors).toEqual([])
})
