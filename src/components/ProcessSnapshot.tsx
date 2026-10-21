// תיבה צדדית: תמונת מצב של תהליך העבודה. מה קיים, מה חלקי ומה חסר, פערים בתהליך עצמו, הערות ונוסח להעתקה.
import { Link } from 'react-router-dom'
import type { Project, Variant } from '../lib/types'
import { STAGES } from '../pages/ProjectLayout'
import { STATE_TEXT, processGaps, processStatus, statusText } from '../lib/processStatus'
import { updateProject } from '../lib/store'
import { IconBtn } from './EditIcons'
import { Rich, toast } from './ui'

export function ProcessSnapshot({ project, variant }: { project: Project; variant: Variant }) {
  const items = processStatus(project, variant)
  const gaps = processGaps(project, variant)
  const ok = items.filter((i) => i.state === 'ok').length
  const pct = Math.round((ok / items.length) * 100)
  const copy = async () => {
    const t = statusText(project, items, gaps)
    try {
      await navigator.clipboard.writeText(t)
      toast('תמונת המצב הועתקה')
    } catch {
      window.prompt('העתקה', t)
    }
  }
  return (
    <aside className="snapshot" data-testid="process-snapshot" aria-label="תמונת מצב של תהליך העבודה">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b className="snap-title">תמונת מצב</b>
        <IconBtn icon="copy" label="העתקה" onClick={copy} testId="snapshot-copy" />
      </div>
      <div className="snap-meter" aria-label={`${ok} מתוך ${items.length} קיימים`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        <b>{ok}</b> מתוך {items.length} קיימים · <b>{items.filter((i) => i.state === 'missing').length}</b> חסרים
      </div>
      {STAGES.map((name, si) => {
        const list = items.filter((i) => i.stage === si + 1)
        if (!list.length) return null
        return (
          <div key={name} className="snap-stage">
            <span className="snap-stage-t">
              {si + 1} {name}
            </span>
            <ul>
              {list.map((i) => (
                <li key={i.t} className={`snap-item ${i.state}`} data-state={i.state}>
                  <span className="snap-dot" aria-label={STATE_TEXT[i.state]} />
                  <span className="snap-t">{i.to ? <Link to={`/p/${project.id}/${i.to}`}>{i.t}</Link> : i.t}</span>
                  <span className="snap-n">{i.note}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      <div className="snap-stage">
        <span className="snap-stage-t">מה חסר בתהליך העבודה</span>
        <ol className="snap-gaps" data-testid="process-gaps">
          {gaps.map((g) => (
            <li key={g}>
              <Rich text={g} />
            </li>
          ))}
        </ol>
      </div>
      <label className="field" style={{ marginTop: 8 }}>
        <span className="f-label">הערות לתמונת המצב</span>
        <textarea
          className="input"
          rows={4}
          data-testid="snapshot-notes"
          defaultValue={project.processNotes ?? ''}
          placeholder="מה נבדק, מה מחכה ללקוח, למי פונים"
          onBlur={(e) => e.target.value !== (project.processNotes ?? '') && updateProject(project.id, (p) => ({ ...p, processNotes: e.target.value }))}
        />
      </label>
    </aside>
  )
}
