import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import { addProject, deleteProject, getState, initAuth, mergeDuplicateProjects } from './lib/store'
import { buildShaniProject, SHANI_FLAG } from './data/shaniProject'
import { runMigrations } from './lib/migrate'

void initAuth()

// הפרויקט של שני נוצר פעם אחת בכל מכשיר, כדוגמה שאפשר להתחיל לתכנן עליה
try {
  if (!localStorage.getItem(SHANI_FLAG)) {
    // גרסה 2 של הקריאה: מחליפה את הדוגמה הקודמת, אם לא נערכה ידנית
    const old = getState().projects.find((p) => p.name === 'הבית של שני')
    const edited = old && old.variants.some((v) => v.elements.some((e) => !e.source.includes('קריאת מבנה ידנית') && !e.source.includes('קריאה ידנית')))
    if (old && !edited) void deleteProject(old.id)
    if (!old || !edited) addProject(buildShaniProject())
    localStorage.setItem(SHANI_FLAG, '1')
  }
} catch {
  /* בלי אחסון מקומי אין יצירה אוטומטית */
}

// פרויקטים כפולים מגרסאות קודמות מתאחדים לפי כתובת
mergeDuplicateProjects()
// שדרוג פרויקטים קיימים: מדרגות מההיתר בכל החלופות
try {
  runMigrations()
} catch (e) {
  console.warn(e)
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    // גרסה חדשה הופעלה: טעינה אחת מחדש כדי שלא יישארו קבצים ישנים
    let reloaded = !navigator.serviceWorker.controller // בביקור הראשון אין מה לרענן
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
