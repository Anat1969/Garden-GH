import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('פרויקטים: מסמכים מכל סוג, קריאה אוטומטית כהיתר, עריכה, מחיקה, תוכנית בכרטיס ומידות לפי בקשה', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.setViewportSize({ width: 1366, height: 1000 })
  await page.goto('/projects')

  // פרויקט חדש עם מסמכים: היתר PDF, תמונה, קובץ DWG וקובץ טקסט, ואז הסרה של אחד
  await page.getByPlaceholder('למשל: גינת משפחת לוי').fill('גינת מסמכים')
  await page.getByTestId('doc-input').setInputFiles([
    { name: 'היתר בנייה.pdf', mimeType: 'application/pdf', buffer: readFileSync('public/sample-permit.pdf') },
    { name: 'צילום חצר.jpg', mimeType: 'image/jpeg', buffer: readFileSync('public/sample-scan.jpg') },
    { name: 'מדידה.dwg', mimeType: 'application/octet-stream', buffer: Buffer.from('AC1027 dummy') },
    { name: 'הערות.txt', mimeType: 'text/plain', buffer: Buffer.from('הערות לקוח') },
  ])
  const list = page.getByRole('list', { name: 'מסמכים שיצורפו' })
  await expect(list.locator('li')).toHaveCount(4)
  await expect(page.getByLabel('סוג המסמך היתר בנייה.pdf')).toHaveValue('permit')
  await expect(page.getByLabel('סוג המסמך צילום חצר.jpg')).toHaveValue('photo')
  await expect(page.getByLabel('סוג המסמך מדידה.dwg')).toHaveValue('survey')
  await page.getByRole('button', { name: 'הסרת הערות.txt' }).click()
  await expect(list.locator('li')).toHaveCount(3)
  await page.screenshot({ path: 'shots/30-new-project-docs.png' })
  await page.getByRole('button', { name: 'יצירה והמשך להיתר' }).click()

  // ההיתר נקרא אוטומטית מהמסמך
  await expect(page.getByText('4 עמודים · וקטורי')).toBeVisible({ timeout: 30000 })
  const docs = page.getByTestId('project-docs')
  await expect(docs.locator('li')).toHaveCount(3)
  // הוספה והסרה בתוך הפרויקט
  await docs.getByTestId('doc-input').setInputFiles([{ name: 'מפרט.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK') }])
  await expect(docs.locator('li')).toHaveCount(4)
  await expect(page.getByLabel('סוג המסמך מפרט.xlsx')).toHaveValue('spec')
  page.once('dialog', (d) => d.accept())
  await docs.getByRole('button', { name: 'הסרת מדידה.dwg' }).click()
  await expect(docs.locator('li')).toHaveCount(3)
  await page.screenshot({ path: 'shots/31-project-docs.png', fullPage: true })

  // זיהוי ותוכנית, ואז מידות רק לפי בקשה
  await page.getByRole('button', { name: 'זיהוי אוטומטי' }).click()
  await page.getByRole('button', { name: 'לבדיקה ותיקון' }).click()
  await expect(page.getByTestId('plan-canvas')).toBeVisible()
  await expect(page.getByTestId('plan-dims')).toHaveCount(0)
  await page.getByRole('button', { name: 'הצגת מידות' }).click()
  await expect(page.getByTestId('plan-dims')).toHaveCount(1)
  await expect(page.getByTestId('plan-dims')).toContainText("מ'")
  await page.screenshot({ path: 'shots/32-plan-dims.png' })
  await page.getByRole('link', { name: 'מודל תלת-ממדי' }).click()
  await expect(page.getByRole('button', { name: 'הצגת מידות' })).toHaveAttribute('aria-pressed', 'false')

  // כרטיס פרויקט: תוכנית, עריכה ומחיקה
  await page.goto('/projects')
  const card = page.locator('.grid-cards .card').filter({ hasText: 'גינת מסמכים' })
  await expect(card.locator('.plan-thumb svg')).toBeVisible()
  await expect(card).toContainText('3 מסמכים')
  await card.getByRole('button', { name: 'עריכה' }).click()
  const form = page.locator('.project-card form')
  await expect(form.getByLabel('שם הפרויקט')).toHaveValue('גינת מסמכים')
  await form.getByLabel('שם הפרויקט').fill('גינת מסמכים מעודכנת')
  await form.getByLabel('כתובת').fill('הדקל 3, חיפה')
  await form.getByRole('button', { name: 'שמירה' }).click()
  const edited = page.locator('.grid-cards .card').filter({ hasText: 'גינת מסמכים מעודכנת' })
  await expect(edited).toContainText('הדקל 3, חיפה')
  await page.screenshot({ path: 'shots/33-project-cards.png', fullPage: true })
  page.once('dialog', (d) => d.accept())
  await edited.getByRole('button', { name: 'מחיקה' }).click()
  await expect(page.locator('.grid-cards .card').filter({ hasText: 'גינת מסמכים' })).toHaveCount(0)
  expect(errors).toEqual([])
})
