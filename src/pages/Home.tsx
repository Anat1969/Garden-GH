import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApp } from '../lib/store'
import { Rise, Tag } from '../components/ui'
import { RouteDemo } from '../components/RouteDemo'
import { PlanThumb } from '../components/PlanThumb'

function HeroVisual() {
  const plates = [
    { z: 0, fill: '#f7f7f4', kind: 'plan' },
    { z: 1, fill: 'rgba(227,236,231,0.92)', kind: 'garden' },
    { z: 2, fill: 'rgba(255,255,255,0.75)', kind: 'model' },
  ]
  return (
    <motion.div className="hero-visual" aria-hidden="true" animate={{ y: [0, -8, 0] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1.4 }}>
      {plates.map((p, i) => (
        <motion.div
          key={p.kind}
          className="layer"
          style={{ background: p.fill, transformStyle: 'preserve-3d' }}
          initial={{ opacity: 0, rotateX: 55, rotateZ: -32, y: 80 - i * 10, scale: 0.78 }}
          animate={{ opacity: 1, rotateX: 55, rotateZ: -32, y: 40 - i * 70, scale: 0.78 }}
          transition={{ duration: 1.1, delay: 0.15 + i * 0.18, ease: [0.2, 0.7, 0.2, 1] }}
        >
          <svg viewBox="0 0 100 90">
            {p.kind === 'plan' && (
              <g stroke="#3d4442" fill="none">
                <rect x="22" y="18" width="46" height="34" strokeWidth="2.2" />
                <line x1="45" y1="18" x2="45" y2="40" strokeWidth="1.4" />
                <line x1="22" y1="36" x2="36" y2="36" strokeWidth="1.4" />
                <path d="M36 52 A7 7 0 0 1 43 45" strokeWidth="0.6" strokeDasharray="1 1" />
                <rect x="6" y="6" width="88" height="78" strokeWidth="0.5" strokeDasharray="3 2" />
                <text x="72" y="80" fontSize="4" fill="#5d6563" stroke="none" fontFamily="IBM Plex Mono">1:100</text>
              </g>
            )}
            {p.kind === 'garden' && (
              <g>
                <rect x="10" y="58" width="44" height="20" fill="#9cc3a2" />
                <rect x="58" y="56" width="30" height="24" fill="#cfc8bb" />
                <rect x="72" y="14" width="16" height="36" fill="#b58b5a" opacity="0.85" />
                <rect x="10" y="10" width="8" height="40" fill="#8a6a48" opacity="0.7" />
                <line x1="6" y1="84" x2="94" y2="84" stroke="#4b3a2a" strokeWidth="1.6" />
              </g>
            )}
            {p.kind === 'model' && (
              <g>
                <rect x="22" y="18" width="46" height="34" fill="#e9ebe8" stroke="#1d2120" strokeWidth="1" />
                <rect x="22" y="18" width="46" height="34" fill="url(#g1)" />
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
                    <stop offset="1" stopColor="#b9c2bd" stopOpacity="0.6" />
                  </linearGradient>
                </defs>
              </g>
            )}
          </svg>
        </motion.div>
      ))}
    </motion.div>
  )
}

export default function Home() {
  const projects = useApp((s) => s.projects)
  const nav = useNavigate()
  const recent = projects.slice(0, 3)

  // פרויקט חדש מתחיל בכתובת: מעבר לטופס בספריית הפרויקטים
  const quickStart = () => nav('/projects#new')

  return (
    <div>
      <section className="hero">
        <Rise>
          <div className="stack" style={{ gap: 20 }}>
            <div className="eyebrow">היתר · מודל · כמויות · תקציב</div>
            <h1 className="h-display">
              מההיתר
              <br />
              אל הגינה.
            </h1>
            <p className="lead">
              מעלים PDF של היתר. המערכת מזהה תוכניות, קנה מידה, קירות ופתחים, ובונה מודל תלת-ממדי של הבית והגינה, כתב כמויות לפי סעיפי מחירון, שלבי
              ביצוע ותקציב עם טווח.
            </p>
            <div className="row">
              <button className="btn primary" onClick={quickStart}>
                פרויקט חדש
              </button>
              <Link className="btn" to="/projects">
                ספריית הפרויקטים
              </Link>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="muted" style={{ fontSize: 14 }}>
                לכל מספר יש תווית:
              </span>
              <Tag label="measured" />
              <Tag label="estimated" />
              <Tag label="assumed" />
            </div>
          </div>
        </Rise>
        <HeroVisual />
      </section>

      <section className="section">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="h-page">המסלול</h2>
          <span className="eyebrow">שישה שלבים, בהדגמה חיה</span>
        </div>
        <RouteDemo />
      </section>

      <section className="section">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="h-page">פרויקטים אחרונים</h2>
          <Link className="btn ghost" to="/projects">
            לכל הפרויקטים
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="card flat">
            <div className="state" style={{ padding: 24 }}>
              <div className="h-section">אין עדיין פרויקטים</div>
              <div>אפשר להתחיל מהיתר אמיתי, או מהיתר לדוגמה שנמצא בתוך מסך ההיתר.</div>
              <button className="btn primary" onClick={quickStart}>
                פרויקט חדש
              </button>
            </div>
          </div>
        ) : (
          <div className="grid-cards">
            {recent.map((p) => (
              <Link key={p.id} to={`/p/${p.id}`} className="card" style={{ textDecoration: 'none' }}>
                <PlanThumb project={p} />
                <div className="eyebrow" style={{ marginTop: 10 }}>{p.permit ? p.permit.fileName : 'ללא היתר'}</div>
                <div className="h-section" style={{ marginTop: 6 }}>
                  {p.name}
                </div>
                <div className="muted" style={{ fontSize: 14 }}>
                  {p.address || 'כתובת לא הוזנה'} · {p.variants.length} חלופות
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="card flat">
          <div className="h-section">מה האפליקציה לא עושה</div>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            רגולציה והיתרים, בטיחות מבנית, קירות תומכים, מים, לחץ, ניקוז לבית, חשמל ותאורה מסומנים "דורש מהנדס או חשמלאי מוסמך". האפליקציה לא
            נותנת חוות דעת הנדסית.
          </p>
        </div>
      </section>
    </div>
  )
}
