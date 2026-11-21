import { test, expect, type Page } from '@playwright/test'

// חזיתות ההיתר: שרטוט חזית נוסף מתמונה, הבניין מזוהה בו לבד, והוא מולבש על הבית במודל.

// שרטוט חזית סינתטי: קו קרקע, בית עם שני קירות, גג משולש, חלונות וסימוני מפלס בצד
async function elevationPng(page: Page, accent: string): Promise<Buffer> {
  const b64 = await page.evaluate((accent) => {
    const c = document.createElement('canvas')
    c.width = 1200
    c.height = 700
    const x = c.getContext('2d')!
    x.fillStyle = '#fff'
    x.fillRect(0, 0, 1200, 700)
    x.strokeStyle = '#111'
    x.lineWidth = 4
    x.beginPath()
    x.moveTo(40, 560)
    x.lineTo(1160, 560)
    x.stroke()
    x.lineWidth = 3
    x.strokeRect(300, 260, 600, 300)
    x.beginPath()
    x.moveTo(280, 260)
    x.lineTo(600, 150)
    x.lineTo(920, 260)
    x.closePath()
    x.fillStyle = '#b6553a'
    x.fill()
    x.stroke()
    x.fillStyle = accent
    for (const [wx, wy] of [[350, 300], [520, 300], [690, 300], [350, 440], [690, 440]]) {
      x.fillRect(wx, wy, 90, 70)
      x.strokeRect(wx, wy, 90, 70)
    }
    x.fillStyle = '#5a4634'
    x.fillRect(540, 440, 70, 120)
    x.fillStyle = '#111'
    x.font = '20px sans-serif'
    x.fillText('+6.00', 1000, 265)
    x.fillText('0.00', 1000, 555)
    return c.toDataURL('image/png').split(',')[1]
  }, accent)
  return Buffer.from(b64, 'base64')
}

test('חזית מתמונה מזוהה ומולבשת על הבית במודל', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/projects')
  await page.locator('.grid-cards .card').filter({ hasText: 'הבית של שני' }).getByRole('link', { name: 'פתיחה' }).click()
  await expect(page.getByRole('heading', { name: 'הבית של שני' })).toBeVisible()
  const base = page.url().replace(/\/$/, '')
  await page.goto(`${base}/permit`)
  const panel = page.getByTestId('facades-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByText('עוד אין חזיתות')).toBeVisible()

  const sides: [string, string, string][] = [['חזית דרומית.png', 'S', '#9fc4e0'], ['חזית מערבית.png', 'W', '#e0c89f'], ['חזית צפונית.png', 'N', '#b9e09f'], ['חזית מזרחית.png', 'E', '#d6a8e0']]
  for (const [name, , accent] of sides) {
    await page.getByTestId('facade-file').setInputFiles({ name, mimeType: 'image/png', buffer: await elevationPng(page, accent) })
    await expect(panel.getByTestId('facade-card').filter({ hasText: name.replace('.png', '') })).toBeVisible()
  }
  await expect(panel.getByTestId('facade-card')).toHaveCount(4)
  // הצד נקרא מהשם, והבניין זוהה בשרטוט: קירות ב-300 וב-900 מתוך 1200, קרקע ב-560 מתוך 700
  await expect(panel.getByTestId('facade-side').first()).toHaveValue('S')
  const f = await page.evaluate(() => {
    const raw = Object.keys(localStorage).map((k) => localStorage.getItem(k) || '').find((v) => v.includes('"facades"')) || ''
    const m = raw.match(/"x0":([\d.]+),"x1":([\d.]+),"yGround":([\d.]+),"yTop":([\d.]+)/)
    return m ? m.slice(1).map(Number) : null
  })
  expect(f).not.toBeNull()
  expect(Math.abs(f![0] - 0.25)).toBeLessThan(0.02)
  expect(Math.abs(f![1] - 0.75)).toBeLessThan(0.02)
  expect(Math.abs(f![2] - 0.8)).toBeLessThan(0.02)
  expect(Math.abs(f![3] - 150 / 700)).toBeLessThan(0.03)
  await panel.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'shots/40-facades-panel.png' })

  await page.goto(`${base}/model`)
  await expect(page.getByTestId('model-canvas').locator('canvas')).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('facades-toggle')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('facades-note')).toContainText('היטל ישר')
  await page.waitForTimeout(3000)
  await page.getByTestId('model-canvas').screenshot({ path: 'shots/41-facades-model.png' })
  await page.getByTestId('facades-toggle').click()
  await expect(page.getByTestId('facades-note')).toHaveCount(0)
  await page.waitForTimeout(800)
  await page.getByTestId('model-canvas').screenshot({ path: 'shots/42-facades-off.png' })

  // נייד: בלי גלילה אופקית במסך החזיתות
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto(`${base}/permit`)
  await expect(page.getByTestId('facades-panel')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  expect(errors).toEqual([])
})
