// טבלה אחידה לכל האפליקציה: מיון בחיצים בכל עמודה, קיבוץ לפי קטגוריה, בחירת שורות,
// סיכום לכל קבוצה, סיכום לנבחרים וסך הכל.
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePrinting } from '../lib/printing'
import { EditIcon } from './EditIcons'

export interface Col<T> {
  key: string
  label: string
  // ערך למיון (מספר או טקסט)
  sort?: (r: T) => string | number | null
  render: (r: T) => ReactNode
  // סיכום עמודה עבור קבוצת שורות. מחזיר null כשאין מה לסכם
  sum?: (rows: T[]) => ReactNode | null
  className?: string
  minWidth?: number
}

export interface GroupOpt<T> {
  key: string
  label: string
  value: (r: T) => string
}

type Dir = 'asc' | 'desc'

export function DataTable<T>({
  rows,
  cols,
  rowKey,
  groups = [],
  defaultGroup = '',
  defaultSort,
  selectable = true,
  caption,
  testId,
  footNote,
}: {
  rows: T[]
  cols: Col<T>[]
  rowKey: (r: T) => string
  groups?: GroupOpt<T>[]
  defaultGroup?: string
  defaultSort?: { key: string; dir: Dir }
  selectable?: boolean
  caption?: string
  testId?: string
  footNote?: ReactNode
}) {
  const [sort, setSort] = useState<{ key: string; dir: Dir } | null>(defaultSort ?? null)
  const [groupKey, setGroupKey] = useState(defaultGroup)
  const [sel, setSel] = useState<Set<string>>(new Set())
  // טבלה ארוכה מקובצת: הקבוצות נפתחות סגורות, עם סיכום לכל קבוצה
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [allClosed, setAllClosed] = useState(rows.length > 40)
  const long = rows.length > 40
  const printing = usePrinting()
  useEffect(() => {
    setAllClosed(long)
    setClosed(new Set())
  }, [long])

  const sorted = useMemo(() => {
    if (!sort) return rows
    const c = cols.find((x) => x.key === sort.key)
    if (!c?.sort) return rows
    const f = c.sort
    const k = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = f(a)
      const vb = f(b)
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'he')) * k
    })
  }, [rows, cols, sort])

  const group = groups.find((g) => g.key === groupKey)
  const grouped = useMemo(() => {
    if (!group) return null
    const m = new Map<string, T[]>()
    for (const r of sorted) {
      const g = group.value(r) || 'ללא'
      m.set(g, [...(m.get(g) ?? []), r])
    }
    return [...m.entries()]
  }, [sorted, group])

  const toggleSort = (key: string) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null))

  const allKeys = rows.map(rowKey)
  const selRows = rows.filter((r) => sel.has(rowKey(r)))
  const allOn = selectable && allKeys.length > 0 && allKeys.every((k) => sel.has(k))
  const toggleRow = (k: string) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const toggleGroupSel = (keys: string[]) =>
    setSel((s) => {
      const n = new Set(s)
      const on = keys.every((k) => n.has(k))
      keys.forEach((k) => (on ? n.delete(k) : n.add(k)))
      return n
    })

  const hasSums = cols.some((c) => c.sum)
  const span = cols.length + (selectable ? 1 : 0)

  const sumRow = (label: ReactNode, rs: T[], cls: string, key: string) => (
    <tr className={cls} key={key}>
      {selectable && <td />}
      {cols.map((c, i) => (
        <td key={c.key} className={c.className}>
          {i === 0 ? label : c.sum ? c.sum(rs) : null}
        </td>
      ))}
    </tr>
  )

  const renderRow = (r: T) => {
    const k = rowKey(r)
    return (
      <tr key={k} className={sel.has(k) ? 'row-sel' : ''}>
        {selectable && (
          <td className="sel-cell">
            <input type="checkbox" checked={sel.has(k)} onChange={() => toggleRow(k)} aria-label="בחירת שורה" />
          </td>
        )}
        {cols.map((c) => (
          <td key={c.key} className={c.className} style={c.minWidth ? { minWidth: c.minWidth } : undefined}>
            {c.render(r)}
          </td>
        ))}
      </tr>
    )
  }

  return (
    <div className="dt" data-testid={testId}>
      <div className="dt-bar">
        {groups.length > 0 && (
          <label className="dt-group">
            <EditIcon id="group" />
            <span>קיבוץ לפי</span>
            <select className="input small" value={groupKey} onChange={(e) => setGroupKey(e.target.value)} aria-label="קיבוץ לפי">
              <option value="">ללא קיבוץ</option>
              {groups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="muted" style={{ fontSize: 13 }}>
          {rows.length} שורות{selRows.length ? ` · נבחרו ${selRows.length}` : ''}
        </span>
        {group && (
          <button
            type="button"
            className="btn small ghost"
            onClick={() => {
              setAllClosed((v) => !v)
              setClosed(new Set())
            }}
          >
            {allClosed ? 'פתיחת כל הקבוצות' : 'סגירת כל הקבוצות'}
          </button>
        )}
        {selRows.length > 0 && (
          <button type="button" className="btn small ghost" onClick={() => setSel(new Set())}>
            ניקוי בחירה
          </button>
        )}
      </div>
      <div className="table-wrap">
        <table className="t">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {selectable && (
                <th className="sel-cell">
                  <input type="checkbox" checked={allOn} onChange={() => (allOn ? setSel(new Set()) : setSel(new Set(allKeys)))} aria-label="בחירת כל השורות" />
                </th>
              )}
              {cols.map((c) => {
                const on = sort?.key === c.key
                return (
                  <th key={c.key} className={c.className} aria-sort={on ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    {c.sort ? (
                      <button type="button" className={`th-sort ${on ? 'on' : ''}`} onClick={() => toggleSort(c.key)} aria-label={`מיון לפי ${c.label}`}>
                        <span>{c.label}</span>
                        <EditIcon id={on ? (sort!.dir === 'asc' ? 'sortUp' : 'sortDown') : 'sortNone'} size={14} />
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {grouped
              ? grouped.map(([g, rs]) => {
                  const keys = rs.map(rowKey)
                  const isClosed = !printing && (allClosed ? !closed.has(g) : closed.has(g))
                  return (
                    <Fragment key={g}>
                      <tr className="group-row">
                        {selectable && (
                          <td className="sel-cell">
                            <input type="checkbox" checked={keys.every((k) => sel.has(k))} onChange={() => toggleGroupSel(keys)} aria-label={`בחירת הקבוצה ${g}`} />
                          </td>
                        )}
                        <td colSpan={span - (selectable ? 1 : 0)}>
                          <button
                            type="button"
                            className="group-toggle"
                            aria-expanded={!isClosed}
                            onClick={() =>
                              setClosed((s) => {
                                const n = new Set(s)
                                if (n.has(g)) n.delete(g)
                                else n.add(g)
                                return n
                              })
                            }
                          >
                            <EditIcon id={isClosed ? 'sortNone' : 'sortDown'} size={14} />
                            <b>{g}</b>
                            <span className="muted">({rs.length})</span>
                          </button>
                        </td>
                      </tr>
                      {!isClosed && rs.map(renderRow)}
                      {hasSums && sumRow(<span>סך {g}</span>, rs, 'subtotal-row', `${g}-sum`)}
                    </Fragment>
                  )
                })
              : sorted.map(renderRow)}
          </tbody>
          {hasSums && (
            <tfoot>
              {selRows.length > 0 && sumRow(<b>סך הנבחרים ({selRows.length})</b>, selRows, 'selected-row', 'sel')}
              {sumRow(<b>סך הכל</b>, rows, 'total-row', 'total')}
            </tfoot>
          )}
        </table>
      </div>
      {footNote}
    </div>
  )
}
