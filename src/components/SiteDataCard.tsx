// נתוני האתר מהמיקום: שדות שנשמרים בפרויקט, עם תווית ומקור לכל ערך. חילוץ אוטומטי כשהמיקום משתנה, ועריכה ידנית.
import { useEffect, useRef, useState } from 'react'
import type { Project } from '../lib/types'
import { updateProject } from '../lib/store'
import { SITE_FIELDS, extractSiteData, localSiteFields, locKeyOf, type SiteField, type SiteKey } from '../lib/siteData'
import { fmtNum } from '../lib/bom'
import { IconBtn } from './EditIcons'
import { Tag, toast } from './ui'

const GROUPS = ['מיקום', 'אקלים', 'מים', 'רוח ושמש', 'קרקע'] as const

export function SiteDataCard({ project }: { project: Project }) {
  const [busy, setBusy] = useState(false)
  const site = project.site
  const fields = site?.fields ?? localSiteFields(project)
  const key = locKeyOf(project)
  const run = useRef(false)

  const extract = async (quiet = false) => {
    setBusy(true)
    try {
      const data = await extractSiteData(project)
      updateProject(project.id, (p) => ({ ...p, site: data }))
      if (!quiet) toast(data.live ? 'נתוני האתר חולצו ונשמרו' : 'נשמרו ממוצעים אזוריים. שירות האקלים לא זמין כרגע')
    } finally {
      setBusy(false)
    }
  }
  // חילוץ אוטומטי פעם אחת כשיש מיקום חדש שעוד לא חושב
  useEffect(() => {
    if (!key || site?.locKey === key || run.current) return
    run.current = true
    void extract(true).finally(() => {
      run.current = false
    })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const setField = (k: SiteKey, raw: string, num: boolean) => {
    const v = num ? Number(raw) : raw
    if (num && (raw === '' || !Number.isFinite(v as number))) return
    updateProject(project.id, (p) => {
      const base = p.site ?? { at: new Date().toISOString(), locKey: locKeyOf(p), live: false, fields: localSiteFields(p) }
      const f: SiteField = { v, label: 'assumed', source: 'הוזן ידנית', manual: true }
      return { ...p, site: { ...base, fields: { ...base.fields, [k]: f } } }
    })
  }

  return (
    <section className="card site-data" data-testid="site-data">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 className="h-section" style={{ margin: 0 }}>
          נתוני האתר מהמיקום
        </h3>
        <IconBtn icon="download" label={busy ? 'מחלץ' : site ? 'חילוץ מחדש' : 'חילוץ נתוני האתר'} onClick={() => void extract()} disabled={busy || !project.location} testId="site-extract" />
      </div>
      <div className="muted" style={{ fontSize: 13, margin: '6px 0 12px' }} data-testid="site-status">
        {!project.location
          ? 'קודם ממקמים את הפרויקט על המפה. עד אז מוצגים ערכים לפי העיר בכתובת.'
          : busy
            ? 'מחלץ נתוני אקלים למיקום (עשר שנים של נתונים יומיים)'
            : site?.live
              ? <>נשמר {new Date(site.at).toLocaleDateString('he-IL')}. מקור: <b>Open-Meteo (ERA5)</b>, מודל ולא תחנה, ולכן "מוערך".</>
              : site
                ? <>נשמרו <b>ממוצעים אזוריים</b>{site.error ? ` (${site.error})` : ''}. אפשר לחלץ מחדש כשיש רשת.</>
                : 'עוד לא חולץ.'}
      </div>
      <div className="site-groups">
        {GROUPS.map((g) => (
          <div key={g} className="site-group">
            <b className="site-group-t">{g}</b>
            {SITE_FIELDS.filter((d) => d.group === g).map((d) => {
              const f = fields[d.k]
              const shown = f === undefined ? '' : typeof f.v === 'number' ? fmtNum(f.v, d.digits ?? 2) : f.v
              return (
                <label key={d.k} className="site-field" title={f?.source}>
                  <span className="sf-k">{d.t}</span>
                  <span className="sf-v">
                    {d.num ? (
                      <input key={`${d.k}-${shown}`} className="input num" type="number" step="any" defaultValue={f && typeof f.v === 'number' ? Number(f.v.toFixed(d.digits ?? 2)) : ''} aria-label={d.t} onBlur={(e) => e.target.value !== String(f?.v ?? '') && setField(d.k, e.target.value, true)} />
                    ) : (
                      <input key={`${d.k}-${shown}`} className="input" defaultValue={String(f?.v ?? '')} aria-label={d.t} onBlur={(e) => e.target.value !== String(f?.v ?? '') && setField(d.k, e.target.value, false)} />
                    )}
                    {d.unit && <span className="sf-u">{d.unit}</span>}
                  </span>
                  {f && (
                    <span className="sf-src">
                      <Tag label={f.label} /> {f.source}
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        הנתונים מתארים את האזור, לא את המגרש. לאימות מול השירות המטאורולוגי ובדיקת קרקע. ניקוז ומי תהום: דורש מהנדס מוסמך.
      </div>
    </section>
  )
}
