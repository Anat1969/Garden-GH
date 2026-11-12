import type { DocKind, ProjectDoc } from './types'
import { deleteDocBlob, loadDocBlob, saveDocBlob } from './idb'
import { getState, uid, updateProject } from './store'
import { IMAGE_TYPES } from './imageToPdf'

// מסמכי פרויקט: כל סוג קובץ. נשמרים במכשיר. PDF ותמונה אפשר גם לקרוא כהיתר.

export const MAX_DOC_BYTES = 80 * 1024 * 1024

export function isImage(d: { type: string; name: string }) {
  return IMAGE_TYPES.includes(d.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(d.name)
}
export function isPdf(d: { type: string; name: string }) {
  return d.type === 'application/pdf' || /\.pdf$/i.test(d.name)
}
export const readableAsPermit = (d: { type: string; name: string }) => isPdf(d) || isImage(d)

export function guessKind(f: { name: string; type: string }, isFirstPermit: boolean): DocKind {
  const n = f.name.toLowerCase()
  if (/היתר|permit|גרמושק/.test(n)) return 'permit'
  if (/מדיד|survey/.test(n) || /\.(dwg|dxf)$/.test(n)) return /\.(dwg|dxf)$/.test(n) && !/מדיד|survey/.test(n) ? 'plan' : 'survey'
  if (/כתב.?כמויות|מפרט|spec|boq|\.(xlsx?|csv)$/.test(n)) return 'spec'
  if (/תוכנ|שרטוט|plan|חזית|חתך/.test(n)) return 'plan'
  if (isPdf(f)) return isFirstPermit ? 'permit' : 'plan'
  if (isImage(f)) return 'photo'
  return 'other'
}

export function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export async function addDocuments(projectId: string, files: { file: File; kind: DocKind }[]): Promise<ProjectDoc[]> {
  const added: ProjectDoc[] = []
  for (const { file, kind } of files) {
    const doc: ProjectDoc = { id: uid(), name: file.name, type: file.type || 'application/octet-stream', size: file.size, kind, addedAt: new Date().toISOString() }
    await saveDocBlob(doc.id, file)
    added.push(doc)
  }
  if (added.length) updateProject(projectId, (p) => ({ ...p, documents: [...(p.documents ?? []), ...added] }))
  return added
}

export async function removeDocument(projectId: string, docId: string) {
  updateProject(projectId, (p) => ({ ...p, documents: (p.documents ?? []).filter((d) => d.id !== docId) }))
  await deleteDocBlob(docId).catch(() => undefined)
}

export function setDocKind(projectId: string, docId: string, kind: DocKind) {
  updateProject(projectId, (p) => ({ ...p, documents: (p.documents ?? []).map((d) => (d.id === docId ? { ...d, kind } : d)) }))
}

export async function docFile(d: ProjectDoc): Promise<File | null> {
  const b = await loadDocBlob(d.id)
  return b ? new File([b], d.name, { type: d.type }) : null
}

export async function openDoc(d: ProjectDoc) {
  const b = await loadDocBlob(d.id)
  if (!b) return false
  const url = URL.createObjectURL(new Blob([b], { type: d.type }))
  const a = document.createElement('a')
  a.href = url
  if (isPdf(d) || isImage(d)) a.target = '_blank'
  else a.download = d.name
  a.rel = 'noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return true
}

export const projectDocs = (projectId: string) => getState().projects.find((p) => p.id === projectId)?.documents ?? []
