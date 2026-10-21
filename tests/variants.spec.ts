import { test, expect, type Page } from '@playwright/test'

const openShani = async (page: Page) => {
  await page.goto('/projects')
  await page.locator('.grid-cards .card').filter({ hasText: 'הבית של שני' }).getByRole('link', { name: 'פתיחה' }).click()
  await expect(page.getByRole('heading', { name: 'הבית של שני' })).toBeVisible()
}

test('חלופות: מדרגות בכל חלופה, חלופה ליד שם הפרויקט, דרישות, שינוי אחרון, תכנון על משטח נבחר, איפוס, מידות לחיצות', async ({ page }) => {
  test.setTimeout(240000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.setViewportSize({ width: 1400, height: 950 })

  // שדרוג פרויקט ישן: מוחקים את נתוני המדרגות, והמיגרציה מחזירה אותן בכל החלופות
  await page.goto('/projects')
  await page.evaluate(() => {
    const ps = JSON.parse(localStorage.getItem('garden-gh:projects') || '[]')
    for (const p of ps) {
      if (p.name !== 'הבית של שני') continue
      for (const z of p.permit.structure.zones) {
        delete z.levelToAbs
        delete z.down
      }
      for (const v of p.variants) for (const e of v.elements) if (e.kind === 'surface') delete e.stairs
      p.variants.push({ ...structuredClone(p.variants[0]), id: 'old-variant', name: 'חלופה ישנה' })
    }
    localStorage.setItem('garden-gh:projects', JSON.stringify(ps))
  })
  await page.reload()
  await openShani(page)

  // ליד שם הפרויקט: מספר החלופה ושמה, ושינוי שם
  const sw = page.getByTestId('variant-switch')
  await expect(sw).toContainText('חלופה 1')
  await expect(sw).toContainText('מתוך 2')
  await sw.getByLabel('חלופה פעילה').selectOption({ label: '2. חלופה ישנה' })
  await expect(sw).toContainText('חלופה 2')
  await page.getByTestId('rename-variant').click()
  await sw.getByLabel('שם החלופה').fill('חלופה עם מדרגות')
  await sw.getByRole('button', { name: 'שמירת השם' }).click()
  await expect(sw.getByLabel('חלופה פעילה')).toContainText('חלופה עם מדרגות')

  // רצועת ההקשר: תוכנית מבט על, דרישות ושינוי אחרון, בכל דף
  await expect(page.getByTestId('context-strip')).toBeVisible()
  await expect(page.getByTestId('context-strip').getByTestId('req-summary')).toContainText('אילוצים')

  // המדרגות במודל ובתוכנית, גם בחלופה שנוצרה לפני השדרוג
  await page.getByRole('link', { name: 'תוכנית ועריכה' }).click()
  await expect(page.getByTestId('plan-stairs')).toHaveCount(4)
  await expect(page.locator('.side .side-req')).toContainText('דרישות החלופה')

  // אישור כל האלמנטים, והשינוי האחרון מתעדכן
  await page.getByTestId('approve-everything').click()
  await expect(page.getByTestId('last-change')).toContainText('אושר')

  // מידות לחיצות: לחיצה על תגית מידה בוחרת את מה שהיא מודדת
  await page.getByRole('button', { name: 'הצגת מידות' }).click()
  await page.getByRole('radio', { name: 'אלמנטים' }).click()
  await page.locator('[data-testid=plan-dims] .dim-tag').first().dispatchEvent('pointerdown')
  await expect(page.getByTestId('element-editor')).toBeVisible()
  await page.screenshot({ path: 'shots/v-plan-dims.png' })

  // תכנון: לוחצים על משטח בתוכנית, ולחיצה על סגנון מציגה הצעה מיד
  await page.getByRole('link', { name: 'תכנון הגינה' }).click()
  const zones = page.getByTestId('pick-zone')
  await zones.first().click()
  await expect(zones.first()).toHaveAttribute('data-picked', '1')
  await page.getByRole('radiogroup', { name: 'סגנון הגינה' }).getByRole('radio').first().click()
  await expect(page.getByTestId('design-preview')).toContainText('הצעה בסגנון')
  await page.screenshot({ path: 'shots/v-design.png' })
  await page.getByTestId('run-design').click()
  await expect(page).toHaveURL(/\/plan$/)
  await expect(sw).toContainText('חלופה 3')
  await expect(page.getByTestId('plan-stairs')).toHaveCount(4)

  // ידני: משטח נבחר נפתח בתוכנית
  await page.getByRole('link', { name: 'תכנון הגינה' }).click()
  await page.getByRole('radio', { name: /תכנון ידני/ }).click()
  await page.getByTestId('pick-zone').first().click()
  await page.getByTestId('manual-open').click()
  await expect(page.getByTestId('element-editor')).toBeVisible()

  // איפוס: גינה ריקה, המבנה והמדרגות נשארים
  await page.getByRole('link', { name: 'תכנון הגינה' }).click()
  page.once('dialog', (d) => d.accept())
  await page.getByTestId('reset-empty').click()
  await page.getByRole('link', { name: 'תוכנית ועריכה' }).click()
  await expect(page.getByTestId('plan-stairs')).toHaveCount(4)
  await expect(page.locator('.el-item').filter({ hasText: /^דשא/ })).toHaveCount(0)
  await page.getByRole('link', { name: 'תכנון הגינה' }).click()
  page.once('dialog', (d) => d.accept())
  await page.getByTestId('reset-permit').click()
  await expect(page.getByTestId('pick-zone').first()).toBeVisible()

  // דף החלופות: תוכנית והדמיה, הסבר השינוי, והפעלה בלחיצה על התוכנית
  await page.getByRole('link', { name: 'חלופות' }).click()
  await expect(page.locator('.variant-card')).toHaveCount(3)
  await expect(page.getByTestId('variant-focus')).toContainText('במה היא שונה')
  await expect(page.getByTestId('variant-focus').locator('img.variant-render')).toBeVisible({ timeout: 30000 })
  await page.locator('.variant-card').first().getByRole('button', { name: /הפעלת חלופה 1/ }).click()
  await expect(sw).toContainText('חלופה 1')
  await page.screenshot({ path: 'shots/v-variants.png', fullPage: true })

  // המודל עם מידות על הקרקע
  await page.getByRole('link', { name: 'מודל תלת-ממדי' }).click()
  await expect(page.getByTestId('model-canvas').locator('canvas')).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: 'הצגת מידות' }).click()
  await page.waitForTimeout(2500)
  await page.getByTestId('model-canvas').screenshot({ path: 'shots/v-model-dims.png' })
  await page.getByRole('radio', { name: 'מבט על' }).click()
  await page.waitForTimeout(2500)
  await page.getByTestId('model-canvas').screenshot({ path: 'shots/v-model-top.png' })

  // כרטיס הפרויקט: חלופה ושינוי אחרון
  await page.goto('/projects')
  await expect(page.locator('.grid-cards .card').filter({ hasText: 'הבית של שני' }).getByTestId('project-last-change')).toContainText('שינוי אחרון')
  expect(errors).toEqual([])
})
