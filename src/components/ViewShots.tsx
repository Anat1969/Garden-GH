// תמונות ממבטים: מפיקים תמונה מכל מבט במודל, הופכים אותה לצילום ריאליסטי ב-ChatGPT עם הנחיה מוכנה,
// ושומרים את התמונה שנוצרה ליד המבט (לפני ואחרי). התמונות נשמרות במכשיר (IndexedDB), לכל חלופה בנפרד.
import { useEffect, useState } from 'react'
import type { Project, Variant } from '../lib/types'
import { deleteDocBlob, loadDocBlob, saveDocBlob } from '../lib/idb'
import { realisticPrompt } from '../lib/prompts'
import { STYLES } from '../data/gardenGuide'
import { IconBtn } from './EditIcons'
import { ImageFrame } from './CopyBox'
import { toast } from './ui'

export type ShotView = 'current' | 'bird' | 'top' | 'eye'
export const SHOT_TEXT: Record<ShotView, string> = { current: 'המבט הנוכחי', bird: 'מבט ציפור', top: 'מבט על', eye: 'גובה עיניים' }
const VIEW_PHRASE: Record<ShotView, string> = { current: 'מבט על הגינה', bird: 'מבט ציפור על הגינה', top: 'מבט על אנכי של הגינה, כמו תצלום אוויר', eye: 'מבט מגובה העיניים בתוך הגינה' }

interface Shot {
  id: string
  view: ShotView
  at: string
}

const indexKey = (p: Project, v: Variant) => `shots:${p.id}:${v.id}`
const imgKey = (id: string) => `shot:${id}`

async function loadIndex(key: string): Promise<Shot[]> {
  const b = await loadDocBlob(key)
  if (!b) return []
  try {
    return JSON.parse(await b.text()) as Shot[]
  } catch {
    return []
  }
}
const saveIndex = (key: string, list: Shot[]) => saveDocBlob(key, new Blob([JSON.stringify(list)], { type: 'application/json' }))

function ShotImg({ id, alt }: { id: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let made: string | null = null
    let alive = true
    loadDocBlob(imgKey(id)).then((b) => {
      if (b && alive) {
        made = URL.createObjectURL(b)
        setUrl(made)
      }
    })
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [id])
  return url ? <img className="shot-img" src={url} alt={alt} /> : <div className="shot-img empty">טוען</div>
}

async function copyText(t: string) {
  try {
    await navigator.clipboard.writeText(t)
    return true
  } catch {
    return false
  }
}

export function ViewShots({ project, variant, capture }: { project: Project; variant: Variant; capture: (views: ShotView[]) => Promise<{ view: ShotView; blob: Blob }[]> }) {
  const key = indexKey(project, variant)
  const [shots, setShots] = useState<Shot[]>([])
  const [busy, setBusy] = useState(false)
  const style = STYLES.find((s) => s.id === variant.requirements.style) ?? null

  useEffect(() => {
    let alive = true
    loadIndex(key).then((l) => alive && setShots(l))
    return () => {
      alive = false
    }
  }, [key])

  const take = async (views: ShotView[]) => {
    setBusy(true)
    try {
      const res = await capture(views)
      const made: Shot[] = []
      for (const r of res) {
        const s: Shot = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, view: r.view, at: new Date().toISOString() }
        await saveDocBlob(imgKey(s.id), r.blob)
        made.push(s)
      }
      const list = [...made, ...shots]
      await saveIndex(key, list)
      setShots(list)
      toast(made.length ? `נשמרו ${made.length} תמונות בגלריה של החלופה` : 'לא נוצרה תמונה')
    } catch (e) {
      console.warn(e)
      toast('הפקת התמונה נכשלה במכשיר הזה')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (s: Shot) => {
    const list = shots.filter((x) => x.id !== s.id)
    setShots(list)
    await saveIndex(key, list)
    await deleteDocBlob(imgKey(s.id))
  }

  const download = async (s: Shot) => {
    const b = await loadDocBlob(imgKey(s.id))
    if (!b) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = `${project.name} ${variant.name} ${SHOT_TEXT[s.view]}.png`.replace(/[\\/:*?"<>|]/g, ' ')
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // העתקת התמונה ללוח ופתיחת ChatGPT. אם הדפדפן לא מאפשר העתקת תמונה, היא יורדת כקובץ לגרירה
  const toChatGPT = async (s: Shot) => {
    const b = await loadDocBlob(imgKey(s.id))
    let copied = false
    if (b && 'ClipboardItem' in window) {
      try {
        const png = b.type === 'image/png' ? b : await toPng(b)
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
        copied = true
      } catch {
        copied = false
      }
    }
    if (!copied) await download(s)
    window.open('https://chatgpt.com/', '_blank', 'noopener')
    toast(copied ? 'התמונה הועתקה. ב-ChatGPT: Ctrl+V, ואחר כך "העתקת ההנחיה"' : 'התמונה ירדה כקובץ. גוררים אותה ל-ChatGPT, ואחר כך "העתקת ההנחיה"')
  }

  return (
    <section className="card view-shots" data-testid="view-shots">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div>
          <div className="h-section">תמונות ממבטים</div>
          <div className="muted" style={{ fontSize: 13 }}>
            חלופה "{variant.name}". נשמרות במכשיר.
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <IconBtn icon="camera" label={busy ? 'מפיק...' : 'הפקת תמונות משלושת המבטים'} className="primary" disabled={busy} onClick={() => void take(['bird', 'top', 'eye'])} testId="shots-all" />
          <IconBtn icon="camera" label="צילום המבט הנוכחי" disabled={busy} onClick={() => void take(['current'])} testId="shots-current" />
        </div>
      </div>
      <ol className="steps-list shot-steps">
        <li>
          <b>מפיקים תמונה</b> מהמבטים, או מכוונים מבט ומצלמים אותו.
        </li>
        <li>
          <b>"העתקה ופתיחת ChatGPT"</b>: התמונה מועתקת, ו-ChatGPT נפתח. שם מדביקים אותה ב-Ctrl+V.
        </li>
        <li>
          <b>"העתקת ההנחיה"</b>, מדביקים ב-ChatGPT ושולחים.
        </li>
        <li>
          את התמונה שנוצרה מעתיקים ומדביקים כאן, ב<b>מסגרת התמונה הריאליסטית</b>, או גוררים אותה אליה.
        </li>
      </ol>
      {shots.length === 0 ? (
        <div className="muted" style={{ fontSize: 14 }}>
          עוד אין תמונות. לוחצים על "הפקת תמונות משלושת המבטים".
        </div>
      ) : (
        <div className="shot-grid">
          {shots.map((s) => {
            const prompt = realisticPrompt(variant, style, VIEW_PHRASE[s.view])
            return (
              <article key={s.id} className="shot-card" data-testid="shot-card">
                <div className="shot-pair">
                  <figure>
                    <ShotImg id={s.id} alt={`${SHOT_TEXT[s.view]} מהמודל`} />
                    <figcaption>
                      <b>{SHOT_TEXT[s.view]}</b> · מהמודל
                    </figcaption>
                  </figure>
                  <figure>
                    <ImageFrame storeKey={`real:${s.id}`} label={`התמונה הריאליסטית: ${SHOT_TEXT[s.view]}`} />
                    <figcaption>
                      <b>התמונה הריאליסטית</b> · הדבקה, גרירה או העלאה
                    </figcaption>
                  </figure>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <IconBtn icon="open" label="העתקה ופתיחת ChatGPT" className="primary" onClick={() => void toChatGPT(s)} testId="to-chatgpt" />
                  <IconBtn
                    icon="copy"
                    label="העתקת ההנחיה"
                    onClick={async () => toast((await copyText(prompt)) ? 'ההנחיה הועתקה. מדביקים ב-ChatGPT ושולחים' : 'ההעתקה נחסמה. מסמנים את ההנחיה ומעתיקים ידנית')}
                    testId="copy-real-prompt"
                  />
                  <IconBtn icon="download" label="הורדה" onClick={() => void download(s)} />
                  <IconBtn icon="delete" label="מחיקה" iconOnly onClick={() => void remove(s)} />
                </div>
                <details className="shot-prompt">
                  <summary>ההנחיה ל-ChatGPT</summary>
                  <pre dir="rtl">{prompt}</pre>
                </details>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

async function toPng(b: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(b)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0)
  return await new Promise((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error('png'))), 'image/png'))
}
