import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

mkdirSync('shots', { recursive: true })

const SB = /supabase\.co/
const requests: { method: string; url: string; body?: string | null }[] = []

async function mockSupabase(page: Page, google = false) {
  requests.length = 0
  await page.route(SB, async (route) => {
    const req = route.request()
    requests.push({ method: req.method(), url: req.url(), body: req.postData() })
    const url = req.url()
    if (url.includes('/auth/v1/settings')) return route.fulfill({ json: { external: { google, email: true } } })
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: { id: '00000000-0000-4000-8000-000000000001', email: 'anat@example.com', aud: 'authenticated', role: 'authenticated' } })
    if (url.includes('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' })
    if (url.includes('/storage/v1/')) return route.fulfill({ json: { Key: 'garden-permits/x.pdf' } })
    if (url.includes('/rest/v1/')) return route.fulfill({ status: req.method() === 'GET' ? 200 : 201, json: [] })
    return route.fulfill({ json: {} })
  })
}

async function noHorizontalScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over, 'horizontal overflow px').toBeLessThanOrEqual(1)
}

async function clickCanvas(page: Page, fx: number, fy: number) {
  await page.getByTestId('plan-canvas').scrollIntoViewIfNeeded()
  const box = (await page.getByTestId('plan-canvas').boundingBox())!
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
}

test('המסלול המרכזי: היתר, זיהוי, תוכנית, מודל, כמויות, שלבים, חלופות', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()))
  await mockSupabase(page)
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /מההיתר/ })).toBeVisible()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'shots/01-home.png', fullPage: true })

  // סרגל עליון
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  await expect(page.getByText('כניסה עם Google עדיין לא הופעלה')).toBeVisible()
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  await page.getByRole('link', { name: 'מחירון' }).first().click()
  await expect(page.getByRole('heading', { name: 'מחירון' })).toBeVisible()
  await expect(page.getByText('מחירון לא נטען').first()).toBeVisible()
  await page.getByRole('link', { name: /Garden-GH/ }).click()
  await expect(page).toHaveURL(/\/$/)

  // פרויקט חדש
  await page.getByRole('link', { name: 'פרויקטים' }).first().click()
  await page.getByPlaceholder('למשל: גינת משפחת לוי').fill('גינת בדיקה')
  await page.getByPlaceholder('רחוב, עיר').fill('הרצל 1, אשדוד')
  await page.getByRole('button', { name: 'יצירה והמשך להיתר' }).click()
  await expect(page).toHaveURL(/\/permit$/)

  // היתר לדוגמה
  await page.getByRole('button', { name: 'היתר לדוגמה' }).click()
  await expect(page.getByText('4 עמודים · וקטורי')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('1:100').first()).toBeVisible()
  await expect(page.getByText('נמצא בטקסט של העמוד')).toBeVisible()
  await page.getByRole('button', { name: 'זיהוי אוטומטי' }).click()
  const res = page.getByText(/זיהיתי \d+ קירות, \d+ פתחים/)
  await expect(res).toBeVisible()
  const txt = (await res.textContent())!
  const [walls, openings] = txt.match(/\d+/g)!.map(Number)
  expect(walls).toBeGreaterThanOrEqual(5)
  expect(openings).toBeGreaterThanOrEqual(4)
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'shots/02-permit.png', fullPage: true })

  // סיווג עמודים
  const kinds = await page.locator('select[aria-label^="סוג עמוד"]').evaluateAll((els) => els.map((e) => (e as HTMLSelectElement).value))
  expect(kinds).toEqual(['site', 'plan', 'elevation', 'section'])

  await page.getByRole('button', { name: 'לבדיקה ותיקון' }).click()
  await expect(page).toHaveURL(/\/plan$/)
  await expect(page.getByTestId('plan-canvas')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'shots/03-plan.png' })

  // עריכת אלמנט מהרשימה
  await page.locator('.el-item').first().click()
  await expect(page.getByTestId('element-editor')).toBeVisible()
  await page.getByRole('button', { name: 'אישור האלמנט' }).click()
  await page.getByRole('button', { name: /אישור כל הקירות והפתחים/ }).click()
  await expect(page.getByText('לבדיקה')).toHaveCount(0)

  // שרטוט דשא, ריצוף וגדר
  await page.getByRole('button', { name: 'משטח', exact: true }).click()
  await page.getByRole('button', { name: 'דשא', exact: true }).click()
  await clickCanvas(page, 0.15, 0.82)
  await clickCanvas(page, 0.45, 0.95)
  await expect(page.getByTestId('element-editor')).toContainText('דשא')
  await page.getByRole('button', { name: 'משטח', exact: true }).click()
  await page.getByRole('button', { name: 'אבן משתלבת', exact: true }).click()
  await clickCanvas(page, 0.55, 0.82)
  await clickCanvas(page, 0.8, 0.95)
  await page.getByRole('tab', { name: 'מבנה הבית' }).click()
  await page.getByRole('button', { name: 'גדר', exact: true }).click()
  await clickCanvas(page, 0.1, 0.98)
  await clickCanvas(page, 0.9, 0.98)
  await expect(page.getByTestId('element-editor')).toContainText('גדר')
  await page.getByRole('button', { name: 'קיר גינה', exact: true }).click()
  await clickCanvas(page, 0.85, 0.3)
  await clickCanvas(page, 0.85, 0.6)
  await page.getByRole('button', { name: 'פתח', exact: true }).click()
  await page.getByRole('button', { name: 'קרוב', exact: true }).click()
  await page.getByRole('button', { name: 'רחוק', exact: true }).click()
  await page.getByRole('button', { name: 'התאמה', exact: true }).click()
  await page.getByRole('tab', { name: 'שרטוט' }).click()
  await page.getByRole('button', { name: 'בחירה', exact: true }).click()
  await page.screenshot({ path: 'shots/04-plan-garden.png' })

  // מודל
  await page.getByRole('link', { name: 'מודל תלת-ממדי' }).click()
  await expect(page.getByTestId('model-canvas').locator('canvas')).toBeVisible({ timeout: 20000 })
  await page.locator('.el-item').nth(2).click()
  await expect(page.getByTestId('element-editor')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'shots/05-model.png' })

  // כתב כמויות בלי מחירון
  await page.getByRole('link', { name: 'כתב כמויות' }).click()
  await expect(page.getByText('הערכה בלבד עד לאישור מול מחירון מעודכן וספק.').first()).toBeVisible()
  await expect(page.getByText(/מחירון לא נטען/).first()).toBeVisible()
  await page.getByRole('link', { name: 'טעינת מחירון' }).click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'מחירון דוגמה לא מאומת' }).click()
  await expect(page.getByText('S-06')).toBeVisible()
  await page.screenshot({ path: 'shots/06-prices.png', fullPage: true })
  await page.goBack()
  await expect(page.getByText(/₪[\d,]+ עד ₪[\d,]+/).first()).toBeVisible()
  await expect(page.getByText('גבול מגרש: לאימות במדידה')).toHaveCount(0)
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'ייצוא CSV' }).click()
  await dl
  await page.screenshot({ path: 'shots/07-bom.png', fullPage: true })

  // שלבים
  await page.getByRole('link', { name: 'שלבים ותקציב' }).click()
  await expect(page.getByText('הכנת שטח ועבודות עפר')).toBeVisible()
  await page.screenshot({ path: 'shots/08-phases.png', fullPage: true })

  // חלופות
  await page.getByRole('link', { name: 'חלופות' }).click()
  await page.getByLabel('שם החלופה').fill('חלופה חסכונית')
  await page.getByRole('button', { name: 'יצירת חלופה' }).click()
  await expect(page.locator('select').first()).toHaveValue(/.+/)
  await expect(page.getByText('פעילה', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'הפעלה' }).click()
  await page.screenshot({ path: 'shots/09-variants.png', fullPage: true })

  // סקירה
  await page.getByRole('link', { name: 'סקירה' }).click()
  await page.getByPlaceholder('פינת ישיבה, משחק לילדים, ערוגות ירק').fill('פינת ישיבה')
  await expect(page.getByText('הצעד הבא')).toBeVisible()

  // העתקת קישור
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'העתקת קישור' }).click()
  await expect(page.getByText('הקישור הועתק')).toBeVisible()
  await expect(page.getByRole('link', { name: 'שיחת הפיתוח' })).toHaveAttribute('href', /claude\.ai\/code\/session_/)

  // שמירה אחרי רענון
  await page.reload()
  await expect(page.getByRole('heading', { name: 'גינת בדיקה' })).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

test('מובייל 390: בלי גלילה אופקית בכל הדפים', async ({ page }) => {
  await mockSupabase(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.waitForTimeout(1200)
  await noHorizontalScroll(page)
  await page.screenshot({ path: 'shots/m-01-home.png', fullPage: true })
  await page.getByRole('button', { name: 'פרויקט חדש' }).first().click()
  await expect(page).toHaveURL(/\/permit$/)
  await page.getByRole('button', { name: 'היתר לדוגמה' }).click()
  await expect(page.getByText('4 עמודים · וקטורי')).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'זיהוי אוטומטי' }).click()
  await page.getByRole('button', { name: 'לבדיקה ותיקון' }).click()
  await page.getByRole('button', { name: /אישור כל הקירות/ }).click()
  for (const tab of ['סקירה', 'היתר', 'תוכנית ועריכה', 'מודל תלת-ממדי', 'כתב כמויות', 'שלבים ותקציב', 'חלופות']) {
    await page.getByRole('link', { name: tab, exact: true }).click()
    await page.waitForTimeout(700)
    await noHorizontalScroll(page)
    await page.screenshot({ path: `shots/m-tab-${tab}.png`, fullPage: true })
  }
  await page.getByRole('link', { name: 'מחירון' }).first().click()
  await noHorizontalScroll(page)
  await page.getByRole('link', { name: 'פרויקטים' }).first().click()
  await noHorizontalScroll(page)
  await page.goto('/no-such-page')
  await expect(page.getByText('הדף לא נמצא')).toBeVisible()
  await noHorizontalScroll(page)
})

test('ענן: סשן מזויף שולח שמירה ל-garden_projects', async ({ page }) => {
  await mockSupabase(page, true)
  const exp = Math.floor(Date.now() / 1000) + 3600
  const session = {
    access_token: 'h.' + Buffer.from(JSON.stringify({ sub: '00000000-0000-4000-8000-000000000001', exp, role: 'authenticated' })).toString('base64url') + '.s',
    refresh_token: 'r',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user: { id: '00000000-0000-4000-8000-000000000001', email: 'anat@example.com', aud: 'authenticated', role: 'authenticated' },
  }
  await page.addInitScript((s) => localStorage.setItem('sb-ktqmwpbzcnzkhjskqisy-auth-token', JSON.stringify(s)), session)
  await page.goto('/projects')
  await page.getByRole('button', { name: 'חשבון' }).click()
  await expect(page.getByText('anat@example.com')).toBeVisible()
  await page.getByRole('button', { name: 'חשבון' }).click()
  await page.getByPlaceholder('למשל: גינת משפחת לוי').fill('פרויקט ענן')
  await page.getByRole('button', { name: 'יצירה והמשך להיתר' }).click()
  await expect.poll(() => requests.some((r) => r.method === 'POST' && r.url.includes('/rest/v1/garden_projects') && (r.body ?? '').includes('פרויקט ענן'))).toBe(true)
  expect(requests.some((r) => r.method === 'GET' && r.url.includes('/rest/v1/garden_projects'))).toBe(true)
  await page.getByRole('button', { name: 'חשבון' }).click()
  await page.getByRole('button', { name: 'יציאה' }).click()
  await expect(page.getByRole('button', { name: 'כניסה', exact: true })).toBeVisible()
  await page.waitForTimeout(400)
  if (!(await page.getByRole('button', { name: 'כניסה עם Google' }).isVisible())) await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  await expect(page.getByRole('button', { name: 'כניסה עם Google' })).toBeVisible()
})

test('התקנה מ-Chrome: manifest תקין ואין שגיאות התקנה', async () => {
  const { chromium } = await import('@playwright/test')
  const ctx = await chromium.launchPersistentContext(`shots/profile-${Date.now()}`, {
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  await mockSupabase(page)
  await page.goto('http://localhost:4173/')
  const m = await (await page.request.get('http://localhost:4173/manifest.webmanifest')).json()
  expect(m.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true)
  await page.waitForTimeout(2500)
  const cdp = await ctx.newCDPSession(page)
  const r = await cdp.send('Page.getInstallabilityErrors')
  expect(r.installabilityErrors, JSON.stringify(r.installabilityErrors)).toEqual([])
  const sw = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? null)
  expect(sw).toContain('/sw.js')
  await ctx.close()
})
