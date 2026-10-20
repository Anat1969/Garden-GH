// סמלי עריכה מינימליסטיים: קו דק אחד, צבע הטקסט (currentColor), באותה שפה של סמלי הגינה.
import type { ReactNode } from 'react'

const S = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ei">
    {children}
  </svg>
)

export const EDIT_ICONS = {
  approve: <path d="M5 12.5l4.2 4.2L19 7" />,
  delete: (
    <>
      <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
      <path d="M10.5 11v6M13.5 11v6" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  duplicate: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="1.5" />
      <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
    </>
  ),
  rotate: (
    <>
      <path d="M19 12a7 7 0 1 1-2.05-4.95" />
      <path d="M19 4.5V8h-3.5" />
    </>
  ),
  undo: (
    <>
      <path d="M8 8H15a5 5 0 0 1 0 10h-4" />
      <path d="M11 4.5L7.5 8 11 11.5" />
    </>
  ),
  redo: (
    <>
      <path d="M16 8H9a5 5 0 0 0 0 10h4" />
      <path d="M13 4.5L16.5 8 13 11.5" />
    </>
  ),
  zoomIn: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5M8 10.5h5M10.5 8v5" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5M8 10.5h5" />
    </>
  ),
  fit: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  dims: (
    <>
      <path d="M3 16.5L16.5 3 21 7.5 7.5 21z" />
      <path d="M7 12.5l1.5 1.5M9.5 10l2 2M12 7.5l1.5 1.5M14.5 5l2 2" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z" />
      <path d="M13.5 7l3 3" />
    </>
  ),
  snap: (
    <>
      <path d="M6 4v8a6 6 0 0 0 12 0V4" />
      <path d="M6 8h3M15 8h3M9 4v8a3 3 0 0 0 6 0V4" />
    </>
  ),
  merge: (
    <>
      <rect x="3.5" y="6" width="9" height="9" />
      <rect x="11.5" y="9" width="9" height="9" />
      <path d="M11.5 9v6h1" strokeDasharray="1.5 1.5" />
    </>
  ),
  material: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M4 10h16M4 15h16M10 4v6M14 10v5M9 15v5" />
    </>
  ),
  sortUp: <path d="M12 19V5M6.5 10.5L12 5l5.5 5.5" />,
  sortDown: <path d="M12 5v14M6.5 13.5L12 19l5.5-5.5" />,
  sortNone: <path d="M8.5 9L12 5.5 15.5 9M8.5 15l3.5 3.5 3.5-3.5" />,
  group: (
    <>
      <path d="M4 6h16M4 12h10M4 18h10" />
      <path d="M17 12v6" />
    </>
  ),
  plan: (
    <>
      <rect x="3.5" y="4" width="17" height="16" />
      <path d="M3.5 12h8V4M11.5 16v4M15 12h5.5" />
    </>
  ),
  wand: (
    <>
      <path d="M5 19L15 9" />
      <path d="M15 9l2-2M17.5 3.5v2M20.5 6.5h-2M19.6 4.4l-1.4 1.4" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="1.5" />
      <path d="M4 15.5V5.5A1.5 1.5 0 0 1 5.5 4h10" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </>
  ),
} as const

export type EditIconId = keyof typeof EDIT_ICONS

export function EditIcon({ id, size }: { id: EditIconId; size?: number }) {
  return <S size={size}>{EDIT_ICONS[id]}</S>
}

// כפתור עם סמל וטקסט קצר. iconOnly: רק סמל, השם נשמר ב-aria-label ובכותרת
export function IconBtn({
  icon,
  label,
  onClick,
  className = '',
  iconOnly,
  disabled,
  pressed,
  type = 'button',
  testId,
}: {
  icon: EditIconId
  label: string
  onClick?: () => void
  className?: string
  iconOnly?: boolean
  disabled?: boolean
  pressed?: boolean
  type?: 'button' | 'submit'
  testId?: string
}) {
  return (
    <button
      type={type}
      className={`btn small icon-btn ${iconOnly ? 'only' : ''} ${pressed ? 'active' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={iconOnly ? label : undefined}
      aria-pressed={pressed}
      title={label}
      data-testid={testId}
    >
      <EditIcon id={icon} />
      {!iconOnly && <span>{label}</span>}
    </button>
  )
}
