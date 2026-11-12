import { useRef, useState } from 'react'
import type { DocKind, Project, ProjectDoc } from '../lib/types'
import { DOC_KIND_TEXT } from '../lib/types'
import { MAX_DOC_BYTES, addDocuments, fmtSize, guessKind, openDoc, readableAsPermit, removeDocument, setDocKind } from '../lib/docs'
import { toast } from './ui'

export interface DraftDoc {
  key: string
  file: File
  kind: DocKind
}

const ext = (name: string) => (name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? 'קובץ').toUpperCase()

// אזור גרירה ובחירת קבצים: כל סוג, כמה בבת אחת
function DropZone({ onFiles, compact }: { onFiles: (files: File[]) => void; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      className={`doc-drop ${over ? 'over' : ''} ${compact ? 'compact' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        onFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <div>
        <div style={{ fontWeight: 500 }}>גוררים לכאן מסמכים, או</div>
        <div className="muted" style={{ fontSize: 13 }}>
          כל סוג קובץ: PDF, תמונות, DWG, Excel, Word ועוד. עד 80MB לקובץ.
        </div>
      </div>
      <button type="button" className="btn small" onClick={() => ref.current?.click()}>
        הוספת מסמכים
      </button>
      <input
        ref={ref}
        type="file"
        multiple
        hidden
        data-testid="doc-input"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
    </div>
  )
}

function filterSize(files: File[]) {
  const ok = files.filter((f) => f.size <= MAX_DOC_BYTES)
  if (ok.length < files.length) toast(`${files.length - ok.length} קבצים גדולים מ-80MB לא נוספו`)
  return ok
}

function KindSelect({ value, onChange, name }: { value: DocKind; onChange: (k: DocKind) => void; name: string }) {
  return (
    <select className="input small" value={value} onChange={(e) => onChange(e.target.value as DocKind)} aria-label={`סוג המסמך ${name}`}>
      {(Object.keys(DOC_KIND_TEXT) as DocKind[]).map((k) => (
        <option key={k} value={k}>
          {DOC_KIND_TEXT[k]}
        </option>
      ))}
    </select>
  )
}

// רשימת טיוטה בטופס פרויקט חדש: הקבצים עוד לא נשמרו
export function DraftDocs({ docs, setDocs }: { docs: DraftDoc[]; setDocs: (d: DraftDoc[]) => void }) {
  const add = (files: File[]) => {
    let hasPermit = docs.some((d) => d.kind === 'permit')
    const next = filterSize(files).map((file) => {
      const kind = guessKind(file, !hasPermit)
      if (kind === 'permit') hasPermit = true
      return { key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, file, kind }
    })
    setDocs([...docs, ...next])
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <DropZone onFiles={add} compact={docs.length > 0} />
      {docs.length > 0 && (
        <ul className="doc-list" aria-label="מסמכים שיצורפו">
          {docs.map((d) => (
            <li key={d.key} className="doc-row">
              <span className="doc-ext">{ext(d.file.name)}</span>
              <span className="doc-name">{d.file.name}</span>
              <span className="muted doc-size">{fmtSize(d.file.size)}</span>
              <KindSelect name={d.file.name} value={d.kind} onChange={(k) => setDocs(docs.map((x) => (x.key === d.key ? { ...x, kind: k } : x)))} />
              <button type="button" className="btn small ghost" onClick={() => setDocs(docs.filter((x) => x.key !== d.key))} aria-label={`הסרת ${d.file.name}`}>
                הסרה
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// מסמכי פרויקט קיים: הוספה, הסרה, פתיחה, שינוי סוג, וקריאה כהיתר
export function ProjectDocs({ project, onReadAsPermit }: { project: Project; onReadAsPermit?: (d: ProjectDoc) => void }) {
  const docs = project.documents ?? []
  const [busy, setBusy] = useState(false)
  const add = async (files: File[]) => {
    const ok = filterSize(files)
    if (!ok.length) return
    setBusy(true)
    try {
      let hasPermit = docs.some((d) => d.kind === 'permit') || Boolean(project.permit)
      await addDocuments(
        project.id,
        ok.map((file) => {
          const kind = guessKind(file, !hasPermit)
          if (kind === 'permit') hasPermit = true
          return { file, kind }
        }),
      )
      toast(ok.length === 1 ? 'המסמך נוסף' : `נוספו ${ok.length} מסמכים`)
    } catch {
      toast('שמירת המסמכים נכשלה. ייתכן שאין מקום פנוי במכשיר.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack" style={{ gap: 8 }} data-testid="project-docs">
      {docs.length === 0 ? (
        <div className="muted" style={{ fontSize: 14 }}>
          אין עדיין מסמכים בפרויקט.
        </div>
      ) : (
        <ul className="doc-list" aria-label="מסמכי הפרויקט">
          {docs.map((d) => (
            <li key={d.id} className="doc-row">
              <span className="doc-ext">{ext(d.name)}</span>
              <button type="button" className="doc-name linklike" onClick={() => openDoc(d).then((ok) => ok || toast('הקובץ לא נמצא במכשיר הזה'))}>
                {d.name}
              </button>
              <span className="muted doc-size">{fmtSize(d.size)}</span>
              <KindSelect name={d.name} value={d.kind} onChange={(k) => setDocKind(project.id, d.id, k)} />
              {onReadAsPermit && readableAsPermit(d) && (
                <button type="button" className="btn small" onClick={() => onReadAsPermit(d)}>
                  קריאה כהיתר
                </button>
              )}
              <button
                type="button"
                className="btn small ghost"
                onClick={() => {
                  if (window.confirm(`להסיר את "${d.name}" מהפרויקט?`)) void removeDocument(project.id, d.id).then(() => toast('המסמך הוסר'))
                }}
                aria-label={`הסרת ${d.name}`}
              >
                הסרה
              </button>
            </li>
          ))}
        </ul>
      )}
      <DropZone onFiles={(f) => void add(f)} compact={docs.length > 0} />
      {busy && <div className="muted">שומרת מסמכים</div>}
      <div className="muted" style={{ fontSize: 12 }}>
        המסמכים נשמרים במכשיר הזה.
      </div>
    </div>
  )
}
