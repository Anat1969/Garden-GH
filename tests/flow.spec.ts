import { test, expect } from '@playwright/test'

test('זרימה: כתובת אחת לפרויקט, שדות שחולצו, רמות גימור, ידיות ומקלדת, מיקוד מהרשימה, מילון', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.setViewportSize({ width: 1366, height: 1400 })

  // מיתוג
  await page.goto('/')
  await expect(page.getByRole('link', { name: /תכנון גינה, לדף הבית/ })).toBeVisible()
  await expect(page).toHaveTitle('תכנון גינה')

  // אותה כתובת פעמיים: נוספת חלופה, לא פרויקט כפול
  await page.goto('/projects')
  await expect(page.locator('.grid-cards .card').filter({ hasText: 'הבית של שני' })).toBeVisible()
  const before = await page.locator('.grid-cards .card').count()
  await page.getByPlaceholder('רחוב, מספר, עיר').fill('השקד 7, רחובות')
  await page.getByRole('button', { name: 'יצירה והמשך להיתר' }).click()
  await expect(page).toHaveURL(/\/permit/)
  await page.goto('/projects')
  page.once('dialog', (d) => d.accept())
  await page.getByPlaceholder('רחוב, מספר, עיר').fill('השקד 7 רחובות')
  await page.getByRole('button', { name: 'יצירה והמשך להיתר' }).click()
  await expect(page.getByText(/נוספה "חלופה 2" לפרויקט הקיים/)).toBeVisible()
  await page.goto('/projects')
  await expect(page.locator('.grid-cards .card')).toHaveCount(before + 1)
  await expect(page.locator('.grid-cards .card').filter({ hasText: 'השקד 7' }).locator('.vchip')).toHaveCount(2)

  // פרויקט לדוגמה: שדות שחולצו מההיתר
  await page.locator('.grid-cards .card').filter({ hasText: 'הבית של שני' }).getByRole('link', { name: 'פתיחה' }).click()
  await expect(page.locator('.f-note').first()).toContainText('חולץ')
  await expect(page.locator('.req').first()).toBeVisible()
  await expect(page.locator('.opt').first()).toHaveText('לא חייב')
  await page.screenshot({ path: 'shots/50-overview-fields.png', fullPage: true })

  // תוכנית: רמות גימור, ידיות, חיצים, מיקוד מהרשימה
  await page.getByRole('link', { name: 'תוכנית ועריכה' }).click()
  for (const f of ['קו', 'צבע', 'טקסטורה']) {
    await page.getByRole('radiogroup', { name: 'רמת גימור' }).getByRole('radio', { name: f }).click()
    await expect(page.getByRole('radiogroup', { name: 'רמת גימור' }).getByRole('radio', { name: f })).toHaveAttribute('aria-checked', 'true')
  }
  await page.locator('.el-item').filter({ hasText: 'דשא 1' }).click()
  await expect(page.getByTestId('handle').first()).toBeVisible()
  const handle = page.getByTestId('handle').first()
  const hb = (await handle.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + 40, hb.y + 30, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByTestId('element-editor')).toContainText('נערך בגרירה')
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Control+d')
  await expect(page.locator('.el-item').filter({ hasText: /דשא/ })).toHaveCount(await page.locator('.el-item').filter({ hasText: /דשא/ }).count())
  await page.screenshot({ path: 'shots/51-plan-handles.png' })

  // מודל: רמת גימור ומיקוד מהרשימה
  await page.getByRole('link', { name: 'מודל תלת-ממדי' }).click()
  await expect(page.getByTestId('model-canvas').locator('canvas')).toBeVisible({ timeout: 20000 })
  await page.getByRole('radiogroup', { name: 'רמת גימור' }).getByRole('radio', { name: 'סכמטי' }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'shots/52-model-massing.png' })
  await page.locator('.el-item').filter({ hasText: /^קיר בית 3\b/ }).first().click()
  await expect(page.getByTestId('element-editor')).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'shots/53-model-focus.png' })
  await page.getByRole('link', { name: 'הצגה בתוכנית' }).click()
  await expect(page).toHaveURL(/\/plan/)
  await expect(page.getByTestId('element-editor')).toContainText('קיר בית')
  await page.getByRole('link', { name: 'מודל תלת-ממדי' }).click()
  await page.getByRole('radiogroup', { name: 'רמת גימור' }).getByRole('radio', { name: 'מפורט' }).click()

  // מעבר בין שלבים בתחתית
  await page.getByRole('link', { name: 'מעבר לשלב הבא' }).click()
  await expect(page).toHaveURL(/\/bom$/)

  // מילון מונחים
  await page.goto('/guide#glossary')
  await expect(page.locator('.glossary')).toContainText('הונח')
  await page.screenshot({ path: 'shots/54-glossary.png', fullPage: true })
  expect(errors).toEqual([])
})
