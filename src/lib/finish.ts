// רמות גימור לתוכנית ולמודל. נשמרות במכשיר כהעדפת תצוגה
import { createContext, useContext, useState } from 'react'

export type PlanFinish = 'line' | 'color' | 'texture'
export type ModelFinish = 'massing' | 'color' | 'detailed'

export const PLAN_FINISH: { id: PlanFinish; t: string; d: string }[] = [
  { id: 'line', t: 'קו', d: 'שרטוט אדריכלי בשחור לבן' },
  { id: 'color', t: 'צבע', d: 'צבע אחיד לכל חומר' },
  { id: 'texture', t: 'טקסטורה', d: 'מרקם החומר' },
]
export const MODEL_FINISH: { id: ModelFinish; t: string; d: string }[] = [
  { id: 'massing', t: 'סכמטי', d: 'נפחים אפורים, בלי חומרים' },
  { id: 'color', t: 'צבע', d: 'צבע אחיד לכל חומר' },
  { id: 'detailed', t: 'מפורט', d: 'טקסטורות, צללים ופרטים' },
]

function read<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback
  } catch {
    return fallback
  }
}

export function useFinish<T extends string>(kind: 'plan' | 'model', fallback: T): [T, (v: T) => void] {
  const key = `garden-gh:finish:${kind}`
  const [v, setV] = useState<T>(() => read(key, fallback))
  return [
    v,
    (n: T) => {
      setV(n)
      try {
        localStorage.setItem(key, n)
      } catch {
        /* בלי אחסון */
      }
    },
  ]
}

export const ModelFinishCtx = createContext<ModelFinish>('detailed')
export const useModelFinish = () => useContext(ModelFinishCtx)
