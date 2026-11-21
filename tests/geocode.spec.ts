import { test, expect } from '@playwright/test'

// כתובת שהוזנה בפרויקט נמצאת לבד על המפה. כשמספר הבית חסר במפה נמצא הרחוב ביישוב הנכון, והאפליקציה אומרת זאת.
test('כתובת הפרויקט מחופשת לבד: רחוב ביישוב הנכון, לא בית בעיר שכנה', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const calls: string[] = []
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.route(/tile\.openstreetmap\.org|arcgisonline\.com|open-meteo/, (r) => r.abort())
  await page.route(/nominatim\.openstreetmap\.org/, (r) => {
    const u = new URL(r.request().url())
    const street = u.searchParams.get('street') ?? ''
    calls.push(street || u.searchParams.get('q') || u.searchParams.get('city') || '')
    // הבית עצמו קיים במפה רק בעיר שכנה באותה נפה. ברחובות יש רק את הרחוב.
    if (street === '15 הרצל') return r.fulfill({ json: [{ lat: '31.9270', lon: '34.7969', display_name: '15, הרצל, נס ציונה, נפת רחובות', address: { house_number: '15', road: 'הרצל', city: 'נס ציונה', county: 'נפת רחובות' } }] })
    if (street === 'הרצל') return r.fulfill({ json: [{ lat: '31.8947', lon: '34.8113', display_name: 'הרצל, רחובות, נפת רחובות', address: { road: 'הרצל', city: 'רחובות' } }] })
    return r.fulfill({ json: [] })
  })
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/projects')
  await page.getByPlaceholder('למשל: גינת משפחת לוי').fill('גינה ברחובות')
  await page.getByPlaceholder('רחוב, מספר, עיר').fill('רחוב הרצל 15, רחובות')
  await page.getByRole('button', { name: 'יצירה והמשך להיתר' }).click()
  await page.getByRole('link', { name: 'פרטים ודרישות' }).click()
  // בלי ללחוץ על חיפוש: הסיכה מוצבת ברחוב שברחובות, וההודעה אומרת מה נמצא
  await expect(page.getByTestId('map-precision')).toContainText('נמצא הרחוב, בלי מספר הבית', { timeout: 15000 })
  await expect(page.getByLabel('כתובת לחיפוש במפה')).toHaveValue('רחוב הרצל 15, רחובות')
  const loc = await page.evaluate(() => {
    const ps = JSON.parse(Object.values(localStorage).find((v) => v.includes('גינה ברחובות')) || '[]')
    return ps.find((p: { name: string }) => p.name === 'גינה ברחובות').location
  })
  expect(loc.lat).toBeCloseTo(31.8947, 3)
  expect(loc.precision).toBe('street')
  // קודם היישוב, אחר כך הבית, אחר כך הרחוב
  expect(calls.slice(0, 3)).toEqual(['רחובות', '15 הרצל', 'הרצל'])
  await page.getByTestId('map-precision').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'shots/46-geocode.png' })
  expect(errors).toEqual([])
})

// יישוב שמעבר לקו הירוק רשום במפה הפתוחה תחת קוד מדינה אחר, והרחוב שבו רשום תחת המועצה האזורית ולא תחת שם היישוב.
test('הר אדר: הרחוב נמצא אף שהוא רשום תחת מועצה אזורית', async ({ page }) => {
  const urls: string[] = []
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.route(/tile\.openstreetmap\.org|arcgisonline\.com|open-meteo/, (r) => r.abort())
  await page.route(/nominatim\.openstreetmap\.org/, (r) => {
    const u = new URL(r.request().url())
    urls.push(u.search)
    const street = u.searchParams.get('street')
    if (!street && u.searchParams.get('city') === 'הר אדר')
      return r.fulfill({ json: [{ lat: '31.82685', lon: '35.12955', display_name: 'הר אדר, שטח C, יהודה ושומרון', boundingbox: ['31.8190', '31.8350', '35.1200', '35.1390'], address: { village: 'הר אדר', country_code: 'ps' } }] })
    if (street === 'נוף הרים')
      return r.fulfill({ json: [{ lat: '31.83105', lon: '35.12745', display_name: 'נוף הרים, מועצה אזורית מטה בנימין, שטח C', address: { road: 'נוף הרים', city: 'מועצה אזורית מטה בנימין', country_code: 'ps' } }] })
    return r.fulfill({ json: [] })
  })
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/projects')
  await page.getByPlaceholder('למשל: גינת משפחת לוי').fill('גינה בהר אדר')
  await page.getByPlaceholder('רחוב, מספר, עיר').fill('רחוב נוף הרים 61 הר אדר')
  await page.getByRole('button', { name: 'יצירה והמשך להיתר' }).click()
  await page.getByRole('link', { name: 'פרטים ודרישות' }).click()
  await expect(page.getByTestId('map-precision')).toContainText('נמצא הרחוב, בלי מספר הבית', { timeout: 20000 })
  const loc = await page.evaluate(() => {
    const ps = JSON.parse(Object.values(localStorage).find((v) => v.includes('גינה בהר אדר')) || '[]')
    return ps.find((p: { name: string }) => p.name === 'גינה בהר אדר').location
  })
  expect(loc.lat).toBeCloseTo(31.83105, 4)
  expect(loc.lon).toBeCloseTo(35.12745, 4)
  // החיפוש כולל את שני קודי המדינה
  expect(urls.every((u) => u.includes('countrycodes=il%2Cps'))).toBe(true)
})
