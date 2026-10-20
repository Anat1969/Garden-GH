import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
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

  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="Garden-GH, לדף הבית">
        <img className="brand-logo" src="/logo-anat.png" alt="אד' ענת שטיבלמן" height={40} />
        <span className="brand-name">
          <b>Garden</b>-GH
        </span>
      </Link>
      <nav className="row no-print" aria-label="ניווט ראשי" style={{ gap: 2 }}>
        <Link className={`tab ${loc.pathname.startsWith('/projects') || loc.pathname.startsWith('/p/') ? 'active' : ''}`} to="/projects">
          פרויקטים
        </Link>
        <Link className={`tab ${loc.pathname.startsWith('/prices') ? 'active' : ''}`} to="/prices">
          מחירון
        </Link>
      </nav>
      <div className="topbar-actions no-print">
        <span className={`cloud-chip ${userEmail && cloud === 'synced' ? 'synced' : ''} ${cloud === 'error' ? 'error' : ''}`}>{cloudText}</span>
        <button className="btn small" onClick={copyLink}>
          העתקת קישור
        </button>
        <a className="btn small" href={DEV_CHAT_URL} target="_blank" rel="noreferrer">
          שיחת הפיתוח
        </a>
        {RESEARCH_URL && (
          <a className="btn small" href={RESEARCH_URL} target="_blank" rel="noreferrer">
            פרויקט המחקר
          </a>
        )}
        {installEvt && (
          <button className="btn small primary" onClick={install}>
            התקנת האפליקציה
          </button>
        )}
        <button className="btn small" onClick={openPanel} aria-expanded={panel}>
          {userEmail ? 'חשבון' : 'כניסה'}
        </button>
      </div>
      <AnimatePresence>
        {panel && (
          <motion.div
            className="panel-under card"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {userEmail ? (
              <div className="stack">
                <div>
                  <div className="eyebrow">מחוברת</div>
                  <div style={{ overflowWrap: 'anywhere' }}>{userEmail}</div>
                </div>
                <div className="muted" style={{ fontSize: 14 }}>
                  הפרויקטים והמחירון נשמרים בענן ונגישים מכל מכשיר.
                </div>
                <button className="btn" onClick={() => signOut().then(() => setPanel(false))}>
                  יציאה
                </button>
              </div>
            ) : (
              <div className="stack">
                <div className="h-section">שמירה בענן</div>
                <div className="muted" style={{ fontSize: 14 }}>
                  בלי כניסה, הכול נשמר במכשיר הזה בלבד. עם כניסה, הפרויקטים נשמרים בענן.
                </div>
                {!cloudConfigured ? (
                  <div className="notice">חיבור הענן לא הוגדר בסביבה הזו. העבודה נשמרת במכשיר.</div>
                ) : google === 'checking' ? (
                  <div className="muted">בודקת זמינות כניסה</div>
                ) : google === 'disabled' ? (
                  <div className="notice">כניסה עם Google עדיין לא הופעלה בפרויקט Supabase. העבודה נשמרת במכשיר הזה בינתיים.</div>
                ) : (
                  <button className="btn primary" onClick={() => signInGoogle()}>
                    כניסה עם Google
                  </button>
                )}
                {google === 'unknown' && <div className="muted" style={{ fontSize: 13 }}>לא ניתן היה לוודא שהכניסה פעילה. אפשר לנסות.</div>}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
