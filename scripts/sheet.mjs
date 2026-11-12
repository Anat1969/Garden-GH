// גליון הדפסה מתיקיית פרויקט.
// שימוש: node scripts/sheet.mjs <תיקיית הפרויקט>   (דורש npm run build)
// קלט: assets/logo.svg, data/project.json, plans.json, materials.json, callouts.json, poem.txt, post.txt
// פלט בתיקייה: assets/model_3d.png, assets/main_render.png, assets/fonts/, index.html, sheet.pdf, sheet.png (300 DPI), report.json, checks/sheet_bw.png
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const dir = path.resolve(process.argv[2] ?? '')
if (!process.argv[2] || !fs.existsSync(dir)) {
  console.error('צריך נתיב לתיקיית הפרויקט')
  process.exit(1)
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const PORT = 4319
const read = (rel, json) => {
  const f = path.join(dir, rel)
  if (!fs.existsSync(f)) return null
  const t = fs.readFileSync(f, 'utf8')
  if (!json) return t
  try {
    return JSON.parse(t)
  } catch (e) {
    console.warn(`לא תקין: ${rel}: ${e.message}`)
    return null
  }
}
const logoPath = path.join(dir, 'assets/logo.svg')
const input = {
  project: read('data/project.json', true),
  plans: read('data/plans.json', true),
  materials: read('data/materials.json', true),
  callouts: read('data/callouts.json', true),
  poem: read('data/poem.txt'),
  post: read('data/post.txt'),
  logo: fs.existsSync(logoPath) ? `data:image/svg+xml;base64,${fs.readFileSync(logoPath).toString('base64')}` : null,
}

if (!fs.existsSync(path.join(root, 'dist/index.html'))) {
  console.error('אין build. מריצים קודם npm run build')
  process.exit(1)
}
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' })
const base = `http://localhost:${PORT}`
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(base)).ok) break
  } catch {
    /* ממתינים לשרת */
  }
  await new Promise((r) => setTimeout(r, 500))
}

// נתיב Chromium מותקן מראש אם קיים (CHROMIUM_PATH), אחרת ברירת המחדל של Playwright
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  // 1. בניית הגיליון וההדמיות בדפדפן
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } })
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: [] }))
  await page.goto(`${base}/sheet-render`)
  await page.evaluate((inp) => {
    window.__SHEET_INPUT__ = inp
    window.dispatchEvent(new Event('sheet-input'))
  }, input)
  await page.waitForFunction(() => window.__SHEET_READY__ === true, null, { timeout: 240000 })
  const out = await page.evaluate(() => window.__SHEET_OUT__)

  // 2. קבצים: תמונות, גופנים, HTML עם נתיבים יחסיים
  const assets = path.join(dir, 'assets')
  fs.mkdirSync(path.join(assets, 'fonts'), { recursive: true })
  const png = (d) => Buffer.from(d.split(',')[1], 'base64')
  fs.writeFileSync(path.join(assets, 'model_3d.png'), png(out.iso))
  fs.writeFileSync(path.join(assets, 'main_render.png'), png(out.main))
  for (const f of fs.readdirSync(path.join(root, 'public/fonts'))) if (f.endsWith('.woff2')) fs.copyFileSync(path.join(root, 'public/fonts', f), path.join(assets, 'fonts', f))
  let doc = out.doc.split(out.iso).join('assets/model_3d.png').split(out.main).join('assets/main_render.png')
  if (input.logo) doc = doc.split(input.logo).join('assets/logo.svg')
  const indexPath = path.join(dir, 'index.html')
  fs.writeFileSync(indexPath, doc)

  // 3. PDF וקטורי ו-PNG ב-300 DPI מתוך index.html עצמו (בודק שהקובץ עומד בפני עצמו)
  const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 300 / 96 })
  const p2 = await ctx.newPage()
  await p2.goto(pathToFileURL(indexPath).href)
  await p2.evaluate(() => document.fonts.ready)
  await p2.waitForTimeout(400)
  const overflow = await p2.evaluate(() =>
    [...document.querySelectorAll('.fit, .sh-callout')].filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1).map((el) => (el.textContent ?? '').slice(0, 40)),
  )
  const fonts = await p2.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`))
  await p2.screenshot({ path: path.join(dir, 'sheet.png'), fullPage: true })
  await p2.emulateMedia({ media: 'print' })
  await p2.pdf({ path: path.join(dir, 'sheet.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true })
  // בדיקת שחור-לבן
  await p2.emulateMedia({ media: 'screen' })
  await p2.addStyleTag({ content: 'html { filter: grayscale(1); }' })
  fs.mkdirSync(path.join(dir, 'checks'), { recursive: true })
  await p2.screenshot({ path: path.join(dir, 'checks/sheet_bw.png'), fullPage: true, scale: 'css' })
  await ctx.close()

  const report = { ...out.report, overflow_in_index_html: overflow, fonts_loaded: [...new Set(fonts)], files: ['assets/model_3d.png', 'assets/main_render.png', 'assets/fonts/', 'index.html', 'sheet.pdf', 'sheet.png', 'report.json', 'checks/sheet_bw.png'] }
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2))
  console.log('בדיקות:')
  for (const c of report.checks) console.log(`  ${c.ok ? 'תקין ' : 'לבדיקה'}  ${c.text}`)
  console.log(`טקסט שגולש מהתיבה: ${overflow.length ? overflow.join(' | ') : 'אין'}`)
  console.log('הנחות:')
  for (const a of report.assumptions) console.log(`  ${a}`)
  console.log('קבצים:')
  for (const f of report.files) console.log(`  ${path.join(dir, f)}`)
} finally {
  await browser.close()
  server.kill()
}
