import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import { addProject, initAuth } from './lib/store'
import { buildShaniProject, SHANI_FLAG } from './data/shaniProject'

void initAuth()

// הפרויקט של שני נוצר פעם אחת בכל מכשיר, כדוגמה שאפשר להתחיל לתכנן עליה
try {
  if (!localStorage.getItem(SHANI_FLAG)) {
    addProject(buildShaniProject())
    localStorage.setItem(SHANI_FLAG, '1')
  }
} catch {
  /* בלי אחסון מקומי אין יצירה אוטומטית */
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
