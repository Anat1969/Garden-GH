// ראש עמוד אחיד: מה הדף עושה ולמה הוא חשוב, התובנות והנתונים המרכזיים מודגשים, וליווי ויזואלי קטן ומונפש.
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Label } from '../lib/types'
import { LabelLegend, Tag } from './ui'

export type ArtId = 'overview' | 'permit' | 'dims' | 'plan' | 'model' | 'bom' | 'phases' | 'variants' | 'prices' | 'projects' | 'design' | 'guide'

export interface Insight {
  k: string
  v: ReactNode
  label?: Label
  note?: ReactNode
  tone?: 'good' | 'warn' | 'bad'
}

// why: משפט פתיחה אחד. points: רשימה ממוספרת, משפט אחד בכל שורה
export function PageIntro({ eyebrow, title, why, points, insights = [], art, children, compact, legend }: { eyebrow?: string; title: string; why?: ReactNode; points?: ReactNode[]; insights?: Insight[]; art: ArtId; children?: ReactNode; compact?: boolean; legend?: boolean }) {
  return (
    <section className={`page-intro ${compact ? 'compact' : ''}`} data-testid="page-intro">
      <div className="pi-text">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2 className="pi-title">{title}</h2>
        {why && <p className="page-why">{why}</p>}
        {points && points.length > 0 &&
          (compact ? (
            <details className="pi-how">
              <summary>איך עובדים כאן</summary>
              <ol className="pi-points">
                {points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>
              {legend && <LabelLegend />}
            </details>
          ) : (
            <ol className="pi-points">
              {points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          ))}
        {insights.length > 0 && (
          <div className="pi-insights">
            {insights.map((i) => (
              <div key={i.k} className={`pi-insight ${i.tone ?? ''}`}>
                <span className="k">{i.k}</span>
                <span className="v">{i.v}</span>
                {(i.label || i.note) && (
                  <span className="n">
                    {i.label && <Tag label={i.label} />} {i.note}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {children}
        {legend && !compact && <LabelLegend />}
      </div>
      <PageArt id={art} />
    </section>
  )
}

// איור קו קטן לכל דף, נבנה בתנועה עדינה
export function PageArt({ id }: { id: ArtId }) {
  const reduce = useReducedMotion()
  const draw = (delay = 0) => (reduce ? {} : { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 1.1, delay, ease: 'easeInOut' as const } })
  const pop = (delay = 0) => (reduce ? {} : { initial: { opacity: 0, scale: 0.6 }, animate: { opacity: 1, scale: 1 }, transition: { delay, type: 'spring' as const, stiffness: 200, damping: 16 } })
  const S = '#2f5d4a'
  const M = '#8a918e'
  let body: ReactNode
  switch (id) {
    case 'permit':
      body = (
        <>
          <motion.rect x="18" y="12" width="84" height="66" rx="3" fill="#fff" stroke={M} {...draw()} />
          <motion.path d="M28 26h30v22H28zM66 26h26M66 34h20M66 42h24M28 58h64M28 66h40" stroke={M} {...draw(0.3)} />
          {!reduce && <motion.rect x="18" y="12" width="84" height="5" fill={S} opacity={0.25} animate={{ y: [12, 73, 12] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} />}
        </>
      )
      break
    case 'dims':
      body = (
        <>
          <motion.rect x="26" y="30" width="68" height="40" fill="none" stroke={M} {...draw()} />
          <motion.path d="M26 20h68M26 16v8M94 16v8M16 30v40M12 30h8M12 70h8" stroke={S} {...draw(0.4)} />
          <motion.text x="60" y="16" fontSize="8" textAnchor="middle" fill={S} {...pop(1)}>6.80</motion.text>
        </>
      )
      break
    case 'plan':
      body = (
        <>
          <motion.path d="M20 18h52v34H20z" fill="none" stroke="#2a2f2d" strokeWidth="2.4" {...draw()} />
          <motion.rect x="20" y="58" width="52" height="20" fill="#8fbf86" {...pop(0.5)} />
          <motion.rect x="78" y="40" width="24" height="38" fill="#b88a55" {...pop(0.7)} />
          <motion.circle cx="92" cy="22" r="9" fill="#4f7d47" {...pop(0.9)} />
        </>
      )
      break
    case 'model':
      body = (
        <>
          <motion.path d="M60 20l34 17v26L60 80 26 63V37z" fill="#eceae4" stroke="#2a2f2d" {...draw()} />
          <motion.path d="M26 37l34 17 34-17M60 54v26" stroke="#2a2f2d" {...draw(0.4)} />
          <motion.ellipse cx="100" cy="70" rx="9" ry="8" fill="#4f7d47" {...pop(0.9)} />
        </>
      )
      break
    case 'bom':
      body = (
        <>
          <motion.rect x="22" y="14" width="76" height="64" rx="3" fill="#fff" stroke={M} {...draw()} />
          {[26, 38, 50, 62].map((y, i) => (
            <motion.g key={y} {...pop(0.3 + i * 0.15)}>
              <rect x="30" y={y} width="30" height="5" rx="2" fill={M} opacity={0.5} />
              <rect x="68" y={y} width={14 + i * 3} height="5" rx="2" fill={S} />
            </motion.g>
          ))}
        </>
      )
      break
    case 'phases':
      body = (
        <>
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect x="18" y={18 + i * 15} width="84" height="7" rx="3.5" fill="#eceeed" />
              <motion.rect x={18 + i * 16} y={18 + i * 15} height="7" rx="3.5" fill={S} initial={reduce ? false : { width: 0 }} animate={{ width: 30 }} transition={{ delay: 0.2 + i * 0.25, duration: 0.6 }} />
            </g>
          ))}
        </>
      )
      break
    case 'variants':
      body = (
        <>
          <motion.rect x="16" y="22" width="40" height="46" rx="3" fill="#fff" stroke={M} {...draw()} />
          <motion.rect x="64" y="22" width="40" height="46" rx="3" fill="#fff" stroke={S} {...draw(0.3)} />
          <motion.rect x="22" y="50" width="28" height="12" fill="#8fbf86" {...pop(0.6)} />
          <motion.rect x="70" y="44" width="28" height="18" fill="#b88a55" {...pop(0.8)} />
        </>
      )
      break
    case 'prices':
      body = (
        <>
          <motion.path d="M30 16h50l14 14v46H30z" fill="#fff" stroke={M} {...draw()} />
          <motion.text x="62" y="58" fontSize="22" textAnchor="middle" fill={S} fontWeight="700" {...pop(0.6)}>₪</motion.text>
        </>
      )
      break
    case 'projects':
      body = (
        <>
          {[0, 1, 2].map((i) => (
            <motion.rect key={i} x={20 + i * 8} y={18 + i * 8} width="56" height="44" rx="4" fill="#fff" stroke={i === 2 ? S : M} {...pop(i * 0.2)} />
          ))}
          <motion.rect x="42" y="50" width="26" height="9" fill="#8fbf86" {...pop(0.8)} />
        </>
      )
      break
    case 'design':
      body = (
        <>
          <motion.path d="M18 70c14-26 34-40 64-46" stroke={S} strokeDasharray="3 3" {...draw()} />
          <motion.circle cx="34" cy="52" r="8" fill="#4f7d47" {...pop(0.5)} />
          <motion.rect x="56" y="44" width="26" height="18" fill="#b88a55" {...pop(0.7)} />
          <motion.path d="M90 16v12M84 22h12" stroke={S} strokeWidth="2" {...draw(1)} />
        </>
      )
      break
    case 'guide':
      body = (
        <>
          <motion.path d="M20 22c14-4 28-4 40 4v50c-12-8-26-8-40-4z" fill="#fff" stroke={M} {...draw()} />
          <motion.path d="M100 22c-14-4-28-4-40 4v50c12-8 26-8 40-4z" fill="#fff" stroke={S} {...draw(0.3)} />
          <motion.path d="M70 40c6 4 14 4 20 0M70 52c6 4 14 4 20 0" stroke="#4f7d47" {...draw(0.8)} />
        </>
      )
      break
    default:
      body = (
        <>
          <motion.circle cx="60" cy="46" r="26" fill="none" stroke={M} {...draw()} />
          <motion.path d="M48 46l8 8 16-16" stroke={S} strokeWidth="2.4" {...draw(0.6)} />
        </>
      )
  }
  return (
    <div className="pi-art" aria-hidden="true">
      <svg viewBox="0 0 120 92" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {body}
      </svg>
    </div>
  )
}
