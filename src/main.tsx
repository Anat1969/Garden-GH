import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import { addProject, getState, initAuth, mergeDuplicateProjects } from './lib/store'
import { buildShaniProject, SHANI_FLAG } from './data/shaniProject'

void initAuth()

// הפרויקט של שני נוצר פעם אחת בכל מכשיר, כדוגמה שאפשר להתחיל לתכנן עליה
try {
  if (!localStorage.getItem(SHANI_FLAG)) {
    if (!getState().projects.some((p) => p.name === 'הבית של שני')) addProject(buildShaniProject())
    localStorage.setItem(SHANI_FLAG, '1')
  }
} catch {
  /* בלי אחסון מקומי אין יצירה אוטומטית */
}

// פרויקטים כפולים מגרסאות קודמות מתאחדים לפי כתובת
mergeDuplicateProjects()

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
