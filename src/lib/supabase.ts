import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const cloudConfigured = Boolean(url && key)

let clientPromise: Promise<SupabaseClient | null> | null = null

// טעינה עצלה של הלקוח, כדי שהדף הראשון ייטען מהר גם בלי ענן.
export function getClient(): Promise<SupabaseClient | null> {
  if (!cloudConfigured) return Promise.resolve(null)
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }),
    )
  }
  return clientPromise
}

export type GoogleStatus = 'enabled' | 'disabled' | 'unknown'

export async function checkGoogle(): Promise<GoogleStatus> {
  if (!cloudConfigured) return 'disabled'
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key! } })
    if (!res.ok) return 'unknown'
    const json = await res.json()
    return json?.external?.google ? 'enabled' : 'disabled'
  } catch {
    return 'unknown'
  }
}
