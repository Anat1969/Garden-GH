import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' },
    locale: 'he-IL',
    // הבדיקות מפעילות את קריאת ההיתר בעצמן, צעד אחר צעד. הקריאה האוטומטית נבדקת בנפרד (tests/auto.spec.ts)
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:4173', localStorage: [{ name: 'garden.autoRead', value: '0' }] }] },
  },
  webServer: { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60_000 },
})
