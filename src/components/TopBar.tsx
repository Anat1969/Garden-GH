import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { IconBtn } from './EditIcons'
import { AnimatePresence, motion } from 'framer-motion'
import { signInGoogle, signOut, useApp } from '../lib/store'
import { checkGoogle, cloudConfigured, type GoogleStatus } from '../lib/supabase'
import { toast } from './ui'

export const DEV_CHAT_URL = 'https://claude.ai/code/session_01RD25BsdPM7ARdirdAi9RUC'
export const RESEARCH_URL = '' // מוצג רק כשיש קישור לפרויקט המחקר

interface BIPEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}

export function TopBar() {
  const loc = useLocation()
  const nav = useNavigate()
  const userEmail = useApp((s) => s.userEmail)
  const cloud = useApp((s) => s.cloud)
  const [panel, setPanel] = useState(false)
  const [google, setGoogle] = useState<GoogleStatus | 'checking'>('checking')
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null)

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as BIPEvent)
    }
    const onInstalled = () => setInstallEvt(null)
    window.addEventListener('beforeinstallprompt', onBip)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    setPanel(false)
  }, [loc.pathname])

  // סגירה ב-Escape ובלחיצה מחוץ לתפריט
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanel(false)
        btnRef.current?.focus()
      }
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setPanel(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [panel])

  const openPanel = async () => {
    setPanel((p) => !p)
    if (google === 'checking') setGoogle(await checkGoogle())
  }

  const copyLink = async () => {
    const href = window.location.href
    try {
      await navigator.clipboard.writeText(href)
      toast('הקישור הועתק')
    } catch {
      window.prompt('העתיקי את הקישור', href)
    }
  }

  const install = async () => {
    if (!installEvt) return
    await installEvt.prompt()
    setInstallEvt(null)
  }

  const cloudText = !userEmail ? 'שמור במכשיר' : cloud === 'syncing' ? 'מסנכרן' : cloud === 'error' ? 'שגיאת סנכרון' : 'שמור בענן'

  const here = (path: string) => (path === '/' ? loc.pathname === '/' : loc.pathname.startsWith(path) || (path === '/projects' && loc.pathname.startsWith('/p/')))

  return (
    <header className="topbar">
      {loc.pathname !== '/' && (
        <IconBtn
          icon="back"
          label="חזרה לדף הקודם"
          iconOnly
          className="back-btn no-print"
          onClick={() => {
            // יש היסטוריה בתוך האפליקציה: חוזרים אחורה. אחרת עולים רמה אחת
            if ((window.history.state?.idx ?? 0) > 0) nav(-1)
            else nav(loc.pathname.startsWith('/p/') ? '/projects' : '/')
          }}
        />
      )}
      <Link to="/" className="brand" aria-label="תכנון גינה, לדף הבית">
        <img className="brand-icon" src="/icon.svg" alt="" width={36} height={36} />
        <span className="brand-name">
          <b>תכנון גינה</b>
        </span>
      </Link>
      <span className={`cloud-chip no-print ${userEmail && cloud === 'synced' ? 'synced' : ''} ${cloud === 'error' ? 'error' : ''}`}>{cloudText}</span>
      <button
        ref={btnRef}
        className={`logo-btn no-print ${panel ? 'open' : ''}`}
        onClick={openPanel}
        aria-expanded={panel}
        aria-haspopup="true"
        aria-controls="system-menu"
        aria-label="תפריט המערכת"
        title="תפריט המערכת"
      >
        <img className="brand-logo" src="/logo-anat.png" alt="" height={40} />
      </button>
      <AnimatePresence>
        {panel && (
          <motion.div
            ref={menuRef}
            id="system-menu"
            className="panel-under system-menu card"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <div className="menu-head">
              <img src="/logo-anat.png" alt="אד' ענת שטיבלמן" height={44} />
              <span className={`cloud-chip ${userEmail && cloud === 'synced' ? 'synced' : ''} ${cloud === 'error' ? 'error' : ''}`}>{cloudText}</span>
            </div>
            <nav className="menu-group" aria-label="ניווט ראשי">
              <Link className={`menu-item ${here('/') ? 'active' : ''}`} to="/">
                דף הבית
              </Link>
              <Link className={`menu-item ${here('/projects') ? 'active' : ''}`} to="/projects">
                פרויקטים
              </Link>
              <Link className={`menu-item ${here('/prices') ? 'active' : ''}`} to="/prices">
                מחירון
              </Link>
              <Link className={`menu-item ${here('/guide') ? 'active' : ''}`} to="/guide">
                מדריך גינות
              </Link>
            </nav>
            <div className="menu-group">
              <button className="menu-item" onClick={copyLink}>
                העתקת קישור
              </button>
              <a className="menu-item" href={DEV_CHAT_URL} target="_blank" rel="noreferrer">
                שיחת הפיתוח
              </a>
              {RESEARCH_URL && (
                <a className="menu-item" href={RESEARCH_URL} target="_blank" rel="noreferrer">
                  פרויקט המחקר
                </a>
              )}
              {installEvt && (
                <button className="menu-item strong" onClick={install}>
                  התקנת האפליקציה
                </button>
              )}
            </div>
            <div className="menu-group account">
              {userEmail ? (
                <div className="stack" style={{ gap: 8 }}>
                  <div>
                    <div className="eyebrow">מחוברת</div>
                    <div style={{ overflowWrap: 'anywhere' }}>{userEmail}</div>
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    הפרויקטים והמחירון נשמרים בענן ונגישים מכל מכשיר.
                  </div>
                  <button className="btn small" onClick={() => signOut().then(() => setPanel(false))}>
                    יציאה
                  </button>
                </div>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  <div className="eyebrow">כניסה ושמירה בענן</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    בלי כניסה, הכול נשמר במכשיר הזה בלבד. עם כניסה, הפרויקטים נשמרים בענן.
                  </div>
                  {!cloudConfigured ? (
                    <div className="notice">חיבור הענן לא הוגדר בסביבה הזו. העבודה נשמרת במכשיר.</div>
                  ) : google === 'checking' ? (
                    <div className="muted">בודקת זמינות כניסה</div>
                  ) : google === 'disabled' ? (
                    <div className="notice">כניסה עם Google עדיין לא הופעלה בפרויקט Supabase. העבודה נשמרת במכשיר הזה בינתיים.</div>
                  ) : (
                    <button className="btn small primary" onClick={() => signInGoogle()}>
                      כניסה עם Google
                    </button>
                  )}
                  {google === 'unknown' && <div className="muted" style={{ fontSize: 12 }}>לא ניתן היה לוודא שהכניסה פעילה. אפשר לנסות.</div>}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
