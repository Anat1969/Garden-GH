import { useSyncExternalStore } from 'react'
import type { Element, PriceItem, Project, Requirements, Variant } from './types'
import { getClient } from './supabase'
import { deletePdf } from './idb'

// מאגר מקומי-תחילה: הכול נשמר במכשיר מיד, ומסונכרן לענן כשיש משתמשת מחוברת.

const LS_PROJECTS = 'garden-gh:projects'
const LS_PRICES = 'garden-gh:prices'

export type CloudState = 'local' | 'syncing' | 'synced' | 'error'

export interface AppState {
  projects: Project[]
  prices: PriceItem[]
  userEmail: string | null
  userId: string | null
  cloud: CloudState
  cloudError: string | null
  ready: boolean
}

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

let state: AppState = {
  projects: readLS<Project[]>(LS_PROJECTS, []),
  prices: readLS<PriceItem[]>(LS_PRICES, []),
  userEmail: null,
  userId: null,
  cloud: 'local',
  cloudError: null,
  ready: false,
}

const listeners = new Set<() => void>()
function emit() {
  listeners.forEach((l) => l())
}
function set(patch: Partial<AppState>) {
  state = { ...state, ...patch }
  emit()
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => selector(state),
  )
}

export const getState = () => state

function persistProjects() {
  try {
    localStorage.setItem(LS_PROJECTS, JSON.stringify(state.projects))
  } catch {
    set({ cloudError: 'האחסון במכשיר מלא. כדאי להתחבר ולשמור בענן.' })
  }
}
function persistPrices() {
  try {
    localStorage.setItem(LS_PRICES, JSON.stringify(state.prices))
  } catch {
    /* מחירון גדול מדי לאחסון המקומי, נשמר רק בזיכרון */
  }
}

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

export const emptyRequirements = (): Requirements => ({ functions: '', plants: '', materials: '', budget: null, constraints: '' })

export function newVariant(name: string, from?: Variant): Variant {
  return {
    id: uid(),
    name,
    createdAt: new Date().toISOString(),
    note: '',
    elements: from ? structuredClone(from.elements) : [],
    requirements: from ? structuredClone(from.requirements) : emptyRequirements(),
    assignments: from ? { ...from.assignments } : {},
  }
}

export function createProject(name: string, address: string): Project {
  const base = newVariant('בסיס')
  const now = new Date().toISOString()
  const p: Project = {
    id: uid(),
    name,
    address,
    north: 0,
    soil: '',
    levelsNote: '',
    permit: null,
    variants: [base],
    activeVariantId: base.id,
    createdAt: now,
    updatedAt: now,
  }
  set({ projects: [p, ...state.projects] })
  persistProjects()
  queueCloudSave(p.id)
  return p
}

export function updateProject(id: string, fn: (p: Project) => Project) {
  const projects = state.projects.map((p) => (p.id === id ? { ...fn(p), updatedAt: new Date().toISOString() } : p))
  set({ projects })
  persistProjects()
  queueCloudSave(id)
}

export function activeVariant(p: Project): Variant {
  return p.variants.find((v) => v.id === p.activeVariantId) ?? p.variants[0]
}

export function updateVariant(projectId: string, fn: (v: Variant) => Variant) {
  updateProject(projectId, (p) => ({
    ...p,
    variants: p.variants.map((v) => (v.id === p.activeVariantId ? fn(v) : v)),
  }))
}

export function upsertElement(projectId: string, el: Element) {
  updateVariant(projectId, (v) => {
    const exists = v.elements.some((e) => e.id === el.id)
    return { ...v, elements: exists ? v.elements.map((e) => (e.id === el.id ? el : e)) : [...v.elements, el] }
  })
}

export function removeElement(projectId: string, id: string) {
  updateVariant(projectId, (v) => ({
    ...v,
    // מחיקת קיר מוחקת גם את הפתחים שמקושרים אליו
    elements: v.elements.filter((e) => e.id !== id && !(e.kind === 'opening' && e.wallId === id)),
  }))
}

export async function deleteProject(id: string) {
  set({ projects: state.projects.filter((p) => p.id !== id) })
  persistProjects()
  deletePdf(id).catch(() => undefined)
  const client = await getClient()
  if (client && state.userId) {
    await client.from('garden_projects').delete().eq('id', id)
  }
}

export function setPrices(prices: PriceItem[]) {
  set({ prices })
  persistPrices()
  void pushPrices()
}

// ---------- ענן ----------

const timers = new Map<string, number>()
function queueCloudSave(id: string) {
  if (!state.userId) return
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.set(
    id,
    window.setTimeout(() => {
      timers.delete(id)
      void pushProject(id)
    }, 700),
  )
}

async function pushProject(id: string) {
  const client = await getClient()
  const p = state.projects.find((x) => x.id === id)
  if (!client || !p || !state.userId) return
  set({ cloud: 'syncing' })
  const { error } = await client
    .from('garden_projects')
    .upsert({ id: p.id, owner_id: state.userId, name: p.name, address: p.address, data: p })
  set(error ? { cloud: 'error', cloudError: 'השמירה בענן נכשלה. העבודה שמורה במכשיר.' } : { cloud: 'synced', cloudError: null })
}

async function pushPrices() {
  const client = await getClient()
  if (!client || !state.userId) return
  set({ cloud: 'syncing' })
  const del = await client.from('garden_price_items').delete().eq('owner_id', state.userId)
  if (del.error) {
    set({ cloud: 'error', cloudError: 'שמירת המחירון בענן נכשלה.' })
    return
  }
  if (state.prices.length) {
    const rows = state.prices.map((i) => ({
      owner_id: state.userId,
      code: i.code,
      description: i.description,
      unit: i.unit,
      price: i.price,
      category: i.category,
      verified: i.verified,
      source: i.source,
      price_date: i.date || null,
    }))
    const ins = await client.from('garden_price_items').insert(rows)
    if (ins.error) {
      set({ cloud: 'error', cloudError: 'שמירת המחירון בענן נכשלה.' })
      return
    }
  }
  set({ cloud: 'synced', cloudError: null })
}

async function pullAll() {
  const client = await getClient()
  if (!client || !state.userId) return
  set({ cloud: 'syncing' })
  const { data, error } = await client.from('garden_projects').select('id, data, updated_at')
  if (error) {
    set({ cloud: 'error', cloudError: 'טעינת הפרויקטים מהענן נכשלה. מוצגים הפרויקטים שבמכשיר.' })
    return
  }
  const byId = new Map(state.projects.map((p) => [p.id, p]))
  const toPush: string[] = []
  for (const row of data ?? []) {
    const remote = row.data as Project
    if (!remote?.id) continue
    const local = byId.get(remote.id)
    if (!local || remote.updatedAt > local.updatedAt) byId.set(remote.id, remote)
  }
  const remoteIds = new Set((data ?? []).map((r) => r.id as string))
  for (const p of state.projects) if (!remoteIds.has(p.id)) toPush.push(p.id)
  const projects = [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  set({ projects })
  persistProjects()
  for (const id of toPush) await pushProject(id)

  const prices = await client.from('garden_price_items').select('*')
  if (!prices.error) {
    if (prices.data && prices.data.length) {
      set({
        prices: prices.data.map((r) => ({
          code: r.code,
          description: r.description,
          unit: r.unit,
          price: Number(r.price),
          category: r.category ?? '',
          verified: Boolean(r.verified),
          source: r.source ?? '',
          date: r.price_date ?? '',
        })),
      })
      persistPrices()
    } else if (state.prices.length) {
      await pushPrices()
    }
  }
  set({ cloud: 'synced' })
}

export async function initAuth() {
  const client = await getClient()
  if (!client) {
    set({ ready: true })
    return
  }
  const apply = (session: { user: { id: string; email?: string } } | null) => {
    const prev = state.userId
    set({ userId: session?.user.id ?? null, userEmail: session?.user.email ?? null, cloud: session ? state.cloud : 'local' })
    if (session && prev !== session.user.id) void pullAll()
  }
  try {
    const { data } = await client.auth.getSession()
    apply(data.session)
  } catch {
    /* ללא ענן */
  }
  client.auth.onAuthStateChange((_e, session) => apply(session))
  set({ ready: true })
}

export async function signInGoogle() {
  const client = await getClient()
  if (!client) return
  await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } })
}

export async function signOut() {
  const client = await getClient()
  if (client) await client.auth.signOut()
  set({ userId: null, userEmail: null, cloud: 'local' })
}

export async function uploadPermitToCloud(projectId: string, bytes: ArrayBuffer): Promise<string | null> {
  const client = await getClient()
  if (!client || !state.userId) return null
  const path = `${state.userId}/${projectId}.pdf`
  const { error } = await client.storage.from('garden-permits').upload(path, new Blob([bytes], { type: 'application/pdf' }), { upsert: true })
  return error ? null : path
}

export async function downloadPermitFromCloud(path: string): Promise<ArrayBuffer | null> {
  const client = await getClient()
  if (!client || !state.userId) return null
  const { data, error } = await client.storage.from('garden-permits').download(path)
  if (error || !data) return null
  return data.arrayBuffer()
}
