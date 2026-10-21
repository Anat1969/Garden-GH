// ערים בישראל: מיקום, גובה אבסולוטי טיפוסי (מטר מעל פני הים), מרחק מהים ואזור אקלים.
// הערכים מעוגלים ומייצגים את מרכז היישוב. בשכונה גבוהה או נמוכה הגובה שונה, ולכן כל ערך כאן "מוערך".
// גובה שנקרא מההיתר (±0.00 אבסולוטי) קודם תמיד לגובה העיר.

export type ClimateRegion = 'coast' | 'inland' | 'hills' | 'galilee' | 'valley' | 'negev' | 'desert' | 'eilat'

export interface City {
  name: string
  alt?: string[] // שמות נוספים לזיהוי בכתובת
  lat: number
  lon: number
  elev: number
  coastKm: number
  region: ClimateRegion
}

export const REGION_TEXT: Record<ClimateRegion, string> = {
  coast: 'מישור החוף',
  inland: 'השפלה והמישור הפנימי',
  hills: 'הרי יהודה ושומרון',
  galilee: 'הגליל והגולן',
  valley: 'העמקים ובקעת הירדן',
  negev: 'צפון הנגב',
  desert: 'ים המלח והערבה',
  eilat: 'אילת',
}

export const CITIES: City[] = [
  { name: 'תל אביב', alt: ['תל-אביב', 'יפו', 'תל אביב-יפו'], lat: 32.08, lon: 34.78, elev: 20, coastKm: 1, region: 'coast' },
  { name: 'רמת גן', alt: ['רמת-גן'], lat: 32.07, lon: 34.82, elev: 50, coastKm: 4, region: 'coast' },
  { name: 'גבעתיים', lat: 32.07, lon: 34.81, elev: 60, coastKm: 4, region: 'coast' },
  { name: 'בני ברק', lat: 32.09, lon: 34.83, elev: 30, coastKm: 5, region: 'coast' },
  { name: 'חולון', lat: 32.01, lon: 34.78, elev: 30, coastKm: 4, region: 'coast' },
  { name: 'בת ים', alt: ['בת-ים'], lat: 32.02, lon: 34.75, elev: 20, coastKm: 1, region: 'coast' },
  { name: 'הרצליה', lat: 32.16, lon: 34.84, elev: 40, coastKm: 2, region: 'coast' },
  { name: 'רמת השרון', lat: 32.15, lon: 34.84, elev: 40, coastKm: 3, region: 'coast' },
  { name: 'רעננה', lat: 32.18, lon: 34.87, elev: 50, coastKm: 5, region: 'inland' },
  { name: 'כפר סבא', lat: 32.18, lon: 34.91, elev: 50, coastKm: 9, region: 'inland' },
  { name: 'הוד השרון', lat: 32.15, lon: 34.89, elev: 45, coastKm: 7, region: 'inland' },
  { name: 'נתניה', lat: 32.33, lon: 34.86, elev: 30, coastKm: 1, region: 'coast' },
  { name: 'חדרה', lat: 32.44, lon: 34.92, elev: 20, coastKm: 3, region: 'coast' },
  { name: 'קיסריה', lat: 32.5, lon: 34.9, elev: 15, coastKm: 1, region: 'coast' },
  { name: 'זכרון יעקב', lat: 32.57, lon: 34.95, elev: 150, coastKm: 4, region: 'coast' },
  { name: 'חיפה', lat: 32.79, lon: 34.99, elev: 150, coastKm: 1, region: 'coast' },
  { name: 'קריית ביאליק', alt: ['קרית ביאליק', 'קריית מוצקין', 'קרית מוצקין', 'קריית ים', 'קריית אתא'], lat: 32.83, lon: 35.09, elev: 15, coastKm: 2, region: 'coast' },
  { name: 'עכו', lat: 32.93, lon: 35.08, elev: 10, coastKm: 1, region: 'coast' },
  { name: 'נהריה', lat: 33.01, lon: 35.1, elev: 15, coastKm: 1, region: 'coast' },
  { name: 'ראשון לציון', alt: ['ראשל"צ', 'ראשון'], lat: 31.96, lon: 34.8, elev: 40, coastKm: 4, region: 'coast' },
  { name: 'יבנה', lat: 31.88, lon: 34.74, elev: 30, coastKm: 4, region: 'coast' },
  { name: 'אשדוד', lat: 31.8, lon: 34.65, elev: 30, coastKm: 2, region: 'coast' },
  { name: 'אשקלון', lat: 31.67, lon: 34.57, elev: 40, coastKm: 2, region: 'coast' },
  { name: 'רחובות', lat: 31.89, lon: 34.81, elev: 60, coastKm: 9, region: 'inland' },
  { name: 'נס ציונה', lat: 31.93, lon: 34.8, elev: 50, coastKm: 7, region: 'inland' },
  { name: 'גדרה', lat: 31.81, lon: 34.78, elev: 70, coastKm: 9, region: 'inland' },
  { name: 'פתח תקווה', alt: ['פתח תקוה', 'פ"ת'], lat: 32.09, lon: 34.89, elev: 50, coastKm: 11, region: 'inland' },
  { name: 'ראש העין', lat: 32.1, lon: 34.96, elev: 70, coastKm: 17, region: 'inland' },
  { name: 'יהוד', alt: ['יהוד-מונוסון', 'סביון'], lat: 32.03, lon: 34.89, elev: 40, coastKm: 11, region: 'inland' },
  { name: 'שוהם', lat: 32.0, lon: 34.95, elev: 100, coastKm: 17, region: 'inland' },
  { name: 'לוד', lat: 31.95, lon: 34.89, elev: 60, coastKm: 15, region: 'inland' },
  { name: 'רמלה', lat: 31.93, lon: 34.87, elev: 80, coastKm: 14, region: 'inland' },
  { name: 'מודיעין', alt: ['מודיעין-מכבים-רעות', 'מכבים', 'רעות'], lat: 31.9, lon: 35.01, elev: 280, coastKm: 25, region: 'inland' },
  { name: 'קריית גת', alt: ['קרית גת'], lat: 31.61, lon: 34.77, elev: 130, coastKm: 18, region: 'inland' },
  { name: 'שדרות', lat: 31.52, lon: 34.6, elev: 100, coastKm: 9, region: 'inland' },
  { name: 'בית שמש', lat: 31.75, lon: 34.99, elev: 300, coastKm: 30, region: 'hills' },
  { name: 'ירושלים', lat: 31.77, lon: 35.21, elev: 780, coastKm: 55, region: 'hills' },
  { name: 'מבשרת ציון', alt: ['מבשרת'], lat: 31.8, lon: 35.15, elev: 700, coastKm: 50, region: 'hills' },
  { name: 'מעלה אדומים', lat: 31.78, lon: 35.3, elev: 500, coastKm: 62, region: 'hills' },
  { name: 'אפרת', lat: 31.65, lon: 35.15, elev: 900, coastKm: 55, region: 'hills' },
  { name: 'אריאל', lat: 32.1, lon: 35.17, elev: 600, coastKm: 35, region: 'hills' },
  { name: 'צפת', lat: 32.96, lon: 35.5, elev: 850, coastKm: 35, region: 'galilee' },
  { name: 'כרמיאל', lat: 32.92, lon: 35.3, elev: 300, coastKm: 18, region: 'galilee' },
  { name: 'נצרת', alt: ['נוף הגליל', 'נצרת עילית'], lat: 32.7, lon: 35.3, elev: 400, coastKm: 30, region: 'galilee' },
  { name: 'קצרין', lat: 32.99, lon: 35.69, elev: 350, coastKm: 55, region: 'galilee' },
  { name: 'יקנעם', alt: ['יקנעם עילית'], lat: 32.66, lon: 35.11, elev: 150, coastKm: 17, region: 'valley' },
  { name: 'עפולה', lat: 32.61, lon: 35.29, elev: 60, coastKm: 30, region: 'valley' },
  { name: 'טבריה', lat: 32.79, lon: 35.53, elev: -150, coastKm: 50, region: 'valley' },
  { name: 'בית שאן', lat: 32.5, lon: 35.5, elev: -120, coastKm: 55, region: 'valley' },
  { name: 'באר שבע', lat: 31.25, lon: 34.79, elev: 280, coastKm: 45, region: 'negev' },
  { name: 'אופקים', alt: ['נתיבות'], lat: 31.31, lon: 34.62, elev: 150, coastKm: 25, region: 'negev' },
  { name: 'דימונה', lat: 31.07, lon: 35.03, elev: 550, coastKm: 70, region: 'negev' },
  { name: 'ערד', lat: 31.26, lon: 35.21, elev: 600, coastKm: 80, region: 'negev' },
  { name: 'מצפה רמון', lat: 30.61, lon: 34.8, elev: 860, coastKm: 90, region: 'negev' },
  { name: 'אילת', lat: 29.56, lon: 34.95, elev: 10, coastKm: 1, region: 'eilat' },
]

// מרכז הארץ כברירת מחדל כשלא זוהתה עיר
export const ISRAEL_CENTER: City = { name: 'מרכז הארץ', lat: 31.9, lon: 34.9, elev: 80, coastKm: 15, region: 'inland' }

const norm = (s: string) => s.replace(/[-–־"']/g, ' ').replace(/\s+/g, ' ').trim()

// זיהוי עיר מתוך הכתובת: השם הארוך ביותר שמופיע בה
export function findCity(text: string | undefined): City | null {
  if (!text) return null
  const t = ` ${norm(text)} `
  let best: { c: City; len: number } | null = null
  for (const c of CITIES) {
    for (const n of [c.name, ...(c.alt ?? [])]) {
      const nn = norm(n)
      if (t.includes(` ${nn} `) || t.includes(` ${nn},`) || t.endsWith(` ${nn} `) || t.includes(`,${nn}`) || t.includes(` ב${nn} `)) {
        if (!best || nn.length > best.len) best = { c, len: nn.length }
      }
    }
  }
  return best?.c ?? null
}

export const cityByName = (name: string | undefined) => CITIES.find((c) => c.name === name) ?? null
