// אחסון קובצי PDF במכשיר (IndexedDB). קבצים גדולים מדי ל-localStorage.
const DB = 'garden-gh'
const STORE = 'permits'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function savePdf(projectId: string, bytes: ArrayBuffer): Promise<void> {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(bytes, projectId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadPdf(projectId: string): Promise<ArrayBuffer | null> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(projectId)
    req.onsuccess = () => resolve((req.result as ArrayBuffer) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function deletePdf(projectId: string): Promise<void> {
  const db = await open()
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(projectId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}
