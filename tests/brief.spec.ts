import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

mkdirSync('shots', { recursive: true })

// נתוני Open-Meteo מדומים: שנתיים של נתונים יומיים
function meteo() {
  const time: string[] = []
  const tmax: number[] = []
  const tmin: number[] = []
  const pr: number[] = []
  const et0: number[] = []
  const ws: number[] = []
  const wd: number[] = []
  for (const y of [2023, 2024])
    for (let m = 1; m <= 12; m++)
      for (let d = 1; d <= 28; d++) {
        time.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
        const summer = m >= 6 && m <= 9
        tmax.push(summer ? (d % 7 === 0 ? 37 : 32) : 19)
        tmin.push(m === 1 && d < 3 ? -1 : summer ? 22 : 8)
        pr.push(m <= 3 || m >= 11 ? (d % 3 === 0 ? 6 : 0) : 0)
        et0.push(summer ? 6 : 2.5)
        ws.push(summer ? 6 : 9)
        wd.push(summer ? 300 : 230)
      }
  return { elevation: 612, daily: { time, temperature_2m_max: tmax, temperature_2m_min: tmin, precipitation_sum: pr, et0_fao_evapotranspiration: et0, wind_speed_10m_max: ws, wind_direction_10m_dominant: wd } }
}

async function setup(page: Page, live: boolean) {
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.route(/tile\.openstreetmap\.org|arcgisonline\.com|nominatim/, (r) => r.abort())
  await page.route(/archive-api\.open-meteo\.com/, (r) => (live ? r.fulfill({ json: meteo() }) : r.abort()))
}

test('נתוני אתר, אתגרים, הצעה תכנונית ותמונת מצב', async ({ page, context }) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await setup(page, true)
  await page.setViewportSize({ width: 1400, height: 950 })
  await page.goto('/projects')
  await page.locator('.grid-cards .card').filter({ hasText: 'הבית של שני' }).getByRole('link', { name: 'פתיחה' }).click()

  // לפני מיקום: ערכים לפי העיר, וכפתור החילוץ כבוי
  const site = page.getByTestId('site-data')
  await site.scrollIntoViewIfNeeded()
  await expect(page.getByTestId('site-status')).toContainText('קודם ממקמים')

  // מיקום בקואורדינטות: החילוץ רץ לבד ונשמר
  const map = page.getByTestId('map-locator')
  await map.getByLabel('קו רוחב').fill('31.7800')
  await map.getByLabel('קו אורך').fill('35.2100')
  await map.getByRole('button', { name: 'הצבה לפי קואורדינטות' }).click()
  await expect(page.getByTestId('site-status')).toContainText('Open-Meteo', { timeout: 20000 })
  await expect(site.getByLabel('גובה מעל פני הים')).toHaveValue('699') // ±0.00 מההיתר גובר על מודל הגובה
  await expect(site.getByLabel('ימי קרה בשנה (מתחת ל-0)')).toHaveValue('2')
  await expect(site.getByLabel('רוח שולטת בחורף')).toHaveValue(/דרום-מערב/)
  // עריכה ידנית: התווית הופכת ל"הונח"
  await site.getByLabel('קרקע אופיינית לאזור').fill('חרסית כבדה במגרש')
  await site.getByLabel('גובה מעל פני הים').click()
  await expect(site.locator('.site-field').filter({ hasText: 'קרקע אופיינית' })).toContainText('הוזן ידנית')
  await site.getByTestId('site-extract').click()
  await expect(site.locator('.site-field').filter({ hasText: 'קרקע אופיינית' })).toContainText('הוזן ידנית')
  await page.screenshot({ path: 'shots/b-site.png', fullPage: false })

  // דרישות לקוח שמתנגשות עם האתר
  await page.getByRole('group', { name: 'חומרים' }).getByText('דשא', { exact: true }).click()
  await page.getByRole('group', { name: 'פונקציות לגינה' }).getByText('תחזוקה נמוכה').click()
  await page.getByRole('group', { name: 'פונקציות לגינה' }).getByText('ירקות ותבלינים').click()

  // הלשונית החדשה
  await page.getByRole('link', { name: /אתגרים והצעה/ }).click()
  await expect(page.getByRole('heading', { name: 'אתגרי הגינה והצעה תכנונית' })).toBeVisible()
  const ch = page.getByTestId('challenge')
  expect(await ch.count()).toBeGreaterThanOrEqual(5)
  await expect(page.getByTestId('brief-challenges')).toContainText('גירעון מים')
  await expect(page.getByTestId('brief-challenges')).toContainText('קרקע וניקוז')
  await expect(page.getByTestId('brief-challenges')).toContainText('חרסית')
  await expect(page.getByTestId('brief-challenges')).toContainText('דשא מול גירעון מים')
  await expect(page.getByTestId('brief-proposal')).toContainText('מענה למצב האובייקטיבי')
  await expect(page.getByTestId('client-proposal')).toContainText('ירקות ותבלינים')
  await expect(page.getByTestId('brief-data')).toContainText('חץ הצפון')

  // תמונת מצב בצד
  const snap = page.getByTestId('process-snapshot')
  await expect(snap).toBeVisible()
  await expect(snap.locator('[data-state="missing"]').filter({ hasText: 'אתגרים והצעה' })).toHaveCount(1)
  await expect(page.getByTestId('process-gaps')).toContainText('מדידה טופוגרפית')
  const sb = (await snap.boundingBox())!
  const mb = (await page.getByTestId('brief-challenges').boundingBox())!
  expect(sb.x + sb.width, 'snapshot on the side (left in RTL)').toBeLessThan(mb.x + 5)
  await snap.getByTestId('snapshot-notes').fill('לבקש מדידה מהלקוח')
  await snap.locator('.snap-title').click()
  await snap.getByTestId('snapshot-copy').click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('לבקש מדידה מהלקוח')

  // שמירה והעתקה
  await page.getByTestId('brief-copy').click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('הצעה תכנונית: מענה לדרישות הלקוח')
  await page.getByTestId('brief-save').click()
  await expect(page.getByTestId('brief-saved')).toContainText('נשמר')
  await expect(snap.locator('[data-state="ok"]').filter({ hasText: 'אתגרים והצעה' })).toHaveCount(1)
  await page.screenshot({ path: 'shots/b-brief.png', fullPage: true })

  // נשמר אחרי טעינה מחדש
  await page.reload()
  await expect(page.getByTestId('brief-saved')).toContainText('נשמר')
  await expect(page.getByTestId('snapshot-notes')).toHaveValue('לבקש מדידה מהלקוח')

  // יצירת חלופה מההצעה
  await page.getByTestId('brief-make-variant').click()
  await expect(page).toHaveURL(/\/plan$/)

  // מובייל: בלי גלילה אופקית, תמונת המצב מעל התוכן
  await page.goBack()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'shots/b-brief-mobile.png', fullPage: true })
  expect(errors).toEqual([])
})

test('נתוני אתר בלי רשת: ממוצע אזורי', async ({ page }) => {
  await setup(page, false)
  await page.goto('/projects')
  await page.locator('.grid-cards .card').filter({ hasText: 'הבית של שני' }).getByRole('link', { name: 'פתיחה' }).click()
  const map = page.getByTestId('map-locator')
  await map.getByLabel('קו רוחב').fill('32.0800')
  await map.getByLabel('קו אורך').fill('34.7800')
  await map.getByRole('button', { name: 'הצבה לפי קואורדינטות' }).click()
  await expect(page.getByTestId('site-status')).toContainText('ממוצעים אזוריים', { timeout: 20000 })
  await expect(page.getByTestId('site-data').getByLabel('אזור אקלים')).toHaveValue('מישור החוף')
  await page.getByRole('link', { name: /אתגרים והצעה/ }).click()
  await expect(page.getByTestId('brief-challenges')).toContainText('רסס ים')
  await expect(page.getByTestId('brief-challenges')).toContainText('ממוצע אזורי')
})
