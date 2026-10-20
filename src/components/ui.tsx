import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { Label } from '../lib/types'
import { LABEL_HELP, LABEL_TEXT } from '../lib/types'
import { fmtMoney, fmtNum } from '../lib/bom'

export function Tag({ label }: { label: Label }) {
  return (
    <span
      className={`lbl ${label}`}
      title={LABEL_HELP[label]}
      role="button"
      tabIndex={0}
      onClick={() => toast(LABEL_HELP[label])}
      onKeyDown={(e) => {
        if (e.key === 'Enter') toast(LABEL_HELP[label])
      }}
    >
      {LABEL_TEXT[label]}
    </span>
  )
}

// מקרא קצר לשלוש התוויות
export function LabelLegend() {
  return (
    <div className="legend" data-testid="label-legend">
      <span className="muted">מה התוויות אומרות:</span>
      {(['measured', 'estimated', 'assumed'] as Label[]).map((l) => (
        <span key={l} className="legend-item">
          <Tag label={l} /> <span>{LABEL_HELP[l].split(':')[1].split('.')[0].trim()}</span>
        </span>
      ))}
    </div>
  )
}

// מספר תמיד יחד עם תווית. אין מספר בלי תווית.
export function Num({ value, unit, label, money, digits }: { value: number; unit?: string; label: Label; money?: boolean; digits?: number }) {
  return (
    <span className="numwrap">
      <span className="num">
        {money ? fmtMoney(value) : fmtNum(value, digits)}
        {unit ? ` ${unit}` : ''}
      </span>
      <Tag label={label} />
    </span>
  )
}

export function Loading({ text = 'טוען' }: { text?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="spinner" />
      <div>{text}</div>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <div className="h-section">{title}</div>
      {children}
    </div>
  )
}

export function ErrorState({ title = 'משהו השתבש', children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="state" role="alert">
      <div className="h-section" style={{ color: 'var(--danger)' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export function Rise({ children, delay = 0, className, style }: { children: ReactNode; delay?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  )
}

let toastSetter: ((s: string | null) => void) | null = null
export function toast(msg: string) {
  toastSetter?.(msg)
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    toastSetter = setMsg
    return () => {
      toastSetter = null
    }
  }, [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2600)
    return () => clearTimeout(t)
  }, [msg])
  if (!msg) return null
  return (
    <div className="toast" role="status">
      {msg}
    </div>
  )
}

export function NumField({
  label,
  value,
  onChange,
  step = 0.05,
  min,
  decimals = 2,
  required,
  extracted,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  decimals?: number
  required?: boolean
  extracted?: string | false
}) {
  // תצוגה בשתי ספרות אחרי הנקודה. בזמן הקלדה הטקסט נשאר כפי שהוקלד
  const show = (v: number) => (Number.isFinite(v) ? v.toFixed(decimals) : '')
  const [text, setText] = useState(show(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setText(show(value))
  }, [value, editing]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className={`field ${extracted ? 'is-extracted' : ''}`}>
      <span className="f-label">
        {label}
        {required === true && (
          <span className="req" title="שדה חובה">
            {' '}*
          </span>
        )}
        {required === false && <span className="opt">לא חייב</span>}
      </span>
      <input
        className="input num"
        inputMode="decimal"
        type="number"
        step={step}
        min={min}
        value={text}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false)
          setText(show(value))
        }}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(n)) onChange(n)
        }}
      />
      {extracted && <span className="f-note">חולץ {extracted}</span>}
    </label>
  )
}

// שדה טופס אחיד: כוכבית לחובה, "לא חייב" לרשות, ו"חולץ" מתחת לשדה כשהערך נקרא מההיתר
export function Field({ label, required, extracted, hint, children, wide }: { label: string; required?: boolean; extracted?: string | false; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${extracted ? 'is-extracted' : ''}`} style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <span className="f-label">
        {label}
        {required ? (
          <span className="req" title="שדה חובה">
            {' '}*
          </span>
        ) : (
          <span className="opt">לא חייב</span>
        )}
      </span>
      {children}
      {extracted && <span className="f-note">חולץ {extracted}</span>}
      {hint && <span className="f-hint">{hint}</span>}
    </label>
  )
}

// בחירה בתיבות סימון במקום הקלדה. הערך נשמר כטקסט מופרד בפסיקים, ו"עוד" מקבל טקסט חופשי
export function CheckGroup({ options, value, onChange, otherPlaceholder = 'עוד, בכתב חופשי', label }: { options: string[]; value: string; onChange: (v: string) => void; otherPlaceholder?: string; label: string }) {
  const tokens = value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const picked = options.filter((o) => tokens.includes(o))
  const other = tokens.filter((t) => !options.includes(t)).join(', ')
  const emit = (p: string[], o: string) => onChange([...p, ...o.split(',').map((t) => t.trim()).filter(Boolean)].join(', '))
  return (
    <div className="check-group" role="group" aria-label={label}>
      {options.map((o) => {
        const on = picked.includes(o)
        return (
          <label key={o} className={`check ${on ? 'on' : ''}`}>
            <input type="checkbox" checked={on} onChange={() => emit(on ? picked.filter((x) => x !== o) : [...picked, o], other)} />
            <span>{o}</span>
          </label>
        )
      })}
      <input className="input small check-other" value={other} placeholder={otherPlaceholder} onChange={(e) => emit(picked, e.target.value)} aria-label={`${label}: עוד`} />
    </div>
  )
}

// חלון תוצאות: נפתח מתחת לסרגל העליון, נסגר ב-Escape או בלחיצה ברקע
export function Modal({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-back" onClick={onClose}>
      <motion.div className="modal card" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.2 }}>
        <h3 className="h-section" style={{ margin: '0 0 8px' }}>
          {title}
        </h3>
        <div className="modal-body">{children}</div>
        <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          {actions}
          <button className="btn" onClick={onClose}>
            סגירה
          </button>
        </div>
      </motion.div>
    </div>
  )
}
