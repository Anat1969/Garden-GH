// הדגמה מונפשת של המסלול בדף הבית: היתר, קירות, גינה, מודל, כמויות, שלבים.
// מתקדמת לבד, נעצרת במעבר עכבר, ואפשר לבחור שלב. בהעדפת תנועה מופחתת אין התקדמות אוטומטית.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'

// אותם שישה שלבים כמו בלשוניות הפרויקט (src/pages/ProjectLayout.tsx)
export const STEPS = [
  { t: 'פרויקט והיתר', d: 'פרטים ודרישות, העלאת היתר (PDF או סריקה), וקריאת מידות וקנה מידה.' },
  { t: 'תוכנית: קירות ופתחים', d: 'קירות ופתחים שזוהו מסומנים "מוערך". בודקים, מתקנים ומאשרים בתוכנית.' },
  { t: 'תכנון הגינה', d: 'אתגרי האתר והצעה תכנונית, ואז משטחים, צמחייה, פרגולה ושבילים, ידנית או לפי דרישות הלקוח.' },
  { t: 'מודל ואקלים', d: 'הבית והגינה בתלת-ממד, עם שמש, צל, רוח ומקומות נוחים לישיבה.' },
  { t: 'כמויות ותקציב', d: 'כתב כמויות לפי מחירון, טווח עלות, וסדר ביצוע עם תקציב לכל שלב.' },
  { t: 'הגשה וחלופות', d: 'גליון להדפסה עם הדמיה ותוכניות, וחלופות לאותו פרויקט.' },
]

const DUR = 4200
const C = { ink: '#2a2f2d', line: '#c2c8c4', accent: '#2f5d4a', lawn: '#8fbf86', deck: '#b88a55', paving: '#bdb6a8', bed: '#9b7653', tree: '#4f7d47', hedge: '#4f7d47', house: '#eceae4', est: '#8a5a00' }

// בית ומגרש ביחידות שרטוט (קנה 1:100 מדומה)
const LOT = { x: 40, y: 30, w: 320, h: 230 }
const HOUSE = { x: 70, y: 50, w: 150, h: 100 }

function Sheet({ step }: { step: number }) {
  const scanning = step === 0
  return (
    <g>
      <rect x={20} y={14} width={360} height={262} fill="#fbfbfa" stroke={C.line} strokeWidth={1} />
      <rect x={26} y={20} width={348} height={250} fill="none" stroke={C.line} strokeWidth={0.6} strokeDasharray="4 3" />
      {/* חותמת גיליון */}
      <g opacity={step <= 1 ? 1 : 0.35} style={{ transition: 'opacity .6s' }}>
        <rect x={300} y={236} width={68} height={28} fill="none" stroke={C.ink} strokeWidth={0.6} />
        <text x={334} y={254} fontSize={9} textAnchor="middle" fill={C.ink} fontFamily="IBM Plex Mono">1:100</text>
      </g>
      {/* השרטוט הסרוק: קווים דקים של תוכנית וחזית, לפני הזיהוי */}
      {step === 0 && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} stroke="#8a918e" strokeWidth={0.8} fill="none">
          <rect x={HOUSE.x} y={HOUSE.y} width={HOUSE.w} height={HOUSE.h} />
          <rect x={HOUSE.x + 3} y={HOUSE.y + 3} width={HOUSE.w - 6} height={HOUSE.h - 6} strokeDasharray="2 2" />
          <path d={`M${HOUSE.x + 70} ${HOUSE.y} V${HOUSE.y + 60} M${HOUSE.x} ${HOUSE.y + 55} H${HOUSE.x + 40}`} />
          <path d="M240 60h100v70H240zM250 150h80v60h-80zM60 175h150l18 70H52z" strokeDasharray="3 3" />
          <path d="M238 248h56M238 248v-16h56v16M246 232l20-10 20 10" />
        </motion.g>
      )}
      {/* גבול מגרש */}
      <motion.rect x={LOT.x} y={LOT.y} width={LOT.w} height={LOT.h} fill="none" stroke="#6b4f36" strokeWidth={1.2} strokeDasharray="6 4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
      {/* קווי מידה */}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }}>
        <line x1={HOUSE.x} y1={HOUSE.y - 12} x2={HOUSE.x + HOUSE.w} y2={HOUSE.y - 12} stroke={C.ink} strokeWidth={0.6} />
        <line x1={HOUSE.x} y1={HOUSE.y - 16} x2={HOUSE.x} y2={HOUSE.y - 8} stroke={C.ink} strokeWidth={0.6} />
        <line x1={HOUSE.x + HOUSE.w} y1={HOUSE.y - 16} x2={HOUSE.x + HOUSE.w} y2={HOUSE.y - 8} stroke={C.ink} strokeWidth={0.6} />
        <text x={HOUSE.x + HOUSE.w / 2} y={HOUSE.y - 15} fontSize={8} textAnchor="middle" fill={C.ink} fontFamily="IBM Plex Mono">15.00</text>
        <line x1={HOUSE.x - 12} y1={HOUSE.y} x2={HOUSE.x - 12} y2={HOUSE.y + HOUSE.h} stroke={C.ink} strokeWidth={0.6} />
        <text x={HOUSE.x - 15} y={HOUSE.y + HOUSE.h / 2} fontSize={8} textAnchor="middle" fill={C.ink} fontFamily="IBM Plex Mono" transform={`rotate(-90 ${HOUSE.x - 15} ${HOUSE.y + HOUSE.h / 2})`}>10.00</text>
      </motion.g>
      {/* קו סריקה */}
      {scanning && (
        <motion.g initial={{ y: 0 }} animate={{ y: [0, 240, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
          <rect x={22} y={16} width={356} height={14} fill="url(#scanGrad)" />
          <line x1={22} y1={30} x2={378} y2={30} stroke={C.accent} strokeWidth={1.2} />
        </motion.g>
      )}
    </g>
  )
}

function Walls({ step }: { step: number }) {
  const { x, y, w, h } = HOUSE
  const outline = `M${x} ${y} H${x + w} V${y + h} H${x + 90} M${x + 60} ${y + h} H${x} Z`
  const inner = `M${x + 70} ${y} V${y + 60} M${x} ${y + 55} H${x + 40} M${x + 100} ${y + 60} H${x + w}`
  const approved = step >= 2
  const col = approved ? C.ink : '#b07a1a'
  return (
    <g>
      <motion.path d={outline} fill="none" stroke={col} strokeWidth={5} strokeLinejoin="miter" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: 'easeInOut' }} />
      <motion.path d={inner} fill="none" stroke={col} strokeWidth={2.5} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.9, duration: 1, ease: 'easeInOut' }} />
      {/* פתח יציאה לגינה עם קשת דלת */}
      <motion.path d={`M${x + 60} ${y + h} A30 30 0 0 0 ${x + 90} ${y + h + 30 - 30}`} fill="none" stroke={col} strokeWidth={0.8} strokeDasharray="2 2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }} />
      <motion.g initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8 }}>
        <rect x={x + w - 64} y={y + h - 24} width={58} height={16} rx={8} fill={approved ? '#e2f0e8' : '#fbefd6'} />
        <text x={x + w - 35} y={y + h - 13} fontSize={8.5} textAnchor="middle" fill={approved ? '#2f6b4f' : C.est}>
          {approved ? 'מאושר' : 'מוערך'}
        </text>
      </motion.g>
    </g>
  )
}

function Garden() {
  const pop = (i: number) => ({ initial: { opacity: 0, scale: 0.6 }, animate: { opacity: 1, scale: 1 }, transition: { delay: 0.25 + i * 0.22, type: 'spring' as const, stiffness: 180, damping: 16 } })
  return (
    <g>
      <motion.polygon points="60,170 210,170 230,250 50,250" fill="url(#lawnPat)" stroke="rgba(0,0,0,.15)" {...pop(0)} style={{ transformOrigin: '140px 210px' }} />
      <motion.rect x={240} y={150} width={100} height={70} fill="url(#deckPat)" stroke="rgba(0,0,0,.15)" {...pop(1)} style={{ transformOrigin: '290px 185px' }} />
      <motion.rect x={240} y={50} width={100} height={80} fill="url(#pavePat)" stroke="rgba(0,0,0,.15)" {...pop(2)} style={{ transformOrigin: '290px 90px' }} />
      <motion.path d="M248 228 Q260 236 290 234 T340 240" fill="none" stroke={C.bed} strokeWidth={8} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1, duration: 0.8 }} />
      <motion.path d={`M${LOT.x + 6} ${LOT.y + LOT.h - 6} H${LOT.x + LOT.w - 6}`} stroke={C.hedge} strokeWidth={6} strokeLinecap="round" strokeDasharray="1 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.3, duration: 1 }} />
      {[
        [90, 205, 16],
        [180, 230, 12],
        [320, 70, 14],
        [258, 140, 9],
      ].map(([cx, cy, r], i) => (
        <motion.g key={i} {...pop(3 + i)} style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <circle cx={cx} cy={cy} r={r} fill={C.tree} fillOpacity={0.85} stroke="#2e4f2a" strokeWidth={0.8} />
          <circle cx={cx} cy={cy} r={1.4} fill="#2e4f2a" />
        </motion.g>
      ))}
      {/* פרגולה מעל הדק */}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.9 }}>
        <rect x={250} y={158} width={80} height={54} fill="none" stroke="#7a5a3a" strokeWidth={1.4} />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <line key={i} x1={256 + i * 11} y1={158} x2={256 + i * 11} y2={212} stroke="#7a5a3a" strokeWidth={0.8} />
        ))}
      </motion.g>
    </g>
  )
}

// מבט איזומטרי: נקודה בתוכנית (x, y) וגובה z אל מסך
const iso = (x: number, y: number, z: number): [number, number] => [200 + (x - y) * 0.62, 70 + (x + y) * 0.36 - z]
const poly = (pts: [number, number, number][]) => pts.map((p) => iso(...p).join(',')).join(' ')

function Model() {
  const H = useMotionValue(0)
  useEffect(() => {
    const c = animate(H, 46, { duration: 1.6, ease: [0.2, 0.7, 0.2, 1], delay: 0.2 })
    return () => c.stop()
  }, [H])
  // בית: מלבן 0..150 על 0..100 ביחידות התוכנית, היסט לפי המגרש
  const hx = HOUSE.x - LOT.x
  const hy = HOUSE.y - LOT.y
  const hw = HOUSE.w
  const hd = HOUSE.h
  const front = useTransform(H, (z) => poly([[hx, hy + hd, 0], [hx + hw, hy + hd, 0], [hx + hw, hy + hd, z], [hx, hy + hd, z]]))
  const side = useTransform(H, (z) => poly([[hx + hw, hy, 0], [hx + hw, hy + hd, 0], [hx + hw, hy + hd, z], [hx + hw, hy, z]]))
  const roof = useTransform(H, (z) => poly([[hx, hy, z], [hx + hw, hy, z], [hx + hw, hy + hd, z], [hx, hy + hd, z]]))
  const door = useTransform(H, (z) => poly([[hx + 60, hy + hd, 0], [hx + 88, hy + hd, 0], [hx + 88, hy + hd, Math.min(z, 30)], [hx + 60, hy + hd, Math.min(z, 30)]]))
  const win = useTransform(H, (z) => poly([[hx + hw, hy + 20, Math.min(z, 16)], [hx + hw, hy + 50, Math.min(z, 16)], [hx + hw, hy + 50, Math.min(z, 34)], [hx + hw, hy + 20, Math.min(z, 34)]]))
  const surf = (x: number, y: number, w: number, d: number) => poly([[x, y, 0], [x + w, y, 0], [x + w, y + d, 0], [x, y + d, 0]])
  const trees: [number, number, number][] = [
    [50, 175, 16],
    [140, 200, 12],
    [280, 40, 14],
    [218, 110, 9],
  ]
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <polygon points={surf(0, 0, LOT.w, LOT.h)} fill="#e6eae4" stroke="#6b4f36" strokeDasharray="5 4" strokeWidth={1} />
      <polygon points={poly([[20, 140, 0], [170, 140, 0], [190, 220, 0], [10, 220, 0]])} fill={C.lawn} />
      <polygon points={surf(200, 120, 100, 70)} fill={C.deck} />
      <polygon points={surf(200, 20, 100, 80)} fill={C.paving} />
      <polyline points={poly([[6, LOT.h - 6, 0], [LOT.w - 6, LOT.h - 6, 0]])} stroke={C.hedge} strokeWidth={5} strokeLinecap="round" />
      <motion.polygon points={side} fill="#d9d7cf" stroke={C.ink} strokeWidth={0.8} />
      <motion.polygon points={front} fill={C.house} stroke={C.ink} strokeWidth={0.8} />
      <motion.polygon points={door} fill="#7a5a3a" />
      <motion.polygon points={win} fill="#9fd0e0" opacity={0.8} />
      <motion.polygon points={roof} fill="#f6f5f1" stroke={C.ink} strokeWidth={0.8} />
      {/* פרגולה */}
      {[
        [210, 128],
        [290, 128],
        [210, 182],
        [290, 182],
      ].map(([x, y], i) => {
        const [a, b] = iso(x, y, 0)
        const [, c] = iso(x, y, 30)
        return <line key={i} x1={a} y1={b} x2={a} y2={c} stroke="#7a5a3a" strokeWidth={2} />
      })}
      <polygon points={poly([[206, 124, 30], [294, 124, 30], [294, 186, 30], [206, 186, 30]])} fill="none" stroke="#7a5a3a" strokeWidth={1.6} />
      {trees.map(([x, y, r], i) => {
        const [a, b] = iso(x, y, 0)
        return (
          <motion.g key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 + i * 0.15 }}>
            <line x1={a} y1={b} x2={a} y2={b - 22} stroke="#7a5a3a" strokeWidth={2.2} />
            <ellipse cx={a} cy={b - 22 - r * 0.6} rx={r} ry={r * 0.9} fill={C.tree} />
          </motion.g>
        )
      })}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}>
        <rect x={22} y={240} width={120} height={18} rx={9} fill="rgba(255,255,255,.9)" stroke={C.line} />
        <text x={82} y={252} fontSize={8.5} textAnchor="middle" fill={C.ink}>
          גובה 3.00 מ' · מדוד מהיתר
        </text>
      </motion.g>
    </motion.g>
  )
}

const BOM_ROWS = [
  { t: 'דשא מרבדים', q: '42.5 מ"ר', l: 'מדוד מהיתר', c: '#2f6b4f', p: '₪1,900 עד ₪2,400' },
  { t: 'דק עץ', q: '18.0 מ"ר', l: 'מדוד מהיתר', c: '#2f6b4f', p: '₪18,600 עד ₪22,800' },
  { t: 'אבן משתלבת', q: '24.0 מ"ר', l: 'מוערך', c: '#8a5a00', p: '₪3,600 עד ₪4,600' },
  { t: 'עצים', q: '4 יח\'', l: 'הונח', c: '#48546b', p: '₪6,000 עד ₪8,400' },
  { t: 'גדר חיה', q: '30.0 מ\'', l: 'מוערך', c: '#8a5a00', p: '₪5,800 עד ₪7,400' },
]

function Bom() {
  return (
    <div className="demo-panel" data-testid="demo-bom">
      <div className="demo-title">כתב כמויות</div>
      {BOM_ROWS.map((r, i) => (
        <motion.div key={r.t} className="demo-row" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.18 }}>
          <span>{r.t}</span>
          <span className="mono">{r.q}</span>
          <span className="demo-tag" style={{ color: r.c, borderColor: r.c }}>
            {r.l}
          </span>
          <span className="mono muted">{r.p}</span>
        </motion.div>
      ))}
      <motion.div className="demo-note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}>
        הערכה בלבד עד לאישור מול מחירון מעודכן וספק.
      </motion.div>
    </div>
  )
}

const PHASES = [
  { t: 'הכנת שטח ועבודות עפר', s: 0, w: 22 },
  { t: 'תשתיות: השקיה וניקוז', s: 16, w: 20 },
  { t: 'ריצוף, דק וקירות', s: 30, w: 34 },
  { t: 'שתילה ודשא', s: 58, w: 22 },
  { t: 'ריהוט ומתקנים', s: 74, w: 20 },
]

function Phases() {
  return (
    <div className="demo-panel" data-testid="demo-phases">
      <div className="demo-title">שלבים ותקציב</div>
      {PHASES.map((p, i) => (
        <div key={p.t} className="demo-phase">
          <span>{p.t}</span>
          <div className="demo-track">
            <motion.i style={{ insetInlineStart: `${p.s}%` }} initial={{ width: 0 }} animate={{ width: `${p.w}%` }} transition={{ delay: 0.2 + i * 0.2, duration: 0.6, ease: 'easeOut' }} />
          </div>
        </div>
      ))}
      <motion.div className="demo-total" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }}>
        <span>סה"כ, טווח</span>
        <b className="mono">₪58,000 עד ₪74,000</b>
      </motion.div>
    </div>
  )
}

export function RouteDemo() {
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const auto = !reduce && !paused
  useEffect(() => {
    if (!auto) return
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), DUR)
    return () => clearTimeout(t)
  }, [step, auto])
  useEffect(() => {
    const onVis = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const planStage = step <= 2
  const panel = step >= 4
  const defs = useMemo(
    () => (
      <defs>
        <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.accent} stopOpacity="0" />
          <stop offset="1" stopColor={C.accent} stopOpacity="0.28" />
        </linearGradient>
        <pattern id="lawnPat" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill={C.lawn} />
          <path d="M1 5l1-3M4 6l1-3" stroke="#6fa266" strokeWidth="0.6" />
        </pattern>
        <pattern id="deckPat" width="12" height="8" patternUnits="userSpaceOnUse">
          <rect width="12" height="8" fill={C.deck} />
          <path d="M0 0H12M7 0V8" stroke="#8d6a45" strokeWidth="0.6" />
        </pattern>
        <pattern id="pavePat" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill={C.paving} />
          <path d="M0 0H10M0 5H10M5 0V5M0 5V10M10 5V10" stroke="#9c9486" strokeWidth="0.6" />
        </pattern>
      </defs>
    ),
    [],
  )

  return (
    <div className="route-demo" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} data-testid="route-demo">
      <div className="demo-stage" aria-label={`הדגמה: ${STEPS[step].t}`} role="img">
        <AnimatePresence mode="wait">
          <motion.div key={planStage ? 'plan' : `s${step}`} className="demo-layer" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.35 }}>
            {!panel ? (
              <svg viewBox="0 0 400 290" aria-hidden="true">
                {defs}
                {planStage ? (
                  <>
                    <Sheet step={step} />
                    <g transform="translate(0 0)">{step >= 2 && <Garden />}</g>
                    {step >= 1 && <Walls step={step} />}
                  </>
                ) : (
                  <Model />
                )}
              </svg>
            ) : step === 4 ? (
              <Bom />
            ) : (
              <Phases />
            )}
          </motion.div>
        </AnimatePresence>
        <div className="demo-caption">
          <span className="mono">{String(step + 1).padStart(2, '0')}</span> {STEPS[step].t}
        </div>
      </div>
      <ol className="demo-steps" aria-label="שלבי המסלול">
        {STEPS.map((s, i) => (
          <li key={s.t}>
            <button className={`demo-step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
              <span className="n mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="body">
                <span className="t">{s.t}</span>
                <span className="d">{s.d}</span>
              </span>
              {i === step && <span className="prog" key={`${step}-${auto}`} style={{ animationDuration: `${DUR}ms`, animationPlayState: auto ? 'running' : 'paused' }} />}
            </button>
          </li>
        ))}
      </ol>
      <div className="demo-cta">
        <Link className="btn primary" to="/projects">
          להתחיל פרויקט
        </Link>
        <span className="muted" style={{ fontSize: 13 }}>
          {auto ? 'ההדגמה מתקדמת לבד. מעבר עכבר עוצר אותה.' : 'לוחצים על שלב כדי לראות אותו.'}
        </span>
      </div>
    </div>
  )
}
