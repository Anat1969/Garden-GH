// הקשר החלופה בכל דף בפרויקט: על איזו חלופה עובדים (מספר ושם, עם שינוי שם), תוכנית מבט על,
// הדרישות של החלופה והשינוי התכנוני האחרון. כך יש רצף חזותי בין הדפים, והדרישות תמיד מול העיניים.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Project, Variant } from '../lib/types'
import { updateProject } from '../lib/store'
import { STYLES } from '../data/gardenGuide'
import { fmtMoney } from '../lib/bom'
import { lastChangeText } from '../lib/changes'
import { PlanThumb } from './PlanThumb'
import { IconBtn } from './EditIcons'

export const variantNo = (p: Project, v: Variant) => p.variants.findIndex((x) => x.id === v.id) + 1

export function renameVariant(p: Project, v: Variant, name: string) {
  const n = name.trim() || `חלופה ${variantNo(p, v)}`
  updateProject(p.id, (x) => ({ ...x, variants: x.variants.map((y) => (y.id === v.id ? { ...y, name: n } : y)) }))
}

// מספר החלופה, שמה, שינוי שם ומעבר בין חלופות. ליד שם הפרויקט
export function VariantSwitch({ project, variant }: { project: Project; variant: Variant }) {
  const [edit, setEdit] = useState(false)
  const [name, setName] = useState(variant.name)
  const no = variantNo(project, variant)
  return (
    <div className="variant-switch" data-testid="variant-switch">
      <span className="variant-no" aria-label={`חלופה ${no} מתוך ${project.variants.length}`}>
        <b>חלופה {no}</b>
        <span>מתוך {project.variants.length}</span>
      </span>
      {edit ? (
        <form
          className="row"
          style={{ gap: 6 }}
          onSubmit={(e) => {
            e.preventDefault()
            renameVariant(project, variant, name)
            setEdit(false)
          }}
        >
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="שם החלופה" onKeyDown={(e) => e.key === 'Escape' && setEdit(false)} />
          <IconBtn icon="approve" label="שמירת השם" type="submit" iconOnly />
          <IconBtn icon="close" label="ביטול" onClick={() => setEdit(false)} iconOnly />
        </form>
      ) : (
        <>
          <select
            className="input variant-select"
            value={project.activeVariantId}
            onChange={(e) => updateProject(project.id, (p) => ({ ...p, activeVariantId: e.target.value }))}
            aria-label="חלופה פעילה"
          >
            {project.variants.map((v, i) => (
              <option key={v.id} value={v.id}>
                {i + 1}. {v.name}
              </option>
            ))}
          </select>
          <IconBtn
            icon="edit"
            label="שינוי שם החלופה"
            iconOnly
            onClick={() => {
              setName(variant.name)
              setEdit(true)
            }}
            testId="rename-variant"
          />
        </>
      )}
    </div>
  )
}

// הדרישות של החלופה כשורת תגיות. compact: בלי כותרת, לצד התוכנית והמודל
export function RequirementsSummary({ project, variant, compact }: { project: Project; variant: Variant; compact?: boolean }) {
  const r = variant.requirements
  const style = STYLES.find((s) => s.id === r.style)
  const items: { k: string; v: string }[] = []
  if (style) items.push({ k: 'סגנון', v: style.name })
  if (r.functions.trim()) items.push({ k: 'פונקציות', v: r.functions })
  if (r.plants.trim()) items.push({ k: 'צמחייה', v: r.plants })
  if (r.materials.trim()) items.push({ k: 'חומרים', v: r.materials })
  if (r.budget) items.push({ k: 'תקציב', v: fmtMoney(r.budget) })
  if (r.constraints.trim()) items.push({ k: 'אילוצים', v: r.constraints })
  return (
    <div className={`req-summary ${compact ? 'compact' : ''}`} data-testid="req-summary">
      {!compact && <b className="req-title">דרישות החלופה</b>}
      {items.length ? (
        <ul>
          {items.map((it) => (
            <li key={it.k}>
              <span>{it.k}</span> <b>{it.v}</b>
            </li>
          ))}
        </ul>
      ) : (
        <span className="muted">עוד לא הוגדרו דרישות.</span>
      )}
      <Link to={`/p/${project.id}`} className="req-edit">
        עריכת הדרישות
      </Link>
    </div>
  )
}

// רצועת ההקשר בראש כל דף: תוכנית מבט על, דרישות ושינוי אחרון
export function ContextStrip({ project, variant }: { project: Project; variant: Variant }) {
  const nav = useNavigate()
  const last = lastChangeText(variant)
  return (
    <section className="context-strip no-print" data-testid="context-strip" aria-label="הקשר החלופה">
      <div className="ctx-plan">
        <PlanThumb project={project} variant={variant} onClick={() => nav(`/p/${project.id}/plan`)} label="מעבר לתוכנית" />
      </div>
      <RequirementsSummary project={project} variant={variant} />
      <div className="ctx-last" data-testid="last-change">
        <b>שינוי תכנוני אחרון</b>
        <span>{last ?? 'עוד אין שינויים בחלופה הזו.'}</span>
      </div>
    </section>
  )
}
