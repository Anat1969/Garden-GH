import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { Label } from '../lib/types'
import { LABEL_TEXT } from '../lib/types'
import { fmtMoney, fmtNum } from '../lib/bom'

export function Tag({ label }: { label: Label }) {
  return <span className={`lbl ${label}`}>{LABEL_TEXT[label]}</span>
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
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  decimals?: number
}) {
  // תצוגה בשתי ספרות אחרי הנקודה. בזמן הקלדה הטקסט נשאר כפי שהוקלד
  const show = (v: number) => (Number.isFinite(v) ? v.toFixed(decimals) : '')
  const [text, setText] = useState(show(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setText(show(value))
  }, [value, editing]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="field">
      <span>{label}</span>
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
    </label>
  )
}
