import { LINES, MATERIALS, OBJECTS, SKETCH_COLORS, type LineType, type ObjectType, type SurfaceMaterial } from '../lib/garden'
import { textureUrl } from '../lib/textures'
import { GardenIcon } from './GardenIcons'

export type Tool = 'select' | 'rect' | 'poly' | 'free' | 'object' | 'line' | 'pen' | 'wall' | 'gwall' | 'fence' | 'opening' | 'calibrate'

export type Group = 'tools' | 'surfaces' | 'plants' | 'structures' | 'water_light' | 'lines' | 'house'

export const GROUPS: { id: Group; t: string }[] = [
  { id: 'tools', t: 'שרטוט' },
  { id: 'surfaces', t: 'משטחים' },
  { id: 'plants', t: 'צמחייה' },
  { id: 'structures', t: 'מבנים ופרטים' },
  { id: 'water_light', t: 'מים ותאורה' },
  { id: 'lines', t: 'קווים' },
  { id: 'house', t: 'מבנה הבית' },
]

export interface PaletteState {
  tool: Tool
  item: string | null
  material: SurfaceMaterial
  color: string | null
  sketchColor: string
  stroke: number
}

interface Tile {
  key: string
  label: string
  icon: string
  tool: Tool
  item?: string
  disabled?: boolean
}

function tilesFor(group: Group, hasBasis: boolean): Tile[] {
  const off = !hasBasis
  switch (group) {
    case 'tools':
      return [
        { key: 'select', label: 'בחירה', icon: 'select', tool: 'select' },
        { key: 'rect', label: 'משטח', icon: 'rect', tool: 'rect', disabled: off },
        { key: 'poly', label: 'משטח מצולע', icon: 'poly', tool: 'poly', disabled: off },
        { key: 'free', label: 'משטח חופשי', icon: 'free', tool: 'free', disabled: off },
        { key: 'pen', label: 'קו חופשי', icon: 'pen', tool: 'pen', disabled: off },
        { key: 'calibrate', label: 'כיול', icon: 'calibrate', tool: 'calibrate' },
      ]
    case 'surfaces':
      return [
        { key: 'rect', label: 'משטח', icon: 'rect', tool: 'rect', disabled: off },
        { key: 'poly', label: 'משטח מצולע', icon: 'poly', tool: 'poly', disabled: off },
        { key: 'free', label: 'משטח חופשי', icon: 'free', tool: 'free', disabled: off },
      ]
    case 'plants':
    case 'structures':
    case 'water_light':
      return (Object.keys(OBJECTS) as ObjectType[])
        .filter((k) => OBJECTS[k].group === group)
        .map((k): Tile => ({ key: k, label: OBJECTS[k].text, icon: k, tool: 'object', item: k, disabled: off }))
        .concat(group === 'plants' ? [{ key: 'hedge', label: LINES.hedge.text, icon: 'hedge', tool: 'line', item: 'hedge', disabled: off } as Tile] : [])
    case 'lines':
      return (Object.keys(LINES) as LineType[]).map((k) => ({ key: k, label: LINES[k].text, icon: k, tool: 'line' as Tool, item: k, disabled: off }))
    case 'house':
      return [
        { key: 'wall', label: 'קיר בית', icon: 'wall', tool: 'wall', disabled: off },
        { key: 'gwall', label: 'קיר גינה', icon: 'gwall', tool: 'gwall', disabled: off },
        { key: 'fence', label: 'גדר', icon: 'fence', tool: 'fence', disabled: off },
        { key: 'opening', label: 'פתח', icon: 'opening', tool: 'opening', disabled: off },
      ]
  }
}

export function GardenPalette({
  group,
  setGroup,
  state,
  pick,
  setMaterial,
  setColor,
  setSketchColor,
  setStroke,
  hasBasis,
}: {
  group: Group
  setGroup: (g: Group) => void
  state: PaletteState
  pick: (tool: Tool, item?: string) => void
  setMaterial: (m: SurfaceMaterial) => void
  setColor: (c: string | null) => void
  setSketchColor: (c: string) => void
  setStroke: (s: number) => void
  hasBasis: boolean
}) {
  const tiles = tilesFor(group, hasBasis)
  const surfaceTool = state.tool === 'rect' || state.tool === 'poly' || state.tool === 'free'
  return (
    <div className="palette" data-testid="garden-palette">
      <div className="palette-groups" role="tablist" aria-label="קבוצות בספריית הגינה">
        {GROUPS.map((g) => (
          <button key={g.id} role="tab" aria-selected={group === g.id} className={`chip ${group === g.id ? 'on' : ''}`} onClick={() => setGroup(g.id)}>
            {g.t}
          </button>
        ))}
      </div>
      <div className="palette-tiles" role="toolbar" aria-label="כלים ואלמנטים">
        {tiles.map((t) => {
          const on = state.tool === t.tool && (t.item ? state.item === t.item : true)
          return (
            <button key={t.key} className={`tile ${on ? 'on' : ''}`} onClick={() => pick(t.tool, t.item)} disabled={t.disabled} aria-pressed={on} title={t.label}>
              <GardenIcon id={t.icon} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {(surfaceTool || group === 'surfaces') && (
        <div className="palette-opts">
          <span className="opt-k">חומר וטקסטורה</span>
          <div className="swatches">
            {(Object.keys(MATERIALS) as SurfaceMaterial[]).map((m) => (
              <button key={m} className={`swatch-btn ${state.material === m ? 'on' : ''}`} onClick={() => setMaterial(m)} aria-pressed={state.material === m} title={MATERIALS[m].text}>
                <i style={{ backgroundImage: `url(${textureUrl(m, state.material === m ? state.color ?? undefined : undefined, 96)})` }} />
                <span>{MATERIALS[m].text}</span>
              </button>
            ))}
          </div>
          <label className="color-field">
            <span className="opt-k">צבע</span>
            <input type="color" value={state.color ?? MATERIALS[state.material].color} onChange={(e) => setColor(e.target.value)} aria-label="צבע המשטח" />
            {state.color && (
              <button className="btn small ghost" onClick={() => setColor(null)}>
                צבע החומר
              </button>
            )}
          </label>
        </div>
      )}

      {state.tool === 'pen' && (
        <div className="palette-opts">
          <span className="opt-k">צבע הקו</span>
          <div className="row" style={{ gap: 6 }}>
            {SKETCH_COLORS.map((c) => (
              <button key={c} className={`dot ${state.sketchColor === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setSketchColor(c)} aria-label={`צבע ${c}`} aria-pressed={state.sketchColor === c} />
            ))}
            <input type="color" value={state.sketchColor} onChange={(e) => setSketchColor(e.target.value)} aria-label="צבע אחר" />
          </div>
          <span className="opt-k">עובי</span>
          <div className="row" style={{ gap: 4 }}>
            {[0.03, 0.08, 0.15, 0.3].map((s) => (
              <button key={s} className={`btn small ${state.stroke === s ? 'active' : ''}`} onClick={() => setStroke(s)}>
                {s < 0.05 ? 'דק' : s < 0.1 ? 'בינוני' : s < 0.2 ? 'עבה' : 'מכחול'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
