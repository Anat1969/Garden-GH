import { test, expect, type Page } from '@playwright/test'

async function at(page: Page, fx: number, fy: number) {
  await page.getByTestId('plan-canvas').scrollIntoViewIfNeeded()
  const box = (await page.getByTestId('plan-canvas').boundingBox())!
  return { x: box.x + box.width * fx, y: box.y + box.height * fy }
}
async function click(page: Page, fx: number, fy: number) {
  const p = await at(page, fx, fy)
  await page.mouse.click(p.x, p.y)
}
const count = (page: Page) => page.locator('.el-item').count()

test('עורך: הצמדה ואיחוד חומר, מחיקה וביטול, מידה על התוכנית, החלפת חומר, תכנון אוטומטי, מדריך וטבלאות', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.setViewportSize({ width: 1366, height: 1700 })
  await page.goto('/projects')
  await page.locator('.grid-cards .card').filter({ hasText: 'הבית של שני' }).getByRole('link', { name: 'פתיחה' }).click()
  await page.getByRole('link', { name: 'תוכנית ועריכה' }).click()
  await expect(page.getByTestId('page-intro')).toBeVisible()
  await expect(page.getByTestId('plan-canvas')).toBeVisible()
  const n0 = await count(page)

  // שני משטחי דק נוגעים: השני נצמד לפינה ומתאחד עם הראשון
  await page.getByRole('tab', { name: 'משטחים' }).click()
  await page.getByRole('button', { name: 'משטח', exact: true }).click()
  await page.getByRole('button', { name: 'דק עץ', exact: true }).click()
  await click(page, 0.05, 0.08)
  await click(page, 0.2, 0.2)
  expect(await count(page)).toBe(n0 + 1)
  await click(page, 0.2, 0.08)
  await click(page, 0.32, 0.2)
  await expect(page.getByText(/חובר למשטח דק עץ/)).toBeVisible()
  expect(await count(page)).toBe(n0 + 1)

  // מידות של הנבחר מופיעות תמיד, עם שתי ספרות אחרי הנקודה. לחיצה על מידה והקלדה
  await page.getByRole('tab', { name: 'שרטוט' }).click()
  await page.getByRole('button', { name: 'בחירה', exact: true }).click()
  await page.locator('.el-item').last().click()
  const tags = page.getByTestId('sel-dim')
  await expect(tags.first()).toBeVisible()
  await expect(tags.first()).toHaveText(/^\d+\.\d{2}$/)
  await tags.first().click()
  await page.waitForTimeout(200)
  await expect(page.getByLabel('מידה חדשה במטרים')).toBeFocused()
  await page.getByLabel('מידה חדשה במטרים').fill('6.5')
  await page.getByLabel('מידה חדשה במטרים').press('Enter')
  await expect(page.getByTestId('sel-dims')).toContainText('6.50')
  await page.screenshot({ path: 'shots/40-merge-dims.png' })

  // החלפת חומר בעורך
  await page.getByTestId('element-editor').getByRole('radio', { name: 'חלוקי נחל' }).click()
  await expect(page.getByTestId('element-editor')).toContainText('חומר וטקסטורה · חלוקי נחל')

  // שכפול, סיבוב, מחיקה במקלדת וביטול
  await page.getByRole('button', { name: 'שכפול' }).click()
  expect(await count(page)).toBe(n0 + 2)
  await page.getByRole('button', { name: 'סיבוב 90' }).click()
  await page.locator('body').click({ position: { x: 5, y: 300 } })
  await page.keyboard.press('Delete')
  await expect.poll(() => count(page)).toBe(n0 + 1)
  await page.getByRole('button', { name: 'ביטול פעולה' }).click()
  await expect.poll(() => count(page)).toBe(n0 + 2)
  await page.getByRole('button', { name: 'חזרה על פעולה' }).click()
  await expect.poll(() => count(page)).toBe(n0 + 1)
  await page.getByRole('button', { name: 'הצמדה' }).click()
  await expect(page.getByRole('button', { name: 'הצמדה' })).toHaveAttribute('aria-pressed', 'false')

  // תכנון אוטומטי לפי דרישות
  await page.getByRole('link', { name: 'תכנון הגינה' }).click()
  await expect(page.getByTestId('auto-design')).toBeVisible()
  await page.getByRole('radio', { name: /יפני/ }).click()
  await page.getByRole('button', { name: 'משחק לילדים' }).click()
  await page.getByRole('button', { name: 'פרטיות מהשכנים' }).click()
  await page.screenshot({ path: 'shots/41-design.png', fullPage: true })
  await page.getByTestId('run-design').click()
  await expect(page).toHaveURL(/\/plan$/)
  await expect(page.locator('select').first()).toHaveValue(/.+/)
  await expect(page.getByText(/נוצרה חלופה "הצעה: יפני"/)).toBeVisible()
  expect(await count(page)).toBeGreaterThan(n0 + 5)
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'shots/42-design-plan.png' })
  await page.getByRole('link', { name: 'מודל תלת-ממדי' }).click()
  await expect(page.getByTestId('model-canvas').locator('canvas')).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'shots/43-design-model.png' })
  await page.getByRole('link', { name: 'תכנון הגינה' }).click()
  await expect(page.getByTestId('prompt-box')).toContainText('Documentary realism, Professional architecture photography, 1:1')

  // כתב כמויות: תובנות, קיבוץ, מיון, בחירה וסכומים
  await page.getByRole('link', { name: 'כתב כמויות' }).click()
  await expect(page.getByTestId('page-intro')).toContainText('מה הכי מייקר')
  const bom = page.getByTestId('bom-table')
  await bom.getByLabel('קיבוץ לפי').selectOption('phase')
  await expect(bom.locator('tr.group-row').first()).toBeVisible()
  await bom.getByRole('button', { name: 'מיון לפי טווח עלות' }).click()
  await bom.getByLabel(/בחירת הקבוצה/).first().check()
  await expect(bom.locator('tr.selected-row')).toContainText('סך הנבחרים')
  await expect(bom.locator('tr.total-row')).toContainText('סך הכל')
  await page.screenshot({ path: 'shots/44-bom.png', fullPage: true })

  // מדריך גינות מתפריט המערכת
  await page.getByRole('button', { name: 'תפריט המערכת' }).click()
  await page.getByRole('link', { name: 'מדריך גינות' }).click()
  await expect(page.getByRole('heading', { name: 'מדריך גינות' })).toBeVisible()
  await page.getByRole('button', { name: 'עקרונות, צמחים ופרומפט' }).first().click()
  await expect(page.getByTestId('prompt-box').first()).toContainText('--no text, words, writing, frame divisions')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'העתקת הפרומפט' }).first().click()
  await expect(page.getByText('הפרומפט הועתק')).toBeVisible()
  // מסגרת תמונה ליד הפרומפט: העלאה
  await page.getByTestId('image-input').first().setInputFiles('public/icon-192.png')
  await expect(page.getByTestId('image-frame').first().locator('img')).toBeVisible()
  await page.screenshot({ path: 'shots/45b-guide-image.png' })
  await page.getByRole('tab', { name: 'גישות תכנון' }).click()
  await page.getByRole('tab', { name: 'תובנות וכללי אצבע' }).click()
  await expect(page.locator('.rule').first()).toBeVisible()
  // המחשה תלת-ממדית לכל קטגוריה, והדגשת הכלל שנבחר
  await expect(page.getByTestId('rule-scene').locator('canvas')).toBeVisible()
  await page.locator('.rule-group').nth(1).getByRole('button', { name: 'המחשה בתלת-ממד' }).click()
  await page.locator('.rule-group').nth(1).locator('button.rule').first().click()
  await expect(page.locator('.rule-group').nth(1).locator('button.rule.on')).toHaveCount(1)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'shots/46-rules-3d.png' })
  // חזרה לדף הקודם
  await page.getByRole('button', { name: 'חזרה לדף הקודם' }).click()
  await expect(page).not.toHaveURL(/\/guide/)
  await page.screenshot({ path: 'shots/45-guide.png', fullPage: true })

  // נייד: בלי גלילה אופקית בתכנון ובמדריך
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/guide']) {
    await page.goto(path)
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(over).toBeLessThanOrEqual(1)
  }
  expect(errors).toEqual([])
})
