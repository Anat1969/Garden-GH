import { useEffect, useRef, useState } from 'react'
import type { Facade, FacadeSide, Project } from '../lib/types'
import { SIDES, SIDE_TEXT, addFacadeFromFile, removeFacade, updateFacade } from '../lib/facades'
import { loadDocBlob } from '../lib/idb'
import { Tag, toast } from './ui'

// חזיתות ההיתר: כל שרטוט חזית עם ארבעה קווים שמסמנים את הבניין בתוכו. גוררים קו כדי לתקן.

type LineKey = 'x0' | 'x1' | 'yGround' | 'yTop'
const LINES: { k: LineKey; t: string; vertical: boolean; color: string }[] = [
  { k: 'x0', t: 'קיר שמאלי', vertical: true, color: '#1f6feb' },
  { k: 'x1', t: 'קיר ימני', vertical: true, color: '#1f6feb' },
  { k: 'yGround', t: '±0.00', vertical: false, color: '#b3261e' },
  { k: 'yTop', t: 'ראש הבניין', vertical: false, color: '#2f5d4a' },
]

export function FacadesPanel({ project }: { project: Project }) {
  const facades = project.facades ?? []
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      let n = 0
      for (const f of Array.from(files)) if (await addFacadeFromFile(project.id, f, null)) n++
      toast(n ? (n === 1 ? 'החזית נוספה. בוחרים צד ובודקים את הקווים.' : `נוספו ${n} חזיתות`) : 'הקובץ לא נקרא כתמונה')
    } catch {
      toast('הקובץ לא נקרא כתמונה. מתאימים PNG ו-JPG.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  return (
    <div className="card" data-testid="facades-panel">
      <div className="h-section" style={{ marginBottom: 4 }}>
        חזיתות ההיתר
      </div>
      <ol className="muted" style={{ margin: '0 0 12px', paddingInlineStart: 20, fontSize: 14 }}>
        <li>
          שרטוטי החזית <b>מולבשים על הבית</b> במודל, כדי שהבית ייראה כמו בהיתר ולא כקופסה.
        </li>
        <li>
          בקריאת ההיתר הם נחתכים לבד. אפשר גם להוסיף <b>תמונה של חזית</b> אחת.
        </li>
        <li>
          ארבעת הקווים מסמנים את <b>קירות הבית, ±0.00 וראש הבניין</b>. גוררים קו כדי לתקן.
        </li>
      </ol>
      {facades.length === 0 && (
        <div className="notice info" style={{ marginBottom: 12 }}>
          עוד אין חזיתות. הן יתווספו בקריאת ההיתר, או מתמונה.
        </div>
      )}
      <div className="facade-grid">
        {facades.map((f) => (
          <FacadeCard key={f.id} projectId={project.id} f={f} />
        ))}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden data-testid="facade-file" onChange={(e) => void add(e.target.files)} />
      <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()} style={{ marginTop: 12 }}>
        {busy ? 'קוראת את התמונה' : 'הוספת חזית מתמונה'}
      </button>
    </div>
  )
}

function FacadeCard({ projectId, f }: { projectId: string; f: Facade }) {
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<LineKey | null>(null)
  useEffect(() => {
    let u = ''
    let dead = false
    void loadDocBlob(f.id).then((b) => {
      if (dead) return
      if (!b) return setMissing(true)
      u = URL.createObjectURL(b)
      setUrl(u)
    })
    return () => {
      dead = true
      if (u) URL.revokeObjectURL(u)
    }
  }, [f.id])
  const move = (e: React.PointerEvent) => {
    const k = drag.current
    const r = boxRef.current?.getBoundingClientRect()
    if (!k || !r) return
    const vertical = k === 'x0' || k === 'x1'
    const v = Math.min(1, Math.max(0, vertical ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height))
    updateFacade(projectId, f.id, { [k]: Math.round(v * 1000) / 1000 })
  }
  return (
    <div className="facade-card" data-testid="facade-card">
      <div className="facade-head">
        <b>{f.title || 'חזית'}</b>
        <Tag label="estimated" />
      </div>
      <div
        ref={boxRef}
        className="facade-img"
        style={{ aspectRatio: `${f.w} / ${f.h}` }}
        onPointerMove={move}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
      >
        {url && <img src={url} alt={`שרטוט ${f.title}`} draggable={false} />}
        {missing && <div className="muted" style={{ padding: 12, fontSize: 13 }}>השרטוט לא נמצא במכשיר הזה. מוסיפים אותו שוב מתמונה.</div>}
        {url &&
          LINES.map((l) => (
            <div
              key={l.k}
              className={`facade-line ${l.vertical ? 'v' : 'h'}`}
              style={l.vertical ? { left: `${f[l.k] * 100}%`, ['--c' as string]: l.color } : { top: `${f[l.k] * 100}%`, ['--c' as string]: l.color }}
              title={`${l.t}: גוררים כדי לתקן`}
              data-testid={`facade-line-${l.k}`}
              onPointerDown={(e) => {
                e.preventDefault()
                drag.current = l.k
              }}
            >
              <span>{l.t}</span>
            </div>
          ))}
      </div>
      <div className="facade-row">
        <label>
          <span>הצד שהחזית פונה אליו</span>
          <select value={f.side ?? ''} data-testid="facade-side" onChange={(e) => updateFacade(projectId, f.id, { side: (e.target.value || null) as FacadeSide | null })}>
            <option value="">לא נבחר</option>
            {SIDES.map((s) => (
              <option key={s} value={s}>
                {SIDE_TEXT[s]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            if (window.confirm(`להסיר את "${f.title || 'החזית'}"?`)) void removeFacade(projectId, f.id).then(() => toast('החזית הוסרה'))
          }}
        >
          הסרה
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        {f.side ? `מוקם ${f.how}.` : 'בוחרים צד כדי שהחזית תופיע במודל.'} ראש הבניין: {f.topRel.toFixed(2)} מ'.
      </div>
    </div>
  )
}
