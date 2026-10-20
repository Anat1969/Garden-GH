// אחסון קבצים במכשיר (IndexedDB): ההיתר לפי מזהה פרויקט, ומסמכי פרויקט לפי מזהה מסמך.
const DB = 'garden-gh'
const PERMITS = 'permits'
const DOCS = 'docs'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(PERMITS)) db.createObjectStore(PERMITS)
      if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function put(store: string, key: string, value: unknown): Promise<void> {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function get<T>(store: string, key: string): Promise<T | null> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve((req.result as T) ?? null)
    req.onerror = () => reject(req.error)
  })
}

async function del(store: string, key: string): Promise<void> {
  const db = await open()
  await new Promise<void>((resolve) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export const savePdf = (projectId: string, bytes: ArrayBuffer) => put(PERMITS, projectId, bytes)
export const loadPdf = (projectId: string) => get<ArrayBuffer>(PERMITS, projectId)
export const deletePdf = (projectId: string) => del(PERMITS, projectId)

export const saveDocBlob = (docId: string, blob: Blob) => put(DOCS, docId, blob)
export const loadDocBlob = (docId: string) => get<Blob>(DOCS, docId)
export const deleteDocBlob = (docId: string) => del(DOCS, docId)
