// מצב הדפסה: בזמן הדפסה כל הקבוצות בטבלאות נפתחות ורכיבי הדפסה בלבד מוצגים.
import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

let printing = false
const subs = new Set<(v: boolean) => void>()
const set = (v: boolean) => {
  printing = v
  subs.forEach((f) => flushSync(() => f(v)))
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', () => set(true))
  window.addEventListener('afterprint', () => set(false))
}

export function usePrinting() {
  const [v, setV] = useState(printing)
  useEffect(() => {
    subs.add(setV)
    return () => {
      subs.delete(setV)
    }
  }, [])
  return v
}

// הדפסה: פותחים קודם את כל התוכן, ממתינים לציור, ואז מדפיסים
export function printPage() {
  set(true)
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      window.print()
      setTimeout(() => set(false), 300)
    }),
  )
}
