import { test, expect, type Page } from '@playwright/test'

// המסלול הפשוט: מעלים היתר, והאפליקציה קוראת אותו לבד ומציגה את הבית בתלת-ממד בתוך הסביבה שלו.
// כאן הקריאה האוטומטית פועלת (בשאר הבדיקות היא כבויה דרך playwright.config.ts).
test.use({ storageState: { cookies: [], origins: [] } })

async function mock(page: Page) {
  await page.route(/tile\.openstreetmap\.org|open-meteo/, (r) => r.abort())
  // אריח תצלום אוויר: תמונה קטנה במקום השרת האמיתי
  await page.route(/arcgisonline\.com/, (r) => r.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }))
  await page.route(/nominatim\.openstreetmap\.org/, (r) => r.fulfill({ json: [{ lat: '31.8947', lon: '34.8113', display_name: 'הרצל, רחובות', address: { road: 'הרצל', city: 'רחובות' } }] }))
  await page.route(/supabase\.co/, async (route) => {
    const url = route.request().url()
    if (!url.includes('/functions/v1/garden-read-plan')) return route.fulfill({ json: url.includes('settings') ? { external: {} } : [] })
    const body = JSON.parse(route.request().postData() || '{}')
    const W = body.width
    const H = body.height
    const k = W * 0.04
    const P = (mx: number, my: number) => ({ x: W * 0.2 + mx * k, y: H * 0.2 + my * k })
    if (body.task === 'map') return route.fulfill({ json: { result: { drawings: [{ title: 'תכנית קומת קרקע', kind: 'floor_plan', floor: 'קרקע', scale_den: 100, box: { x0: 0, y0: 0, x1: W, y1: H } }] } } })
    if (body.task === 'structure')
      return route.fulfill({
        json: {
          result: {
            north_angle_deg: 0,
            units: [{ name: 'הבית', footprint: [P(0, 0), P(12, 0), P(12, 9), P(0, 9)], wall_thickness_cm: 25, floor_level_rel: 0, floor_level_abs: 0 }],
            openings: [{ type: 'door', x1: P(5, 9).x, y1: P(5, 9).y, x2: P(6, 9).x, y2: P(6, 9).y }],
            plot: [P(-3, -3), P(15, -3), P(15, 13), P(-3, 13)],
            zones: [{ kind: 'lawn', label: 'דשא', polygon: [P(-2.5, 9.5), P(14.5, 9.5), P(14.5, 12.5), P(-2.5, 12.5)], level_abs: 0 }],
            levels: [],
            trees: [],
            retaining_walls: [],
          },
        },
      })
    if (body.task === 'heights') return route.fulfill({ json: { result: { levels: [], roof_type: 'flat', roof_pitch_deg: 0, storeys_above_ground: 2 } } })
    return route.fulfill({ json: { result: { scale_text: '1:100', dimensions: [] } } })
  })
}

test('מעלים היתר ורואים את הבית בתלת-ממד בתוך הסביבה שלו, בלי ללחוץ על שום דבר', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await mock(page)
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/projects')
  await page.getByPlaceholder('למשל: גינת משפחת לוי').fill('מסלול פשוט')
  await page.getByPlaceholder('רחוב, מספר, עיר').fill('הרצל 15, רחובות')
  await page.getByRole('button', { name: 'יצירה והמשך להיתר' }).click()
  // ארבעה שלבים, וההיתר ראשון
  await expect(page.getByRole('group', { name: /שלב 1: הבית בסביבה שלו/ })).toBeVisible()
  await expect(page.getByRole('group', { name: /שלב 4: כמויות והגשה/ })).toBeVisible()
  await expect(page.getByRole('group', { name: /שלב 5/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'היתר לדוגמה' }).click()
  // בלי לחיצה נוספת: הקריאה רצה לבד, ובסיומה עוברים למודל
  await page.waitForURL(/\/model$/, { timeout: 60000 })
  await expect(page.getByTestId('model-canvas').locator('canvas')).toBeVisible({ timeout: 20000 })
  // המיקום נמצא לבד מהכתובת, ולכן הסביבה מוצגת מתחת למודל
  await expect(page.getByTestId('aerial-toggle')).toHaveAttribute('aria-pressed', 'true', { timeout: 20000 })
  await page.waitForTimeout(2500)
  await page.getByTestId('model-canvas').screenshot({ path: 'shots/56-auto-model.png' })
  expect(errors).toEqual([])
})
