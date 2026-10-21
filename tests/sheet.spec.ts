import { test, expect as base } from '@playwright/test'

const expect = base.configure({ timeout: 60000 })

test('גליון להדפסה: הדמיה, תוכנית, לוח חומרים, עריכת הייקו, הורדת HTML, והדפסה בעמוד אחד', async ({ page }) => {
  test.setTimeout(300000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.setViewportSize({ width: 1366, height: 1000 })
  await page.goto('/projects')
  await page.locator('.grid-cards .card').filter({ hasText: 'הבית של שני' }).getByRole('link', { name: 'פתיחה' }).click()
  await page.getByRole('link', { name: 'גליון להדפסה' }).click()
  await expect(page.getByTestId('sheet-page')).toBeVisible()
  await expect(page.locator('.sh-render img')).toBeVisible()
  await expect(page.locator('.plan-svg')).toHaveCount(1)
  await expect(page.locator('.sh-chip')).toHaveCount(5)
  await expect(page.getByTestId('sheet-checks')).toBeVisible()

  // הצעות להייקו: מתחלפות, ועדיין ניתנות לעריכה
  const before = await page.getByTestId('sheet-poem').inputValue()
  expect(before.split('\n').length).toBe(3)
  await page.getByRole('button', { name: 'הצעה אחרת להייקו' }).click()
  await expect(page.getByTestId('sheet-poem')).not.toHaveValue(before)
  await expect(page.getByTestId('sheet-areas')).toContainText('סך הכל')
  // עריכת ההייקו מופיעה בגיליון
  await page.getByLabel('הייקו, שלוש שורות').fill('שורה ראשונה\nשורה שנייה\nשורה שלישית')
  await expect(page.locator('.sh-haiku')).toContainText('שורה שנייה')

  // אין טקסט שגולש מהתיבה שלו
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.sheet .fit')].filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1).length)
  expect(overflow).toBe(0)
  await page.screenshot({ path: 'shots/95-sheet.png' })

  // הורדת HTML עצמאי
  const dl = page.waitForEvent('download')
  await page.getByTestId('sheet-html').click()
  expect(await (await dl).path()).toBeTruthy()

  // הדפסה: עמוד A4 אחד
  await page.emulateMedia({ media: 'print' })
  await page.pdf({ path: 'shots/sheet-app.pdf', printBackground: true, preferCSSPageSize: true })
  await page.emulateMedia({ media: 'screen' })

  // מובייל: בלי גלילה אופקית בעמוד
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
