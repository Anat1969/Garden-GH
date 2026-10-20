import type { Element, Label, Project, Wall } from '../lib/types'
import { LABEL_TEXT, MATERIAL_TEXT, KIND_TEXT } from '../lib/types'
import { removeElement, upsertElement } from '../lib/store'
import { NumField, Num, Tag } from './ui'
import { dimLabelText, dimsForElement } from '../lib/dims'
import { polyLength, surfaceArea } from '../lib/bom'
import { LINES, MATERIALS, OBJECTS, type LineType, type ObjectType, type SurfaceMaterial } from '../lib/garden'
import { textureUrl } from '../lib/textures'
import { IconBtn } from './EditIcons'

const len = (w: { x1: number; y1: number; x2: number; y2: number }) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1)

function setLength<T extends { x1: number; y1: number; x2: number; y2: number }>(w: T, L: number): T {
  const cur = len(w) || 1
  const k = L / cur
  return { ...w, x2: w.x1 + (w.x2 - w.x1) * k, y2: w.y1 + (w.y2 - w.y1) * k }
}

export function approvedLabel(project: Project): Label {
  const src = project.permit?.scale.source
  return src === 'text' || src === 'dimensions' ? 'measured' : src === 'calibrated' ? 'estimated' : 'assumed'
}

export function ElementEditor({ project, el, elements, name, onClose }: { project: Project; el: Element; elements: Element[]; name: string; onClose?: () => void }) {
  // עריכה ידנית של מידה הופכת אותה ל"הונח" עד שמסמנים אחרת
  const save = (patch: Partial<Element>, keepLabel = false) => upsertElement(project.id, { ...el, ...patch, ...(keepLabel ? {} : { label: 'assumed' }) } as Element, true)
  const wall = el.kind === 'opening' ? (elements.find((e) => e.id === el.wallId) as Wall | undefined) : undefined

  return (
    <div className="card" data-testid="element-editor">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow">{KIND_TEXT[el.kind]}</div>
          <div className="h-section">{name}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Tag label={el.label} />
          {el.approved ? <span className="lbl measured">אושר</span> : <span className="lbl estimated">ממתין לאישור</span>}
        </div>
      </div>
      <div className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>
        מקור: {el.source}
      </div>

      <div className="form-grid">
        {el.kind === 'wall' && (
          <>
            <NumField label="אורך (מ')" value={round(len(el))} onChange={(v) => v > 0 && save(setLength(el, v))} />
            <NumField label="עובי (מ')" value={el.thickness} step={0.01} onChange={(v) => v > 0 && save({ thickness: v })} />
            <NumField label="גובה (מ')" value={el.height} onChange={(v) => v > 0 && save({ height: v })} />
            <label className="field">
              <span>שייכות</span>
              <select className="input" value={el.scope} onChange={(e) => save({ scope: e.target.value as Wall['scope'] }, true)}>
                <option value="house">קיר בית</option>
                <option value="garden">קיר גינה</option>
              </select>
            </label>
          </>
        )}
        {el.kind === 'opening' && (
          <>
            <label className="field">
              <span>סוג</span>
              <select className="input" value={el.type} onChange={(e) => save({ type: e.target.value as typeof el.type }, true)}>
                <option value="door">דלת</option>
                <option value="window">חלון</option>
                <option value="gate">שער / פתח יציאה</option>
              </select>
            </label>
            <NumField label="מרחק מתחילת הקיר (מ')" value={el.offset} onChange={(v) => v >= 0 && save({ offset: Math.min(v, wall ? Math.max(0, len(wall) - el.width) : v) })} />
            <NumField label="רוחב (מ')" value={el.width} onChange={(v) => v > 0 && save({ width: v })} />
            <NumField label="גובה (מ')" value={el.height} onChange={(v) => v > 0 && save({ height: v })} />
            <NumField label="גובה אדן (מ')" value={el.sill} onChange={(v) => v >= 0 && save({ sill: v })} />
          </>
        )}
        {el.kind === 'surface' && (
          <>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <span>חומר וטקסטורה · {MATERIAL_TEXT[el.material]}</span>
              <div className="swatches editor-swatches" role="radiogroup" aria-label="חומר המשטח">
                {(Object.keys(MATERIALS) as SurfaceMaterial[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={el.material === m}
                    className={`swatch-btn ${el.material === m ? 'on' : ''}`}
                    onClick={() => save({ material: m, color: undefined }, true)}
                    title={MATERIALS[m].text}
                  >
                    <i style={{ backgroundImage: `url(${textureUrl(m, el.material === m ? el.color : undefined, 96)})` }} />
                    <span>{MATERIALS[m].text}</span>
                  </button>
                ))}
              </div>
            </div>
            {!el.poly && <NumField label="רוחב (מ')" value={el.w} onChange={(v) => v > 0 && save({ w: v })} />}
            {!el.poly && <NumField label="עומק (מ')" value={el.d} onChange={(v) => v > 0 && save({ d: v })} />}
            <NumField label="מפלס (מ')" value={el.level} onChange={(v) => save({ level: v })} />
            <ColorField value={el.color} fallback={MATERIALS[el.material].color} onChange={(c) => save({ color: c }, true)} />
          </>
        )}
        {el.kind === 'object' && (
          <>
            <label className="field">
              <span>סוג</span>
              <select className="input" value={el.type} onChange={(e) => save({ type: e.target.value as ObjectType }, true)}>
                {(Object.keys(OBJECTS) as ObjectType[]).map((k) => (
                  <option key={k} value={k}>
                    {OBJECTS[k].text}
                  </option>
                ))}
              </select>
            </label>
            <NumField label="רוחב (מ')" value={el.w} onChange={(v) => v > 0 && save({ w: v })} />
            <NumField label="עומק (מ')" value={el.d} onChange={(v) => v > 0 && save({ d: v })} />
            <NumField label="גובה (מ')" value={el.h} onChange={(v) => v > 0 && save({ h: v })} />
            <NumField label="סיבוב (מעלות)" value={el.rot} step={15} decimals={0} onChange={(v) => save({ rot: ((v % 360) + 360) % 360 }, true)} />
            <NumField label="מפלס (מ')" value={el.level} onChange={(v) => save({ level: v })} />
            <ColorField value={el.color} fallback={OBJECTS[el.type].color} onChange={(c) => save({ color: c }, true)} />
          </>
        )}
        {el.kind === 'line' && (
          <>
            <label className="field">
              <span>סוג</span>
              <select className="input" value={el.type} onChange={(e) => save({ type: e.target.value as LineType }, true)}>
                {(Object.keys(LINES) as LineType[]).map((k) => (
                  <option key={k} value={k}>
                    {LINES[k].text}
                  </option>
                ))}
              </select>
            </label>
            <NumField label="רוחב (מ')" value={el.width} step={0.05} onChange={(v) => v > 0 && save({ width: v })} />
            <NumField label="גובה (מ')" value={el.height} step={0.05} onChange={(v) => v >= 0 && save({ height: v })} />
            <NumField label="מפלס (מ')" value={el.level} onChange={(v) => save({ level: v })} />
            <ColorField value={el.color} fallback={LINES[el.type].color} onChange={(c) => save({ color: c }, true)} />
          </>
        )}
        {el.kind === 'sketch' && (
          <>
            <ColorField value={el.color} fallback="#1d2120" onChange={(c) => save({ color: c ?? '#1d2120' }, true)} />
            <NumField label="עובי קו (מ')" value={el.stroke} step={0.01} onChange={(v) => v > 0 && save({ stroke: v }, true)} />
            <label className="field" style={{ alignSelf: 'end' }}>
              <span>
                <input type="checkbox" checked={el.closed} onChange={(e) => save({ closed: e.target.checked }, true)} /> צורה סגורה
              </span>
            </label>
          </>
        )}
        {el.kind === 'fence' && (
          <>
            <NumField label="אורך (מ')" value={round(len(el))} onChange={(v) => v > 0 && save(setLength(el, v))} />
            <NumField label="גובה (מ')" value={el.height} onChange={(v) => v > 0 && save({ height: v })} />
            <label className="field" style={{ alignSelf: 'end' }}>
              <span>
                <input type="checkbox" checked={el.boundary} onChange={(e) => save({ boundary: e.target.checked }, true)} /> גבול מגרש
              </span>
            </label>
          </>
        )}
        <label className="field">
          <span>תווית המידות</span>
          <select className="input" value={el.label} onChange={(e) => save({ label: e.target.value as Label }, true)}>
            {(Object.keys(LABEL_TEXT) as Label[]).map((l) => (
              <option key={l} value={l}>
                {LABEL_TEXT[l]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {el.kind === 'surface' && (
        <div style={{ marginTop: 10 }}>
          שטח: <Num value={surfaceArea(el)} unit='מ"ר' label={el.label} />
          {el.poly && <span className="muted" style={{ fontSize: 13 }}> · מצולע מההיתר ({el.poly.length} קודקודים)</span>}
        </div>
      )}
      {el.kind === 'line' && (
        <div style={{ marginTop: 10 }}>
          אורך: <Num value={polyLength(el.pts)} unit="מ'" label={el.label} />
        </div>
      )}
      {el.kind === 'object' && OBJECTS[el.type].note && <div className="notice pro" style={{ marginTop: 10 }}>{OBJECTS[el.type].note}</div>}
      {el.kind === 'line' && LINES[el.type].note && <div className="notice pro" style={{ marginTop: 10 }}>{LINES[el.type].note}</div>}
      {el.kind === 'line' && el.type === 'low_wall' && el.height > 1 && <div className="notice pro" style={{ marginTop: 10 }}>קיר מעל מטר או קיר תומך: דורש מהנדס מוסמך.</div>}
      {el.kind === 'sketch' && <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>שרטוט חופשי לסקיצה בלבד. לא נכנס לכתב הכמויות.</div>}
      {el.kind === 'fence' && el.boundary && <div className="notice" style={{ marginTop: 10 }}>גבול מגרש בהיתר: לאימות במדידה.</div>}
      {el.kind === 'wall' && el.scope === 'garden' && el.height > 1 && <div className="notice pro" style={{ marginTop: 10 }}>קיר מעל מטר או קיר תומך: דורש מהנדס מוסמך.</div>}

      <DimMatch project={project} el={el} elements={elements} />

      <div className="row" style={{ marginTop: 14 }}>
        {!el.approved && (
          <IconBtn icon="approve" label="אישור האלמנט" className="primary" onClick={() => upsertElement(project.id, { ...el, approved: true, label: el.label === 'estimated' ? approvedLabel(project) : el.label } as Element)} />
        )}
        {el.approved && <IconBtn icon="undo" label="ביטול אישור" onClick={() => save({ approved: false }, true)} />}
        <IconBtn
          icon="delete"
          label="מחיקה"
          className="danger"
          onClick={() => {
            removeElement(project.id, el.id)
            onClose?.()
          }}
        />
        {onClose && <IconBtn icon="close" label="סגירה" className="ghost" onClick={onClose} />}
      </div>
    </div>
  )
}

const round = (v: number) => Math.round(v * 100) / 100

function ColorField({ value, fallback, onChange }: { value?: string; fallback: string; onChange: (c: string | undefined) => void }) {
  return (
    <label className="field">
      <span>צבע</span>
      <span className="row" style={{ gap: 6 }}>
        <input type="color" value={value ?? fallback} onChange={(e) => onChange(e.target.value)} aria-label="צבע האלמנט" />
        {value && (
          <button type="button" className="btn small ghost" onClick={() => onChange(undefined)}>
            ברירת מחדל
          </button>
        )}
      </span>
    </label>
  )
}

// מידה כתובה מההיתר שמתאימה לאלמנט: לחיצה מחילה אותה כאורך או כרוחב
function DimMatch({ project, el, elements }: { project: Project; el: Element; elements: Element[] }) {
  const matches = dimsForElement(project, el, elements)
  if (!matches.length) return null
  const apply = (value: number, raw: string, measured: boolean) => {
    const src = `מידה ${raw} מההיתר`
    const label: Label = measured ? 'measured' : 'estimated'
    if (el.kind === 'wall' || el.kind === 'fence') upsertElement(project.id, { ...setLength(el, value), label, source: src } as Element)
    else if (el.kind === 'opening') upsertElement(project.id, { ...el, width: value, label, source: src })
  }
  return (
    <div style={{ marginTop: 12 }} data-testid="dim-match">
      <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
        מידות כתובות בהיתר, קרובות לאלמנט:
      </div>
      <div className="row" style={{ gap: 6 }}>
        {matches.map(({ d }) => {
          const measured = d.source === 'text-layer' || d.status === 'confirmed'
          return (
            <button key={d.id} className="btn small" onClick={() => apply(d.value, d.raw, measured)} title={measured ? 'מדוד מהיתר' : 'מוערך, ממתין לאישור במסך המידות'}>
              {dimLabelText(d)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
