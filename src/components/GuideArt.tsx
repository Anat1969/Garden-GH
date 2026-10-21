// איורי קו מינימליים למדריך: גישות תכנון, ומדדים (תחזוקה, מים, תקציב). קו אחד דק, בשפת סמלי השרטוט.
// והדגשה אוטומטית של מה שחשוב בכל משפט: מספרים ויחידות, צמחים, חומרים ומונחי מפתח.
import type { ReactNode } from 'react'

const S = ({ children, size = 64 }: { children: ReactNode; size?: number }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

// איור לכל גישת תכנון
export const APPROACH_ART: Record<string, ReactNode> = {
  hydrozones: (
    <>
      <path d="M32 8c-6 9-10 14-10 19a10 10 0 0 0 20 0c0-5-4-10-10-19z" />
      <circle cx="32" cy="44" r="14" strokeDasharray="3 3" />
      <circle cx="32" cy="44" r="22" strokeDasharray="1 4" />
    </>
  ),
  low_maintenance: (
    <>
      <path d="M10 50h44" />
      <path d="M18 50c0-8 4-12 8-12s6 4 6 12" />
      <path d="M38 50c0-5 2-8 5-8s5 3 5 8" />
      <circle cx="46" cy="16" r="6" />
      <path d="M46 22v6" />
    </>
  ),
  biodiversity: (
    <>
      <path d="M32 54V34" />
      <circle cx="32" cy="28" r="6" />
      <path d="M32 22c-2-6 2-10 0-14M26 28c-6-1-9 3-14 1M38 28c6-1 9 3 14 1" />
      <path d="M44 46c4-4 10-2 10 2-4 1-6 4-10-2zM20 44c-4-4-10-2-10 2 4 1 6 4 10-2z" />
    </>
  ),
  garden_rooms: (
    <>
      <rect x="8" y="12" width="48" height="40" rx="2" />
      <path d="M32 12v16M32 36v16M8 32h14M30 32h26" />
      <circle cx="20" cy="22" r="3" />
      <circle cx="44" cy="44" r="4" />
    </>
  ),
  four_seasons: (
    <>
      <circle cx="32" cy="32" r="20" />
      <path d="M32 12v40M12 32h40" />
      <circle cx="22" cy="22" r="3" />
      <path d="M41 21l4 4M45 21l-4 4" />
      <path d="M20 42c2-3 6-3 6 0M38 44h8" />
    </>
  ),
  shade_cooling: (
    <>
      <circle cx="48" cy="14" r="5" />
      <path d="M48 4v3M58 14h-3M55 7l-2 2" />
      <path d="M22 52V34" />
      <path d="M8 34c0-10 6-16 14-16s14 6 14 16z" />
      <path d="M6 56h40" strokeDasharray="4 3" />
    </>
  ),
  accessible: (
    <>
      <path d="M8 52h48" />
      <path d="M14 52l18-14h18" />
      <circle cx="44" cy="22" r="4" />
      <path d="M44 26v10h-6" />
    </>
  ),
  kids: (
    <>
      <path d="M10 52h44" />
      <path d="M16 52V20h16v32" />
      <path d="M32 24l18 28" />
      <circle cx="46" cy="16" r="4" />
      <path d="M20 30h8M20 40h8" />
    </>
  ),
}

export function ApproachArt({ id }: { id: string }) {
  return (
    <div className="approach-art">
      <S size={72}>{APPROACH_ART[id] ?? <rect x="12" y="12" width="40" height="40" rx="4" />}</S>
    </div>
  )
}

// סמלי מדדים: תחזוקה, מים, תקציב
export const MetaIcon = ({ kind }: { kind: 'maintenance' | 'water' | 'budget' }) => (
  <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px' }}>
    {kind === 'maintenance' && <path d="M14 4a4 4 0 0 0-4 5l-6 6 2 2 6-6a4 4 0 0 0 5-4l-2 2-2-1-1-2z" />}
    {kind === 'water' && <path d="M12 3c-3 5-5 8-5 11a5 5 0 0 0 10 0c0-3-2-6-5-11z" />}
    {kind === 'budget' && (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M9 9h4a2 2 0 0 1 0 4h-2a2 2 0 0 0 0 4h4M12 7v2M12 17v-1" />
      </>
    )}
  </svg>
)

const KEY_TERMS = [
  'צל', 'שמש', 'מים', 'השקיה', 'טפטוף', 'חיסכון', 'חסכוני', 'תחזוקה', 'רוח', 'פרגולה', 'עצים', 'עץ', 'דשא', 'חצץ', 'אבן', 'עץ', 'ערוגות', 'ערוגה',
  'פינת ישיבה', 'ישיבה', 'שביל', 'שבילים', 'גדר חיה', 'מים', 'ציפורים', 'פרפרים', 'מאביקים', 'ילדים', 'נגיש', 'נגישות', 'קיץ', 'חורף', 'אביב', 'סתיו',
  'דרום-מערב', 'דרום', 'מערב', 'צפון', 'מזרח', 'מקומי', 'מקומיים', 'ים-תיכוני', 'ים-תיכוניים', 'בטיחות', 'בטוח', 'ניקוז', 'שיפוע', 'מפלס', 'תאורה',
]

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// הדגשה אוטומטית: מספרים עם יחידות, מונחי מפתח, ומילים נוספות (צמחים, חומרים)
export function Emph({ text, extra = [] }: { text: string; extra?: string[] }) {
  const terms = [...new Set([...extra, ...KEY_TERMS])].filter((t) => t.length > 1).sort((a, b) => b.length - a.length)
  const num = '\\d+(?:[.,]\\d+)?(?:\\s?(?:עד|-)\\s?\\d+(?:[.,]\\d+)?)?\\s?(?:%|מ"ר|מ״ר|מ\'|מ׳|מטר|מטרים|ס"מ|ס״מ|ליטר|שעות|שנים|מעלות)?'
  const re = new RegExp(`(${num}|(?<![\\u0590-\\u05FF])(?:${terms.map(esc).join('|')})(?![\\u0590-\\u05FF]))`, 'g')
  const parts = text.split(re)
  let used = 0
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0 || !p) return p
        // לא להדגיש יותר מדי: עד ארבע הדגשות במשפט
        if (used >= 4) return p
        used++
        return <b key={i}>{p}</b>
      })}
    </>
  )
}
