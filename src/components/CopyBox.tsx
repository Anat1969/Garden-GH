import { useEffect, useRef, useState } from 'react'
import { IconBtn } from './EditIcons'
import { toast } from './ui'
import { deleteDocBlob, loadDocBlob, saveDocBlob } from '../lib/idb'

// מסגרת לתמונה שנוצרה מהפרומפט: הדבקה (Ctrl+V), גרירה או העלאה. נשמרת במכשיר לפי מפתח
export function ImageFrame({ storeKey, label }: { storeKey: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const key = `img:${storeKey}`

  useEffect(() => {
    let alive = true
    let made: string | null = null
    loadDocBlob(key)
      .then((b) => {
        if (b && alive) {
          made = URL.createObjectURL(b)
          setUrl(made)
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [key])

  const put = async (f: Blob | null | undefined) => {
    if (!f || !f.type.startsWith('image/')) {
      toast('אפשר להדביק, לגרור או להעלות תמונה בלבד')
      return
    }
    await saveDocBlob(key, f)
    setUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(f)
    })
    toast('התמונה נשמרה')
  }

  return (
    <div className="img-frame-wrap">
      <div
        className={`img-frame ${over ? 'over' : ''} ${url ? 'has' : ''}`}
        tabIndex={0}
        role="button"
        aria-label={`מסגרת תמונה: ${label}. לחיצה ואז הדבקה, גרירה, או העלאה`}
        data-testid="image-frame"
        onPaste={(e) => {
          const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))
          if (item) {
            e.preventDefault()
            void put(item.getAsFile())
          } else toast('בלוח ההעתקה אין תמונה')
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void put(e.dataTransfer.files[0])
        }}
        onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
      >
        {url ? (
          <img src={url} alt={label} />
        ) : (
          <div className="img-frame-empty">
            <b>מקום לתמונה</b>
            <span>לוחצים כאן ומדביקים (Ctrl+V)</span>
            <span>או גוררים קובץ</span>
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 4 }}>
        <IconBtn icon="upload" label={url ? 'החלפת תמונה' : 'העלאת תמונה'} onClick={() => fileRef.current?.click()} />
        {url && (
          <IconBtn
            icon="delete"
            label="הסרת התמונה"
            className="ghost"
            onClick={() => {
              void deleteDocBlob(key)
              setUrl(null)
            }}
          />
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden data-testid="image-input" onChange={(e) => void put(e.target.files?.[0])} />
    </div>
  )
}

// פרומפט להמחשה: משפט זיקוק, פרומפט עם הפרמטרים, כפתור העתקה אחד, ומסגרת לתמונה שיוצרים ממנו
export function PromptBox({ prompt, title = 'פרומפט להמחשה', imageKey }: { prompt: { distill: string; text: string; mj: string }; title?: string; imageKey?: string }) {
  const full = `${prompt.text} ${prompt.mj}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full)
      toast('הפרומפט הועתק, כולל הפרמטרים')
    } catch {
      window.prompt('העתקה', full)
    }
  }
  return (
    <div className={`prompt-box ${imageKey ? 'with-image' : ''}`} data-testid="prompt-box">
      <div className="prompt-main">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b>{title}</b>
          <IconBtn icon="copy" label="העתקת הפרומפט" onClick={copy} />
        </div>
        <p className="prompt-distill">{prompt.distill}</p>
        <p className="prompt-text">{prompt.text}</p>
        <code className="prompt-mj" dir="ltr">
          {prompt.mj}
        </code>
        <div className="muted" style={{ fontSize: 12 }}>
          ההעתקה כוללת את הפרומפט ואת הפרמטרים. מדביקים בכלי יצירת תמונות, ואת התמונה שנוצרה מדביקים במסגרת.
        </div>
      </div>
      {imageKey && <ImageFrame storeKey={imageKey} label={title} />}
    </div>
  )
}

// תמונה שמורה (לתצוגה בלבד), למשל בכרטיס סגנון סגור
export function StoredImage({ storeKey, alt }: { storeKey: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let made: string | null = null
    let alive = true
    loadDocBlob(`img:${storeKey}`)
      .then((b) => {
        if (b && alive) {
          made = URL.createObjectURL(b)
          setUrl(made)
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [storeKey])
  return url ? <img className="stored-img" src={url} alt={alt} /> : null
}
