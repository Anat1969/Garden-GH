import { useEffect, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdf, savePdf } from './idb'
import { openPdf } from './pdf'
import { downloadPermitFromCloud } from './store'
import type { Project } from './types'

export type DocStatus = 'none' | 'loading' | 'ready' | 'missing' | 'error'

// טוען את קובץ ההיתר מהמכשיר, ואם אינו שם, מהענן.
export function usePermitDoc(project: Project, version = 0) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [status, setStatus] = useState<DocStatus>(project.permit ? 'loading' : 'none')
  const cloudPath = project.permit?.cloudPath
  const hasPermit = Boolean(project.permit)

  useEffect(() => {
    let alive = true
    if (!hasPermit) {
      setStatus('none')
      setDoc(null)
      return
    }
    setStatus('loading')
    ;(async () => {
      try {
        let bytes = await loadPdf(project.id)
        if (!bytes && cloudPath) {
          bytes = await downloadPermitFromCloud(cloudPath)
          if (bytes) await savePdf(project.id, bytes)
        }
        if (!alive) return
        if (!bytes) {
          setStatus('missing')
          return
        }
        const d = await openPdf(bytes)
        if (!alive) return
        setDoc(d)
        setStatus('ready')
      } catch {
        if (alive) setStatus('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [project.id, hasPermit, cloudPath, version])

  return { doc, status }
}
