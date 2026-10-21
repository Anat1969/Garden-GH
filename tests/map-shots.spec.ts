import { test, expect } from '@playwright/test'

test('מיקום על המפה ותמונות ממבטים עם מעבר ל-ChatGPT', async ({ page, context }) => {
  test.setTimeout(240000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.route(/nominatim\.openstreetmap\.org/, (r) => r.fulfill({ json: [{ lat: '32.0853', lon: '34.7818', display_name: 'הרצל 1, תל אביב-יפו, ישראל' }] }))
  await page.route(/tile\.openstreetmap\.org|arcgisonline\.com/, (r) => r.abort())
  await context.route(/chatgpt\.com/, (r) => r.fulfill({ contentType: 'text/html', body: '<html><body>chatgpt</body></html>' }))
  await page.route(/maps\.google\.com/, (r) => r.fulfill({ contentType: 'text/html', body: '<html><body>google</body></html>' }))
  await page.setViewportSize({ width: 1400, height: 950 })
  await page.goto('/projects')
  await page.locator('.grid-cards .card').filter({ hasText: 'הבית של שני' }).getByRole('link', { name: 'פתיחה' }).click()

  // מיקום: חיפוש כתובת
  const map = page.getByTestId('map-locator')
  await map.scrollIntoViewIfNeeded()
  await map.getByLabel('כתובת לחיפוש במפה').fill('הרצל 1 תל אביב')
  await page.getByTestId('map-search').click()
  await expect(page.getByTestId('map-status')).toContainText('לפי כתובת')
  await expect(page.getByTestId('map-status')).toContainText('32.085300')
  await expect(page.getByTestId('map-status')).toContainText('רשת ישראל')
  await expect(map.getByRole('link', { name: 'GovMap (GIS)' })).toHaveAttribute('href', /govmap\.gov\.il\/\?c=\d+,\d+/)
  await expect(map.getByRole('link', { name: 'גוגל מפות' })).toHaveAttribute('href', /google\.com\/maps\/@32\.0853,34\.7818/)

  // דקירה על המפה
  const box = page.getByTestId('map-box')
  const bb = (await box.boundingBox())!
  await page.mouse.click(bb.x + bb.width * 0.3, bb.y + bb.height * 0.4)
  await expect(page.getByTestId('map-status')).toContainText('לפי דקירה')

  // קואורדינטות
  await map.getByLabel('קו רוחב').fill('31.9')
  await map.getByLabel('קו אורך').fill('35.0')
  await map.getByRole('button', { name: 'הצבה לפי קואורדינטות' }).click()
  await expect(page.getByTestId('map-status')).toContainText('לפי קואורדינטות')

  // רקעים: תצלום אוויר, מפה גרפית, גוגל לוויין
  await map.getByRole('radio', { name: 'מפה גרפית' }).click()
  await map.getByRole('radio', { name: 'גוגל לוויין' }).click()
  await expect(map.locator('iframe[title="גוגל מפות"]')).toHaveAttribute('src', /t=k/)
  await map.getByRole('radio', { name: 'תצלום אוויר' }).click()
  await page.screenshot({ path: 'shots/m-map.png', fullPage: false })

  // המיקום משמש את ניתוח האקלים, והאתר נשמר אחרי טעינה מחדש
  await page.reload()
  await expect(page.getByTestId('map-status')).toContainText('31.900000')

  // תמונות ממבטים
  await page.getByRole('link', { name: 'מודל תלת-ממדי' }).click()
  await expect(page.getByTestId('model-canvas').locator('canvas')).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(1500)
  await page.getByTestId('shots-all').click()
  await expect(page.getByTestId('shot-card')).toHaveCount(3, { timeout: 30000 })
  await page.getByTestId('shots-current').click()
  await expect(page.getByTestId('shot-card')).toHaveCount(4, { timeout: 30000 })
  const card = page.getByTestId('shot-card').first()
  await card.getByTestId('copy-real-prompt').click()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip).toContain('Documentary realism, Professional architecture photography, 1:1')
  expect(clip).toContain('הפוך את התמונה המצורפת לצילום אמיתי')
  // מעבר ל-ChatGPT: לשונית חדשה נפתחת
  const [popup] = await Promise.all([context.waitForEvent('page'), card.getByTestId('to-chatgpt').click()])
  await popup.waitForURL(/chatgpt\.com/)
  await popup.close()
  // שמירת התמונה שנוצרה במסגרת הריאליסטית
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await card.getByTestId('image-input').setInputFiles({ name: 'real.png', mimeType: 'image/png', buffer: png })
  await expect(card.getByTestId('image-frame').locator('img')).toBeVisible()
  await page.getByTestId('view-shots').screenshot({ path: 'shots/m-shots.png' })
  // נשמר במכשיר
  await page.reload()
  await expect(page.getByTestId('model-canvas').locator('canvas')).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('shot-card')).toHaveCount(4, { timeout: 20000 })
  expect(errors).toEqual([])
})
