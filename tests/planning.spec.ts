import { test, expect as base } from '@playwright/test'

const expect = base.configure({ timeout: 30000 })

test('תכנון: שלבים עקביים, מפות אקלים בתוכנית, תובנות, חם וקר, שיטות מדידה, מבט על, מדריך ומחירון', async ({ page }) => {
  test.setTimeout(300000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.setViewportSize({ width: 1366, height: 1000 })
  await page.goto('/projects')
  await page.locator('.grid-cards .card').filter({ hasText: 'הבית של שני' }).getByRole('link', { name: 'פתיחה' }).click()

  // שישה שלבים כמו בדף הבית, והגליון אחרי שלבים ותקציב
  await expect(page.locator('.stage-group')).toHaveCount(6)
  const tabs = await page.locator('.stage-tabs .tab').allTextContents()
  expect(tabs.findIndex((t) => t.includes('גליון להדפסה'))).toBe(tabs.findIndex((t) => t.includes('שלבים ותקציב')) + 1)

  // קריאת התוכנית של שני: פטיו, מדרגות, דשא, גינון, גגונים ושבילים
  await page.getByRole('link', { name: 'תוכנית ועריכה' }).click()
  await expect(page.locator('.el-item').filter({ hasText: /^פרגולה/ })).toHaveCount(2)
  await expect(page.locator('.el-item').filter({ hasText: /^שביל/ })).toHaveCount(2)

  // מפת חום בתוכנית ותובנות
  await page.getByRole('radiogroup', { name: 'מפת אקלים בתוכנית' }).getByRole('radio', { name: 'נוחות לישיבה' }).click()
  await expect(page.getByTestId('plan-heat')).toHaveCount(1)
  await expect(page.getByTestId('planner-insights')).toContainText('בחורף')
  await expect(page.getByTestId('plan-heat-legend')).toBeVisible()

  // חם וקר: בחירת אלמנט מראה מסגרת מדריכה והילה
  await page.locator('.el-item').filter({ hasText: /^פרגולה 1/ }).click()
  await expect(page.getByTestId('coach')).toContainText('חם או קר')
  await expect(page.getByTestId('coach-halo')).toHaveCount(1)

  // שיטות מדידה
  await page.getByRole('button', { name: 'הצגת מידות' }).click()
  await page.getByRole('radio', { name: 'שרשראות' }).click()
  await expect(page.getByTestId('plan-chains')).toHaveCount(1)
  await page.getByRole('radio', { name: 'מרחקים' }).click()
  await expect(page.getByTestId('plan-between')).toHaveCount(1)
  await page.getByRole('radio', { name: 'מדידה חופשית' }).click()
  const b = (await page.getByTestId('plan-canvas').boundingBox())!
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.3)
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.3)
  await expect(page.getByTestId('measure')).toContainText('סך הכל')
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'shots/110-planning.png' })

  // מודל: מבט על
  await page.getByRole('link', { name: 'מודל תלת-ממדי' }).click()
  await page.getByRole('radio', { name: 'מבט על' }).click({ timeout: 60000 })
  await expect(page.getByRole('radio', { name: 'מבט על' })).toHaveAttribute('aria-checked', 'true')

  // מדריך: חיפוש במילון ותמונות לגישות
  await page.goto('/guide')
  await page.getByRole('tab', { name: 'גישות תכנון' }).click()
  await expect(page.locator('.approach-art').first()).toBeVisible()
  await page.getByRole('tab', { name: 'מילון מונחים' }).click()
  await page.getByTestId('glossary-search').fill('קנה מידה')
  await expect(page.locator('#glossary mark').first()).toBeVisible()

  // מחירון: חיפוש מסמן ומקשר למקור
  await page.goto('/prices')
  await page.getByTestId('prices-search').fill('דשא')
  await expect(page.getByTestId('prices-found')).toContainText('נמצאו')
  await expect(page.locator('.src-link').first()).toHaveAttribute('href', /^http/)
  expect(errors).toEqual([])
})
