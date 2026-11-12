import { test, expect, type Page } from '@playwright/test'

async function pt(page: Page, fx: number, fy: number) {
  await page.getByTestId('plan-canvas').scrollIntoViewIfNeeded()
  const b = (await page.getByTestId('plan-canvas').boundingBox())!
  return { x: b.x + b.width * fx, y: b.y + b.height * fy }
}
async function dragBox(page: Page, from: [number, number], to: [number, number]) {
  const a = await pt(page, ...from)
  const b = await pt(page, ...to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 })
  await expect(page.getByTestId('select-box')).toBeVisible()
  await page.mouse.move(b.x, b.y, { steps: 4 })
  await page.mouse.up()
}

test('בחירה כמו בתוכנות שרטוט: מסגרת חלון וחוצה, Shift, Ctrl+A, הזזה ומחיקה של קבוצה, ניווט עליון למדריך', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.setViewportSize({ width: 1366, height: 1300 })
  await page.goto('/projects')

  // לשונית המדריך בסרגל העליון
  await page.locator('.main-nav').getByRole('link', { name: 'מדריך גינות' }).click()
  await expect(page.getByRole('heading', { name: 'מדריך גינות' })).toBeVisible()
  await page.locator('.main-nav').getByRole('link', { name: 'פרויקטים' }).click()

  await page.locator('.grid-cards .card').filter({ hasText: 'הבית של שני' }).getByRole('link', { name: 'פתיחה' }).click()
  await page.getByRole('link', { name: 'תוכנית ועריכה' }).click()
  await expect(page.getByTestId('plan-canvas')).toBeVisible()
  const total = await page.locator('.el-item').count()

  // מסגרת חוצה (מימין לשמאל) על כל התוכנית: בוחרת הרבה
  await dragBox(page, [0.95, 0.05], [0.05, 0.95])
  await expect(page.getByTestId('multi-bar')).toBeVisible()
  const crossing = Number((await page.getByTestId('multi-bar').locator('b').textContent())!.match(/\d+/)![0])
  expect(crossing).toBeGreaterThan(5)

  // מסגרת חלון (משמאל לימין) קטנה: בוחרת רק מה שכולו בפנים, כלומר פחות
  await page.keyboard.press('Escape')
  await dragBox(page, [0.02, 0.02], [0.55, 0.55])
  const windowCount = (await page.getByTestId('multi-bar').count()) ? Number((await page.getByTestId('multi-bar').locator('b').textContent())!.match(/\d+/)![0]) : await page.locator('.el-item.sel').count()
  expect(windowCount).toBeLessThan(crossing)

  // Ctrl+A ו-Shift+לחיצה ברשימה
  await page.locator('body').click({ position: { x: 5, y: 600 } })
  await page.keyboard.press('Control+a')
  await expect(page.locator('.el-item.sel')).toHaveCount(total - (await page.locator('.el-item').filter({ hasText: /^(דלת|חלון|פתח)/ }).count()))
  await page.keyboard.press('Escape')
  await expect(page.locator('.el-item.sel')).toHaveCount(0)
  await page.locator('.el-item').filter({ hasText: /^דשא 1/ }).click()
  await page.locator('.el-item').filter({ hasText: /^דשא 2/ }).click({ modifiers: ['Shift'] })
  await expect(page.getByTestId('multi-bar')).toContainText('נבחרו 2 אלמנטים')
  await expect(page.getByTestId('multi-editor')).toBeVisible()
  await page.screenshot({ path: 'shots/70-multi-select.png' })

  // חיצים מזיזים את שניהם, שכפול, מחיקה וביטול
  await page.locator('body').click({ position: { x: 5, y: 600 } })
  await page.keyboard.press('Shift+ArrowLeft')
  await page.getByRole('button', { name: 'שכפול' }).click()
  await expect(page.locator('.el-item')).toHaveCount(total + 2)
  await page.getByRole('button', { name: 'מחיקת הבחירה' }).click()
  await expect(page.locator('.el-item')).toHaveCount(total)
  await page.getByRole('button', { name: 'ביטול פעולה' }).click()
  await expect(page.locator('.el-item')).toHaveCount(total + 2)
  expect(errors).toEqual([])
})
