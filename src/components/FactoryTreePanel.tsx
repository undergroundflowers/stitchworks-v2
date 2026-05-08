import type { ReactNode } from 'react';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { Button } from './Button';
import { useProject, useGarments, type Line } from '../store';
import { PRODUCTION_SYSTEMS, type ProductionSystem } from '../domain';

interface FactoryTreePanelProps {
  /** Highlight mode — which tier of the tree should appear "active". */
  activeMode?: 'factory' | 'floor' | 'line';
  activeFloorId?: string;
  activeLineId?: string;
  expandedFloorId?: string;
  onPickFactory?: () => void;
  onPickFloor?: (floorId: string) => void;
  onPickLine?: (lineId: string, line: Line) => void;
  onAddLine?: (floorId: string) => void;
  onRunAll?: () => void;
  /** Hide the decorative overlays section (useful in compact contexts). */
  hideOverlays?: boolean;
  /** Extra style overrides for the outer container. */
  style?: React.CSSProperties;
}

/**
 * Left-side factory hierarchy: factory → floors → lines, plus the visual
 * overlays toggles. Reused by Factory Twin (which drives its viewport
 * from selection) and Live Sim (which uses it as a quick navigator).
 */
export function FactoryTreePanel({
  activeMode,
  activeFloorId,
  activeLineId,
  expandedFloorId,
  onPickFactory,
  onPickFloor,
  onPickLine,
  onAddLine,
  onRunAll,
  hideOverlays = false,
  style,
}: FactoryTreePanelProps) {
  const project = useProject((s) => s);
  const garments = useGarments();
  const factory = project.factory;

  return (
    <div style={{ borderRight: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paper, overflow: 'auto', padding: 16, ...style }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 }}>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px' }}>FACTORY TREE</div>
        {onRunAll && (
          <Button variant="ghost" size="sm" onClick={onRunAll} icon="▶">Run all</Button>
        )}
      </div>

      <TreeNode
        label={project.meta.name || 'Test Factory'}
        sub={`${factory.floors.length} floors · ${factory.lines.length} lines`}
        expanded
        active={activeMode === 'factory'}
        onClick={onPickFactory}
      >
        {factory.floors.map((f) => {
          const floorLines = factory.lines.filter((l) => l.floorId === f.id);
          return (
            <TreeNode key={f.id} indent={1}
              label={f.name}
              sub={`${floorLines.length} line${floorLines.length === 1 ? '' : 's'}`}
              expanded={expandedFloorId === f.id || activeFloorId === f.id}
              onClick={() => onPickFloor?.(f.id)}
              active={activeMode === 'floor' && activeFloorId === f.id}
              actions={onAddLine ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onAddLine(f.id); }}
                  style={{ background:'transparent', border:'none', color: SW_COLORS.muted, cursor:'pointer', fontSize: 14, fontWeight: 800, padding: 0 }}
                  title="Add line to this floor"
                >+</button>
              ) : undefined}
            >
              {floorLines.map((l) => {
                const garment = garments.byId[l.garmentTemplateId];
                return (
                  <TreeNode key={l.id} indent={2}
                    label={l.name}
                    sub={`${garment?.name.replace(/\s*\(.*\)/, '') ?? l.garmentTemplateId} · ${l.operators} ops · ${PRODUCTION_SYSTEMS[l.productionSystem as ProductionSystem]?.short ?? l.productionSystem}`}
                    onClick={() => onPickLine?.(l.id, l)}
                    active={activeMode === 'line' && activeLineId === l.id}
                    hasKpis={!!l.lastKpis}
                  />
                );
              })}
            </TreeNode>
          );
        })}
      </TreeNode>

      {!hideOverlays && (
        <>
          <div style={{ marginTop: 24, fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px', marginBottom: 8 }}>OVERLAYS</div>
          {[
            { id:'heat', label:'Bottleneck heat',       color: SW_COLORS.alarm,  on: true  },
            { id:'wip',  label:'WIP density',           color: SW_COLORS.thread, on: true  },
            { id:'op',   label:'Operator utilization',  color: SW_COLORS.bobbin, on: false },
            { id:'qual', label:'Defect zones',          color: SW_COLORS.press,  on: false },
          ].map(ov => (
            <label key={ov.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', cursor:'pointer', fontSize:12, fontWeight:600, color: SW_COLORS.ink }}>
              <input type="checkbox" defaultChecked={ov.on} style={{ accentColor: ov.color }}/>
              <span style={{ width:8, height:8, background: ov.color, borderRadius:2 }}/>
              {ov.label}
            </label>
          ))}
        </>
      )}
    </div>
  );
}

interface TreeNodeProps {
  label: string;
  sub?: string;
  indent?: number;
  expanded?: boolean;
  children?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  hasKpis?: boolean;
  actions?: ReactNode;
}

function TreeNode({ label, sub, indent = 0, expanded, children, onClick, active, hasKpis, actions }: TreeNodeProps) {
  return (
    <div>
      <div onClick={onClick} style={{
        display:'flex', alignItems:'center', gap:8,
        padding:'6px 8px', borderRadius: SW_RADIUS.sm,
        marginLeft: indent * 14,
        background: active ? SW_COLORS.brandLite : 'transparent',
        cursor: 'pointer',
        borderLeft: active ? `3px solid ${SW_COLORS.brand}` : '3px solid transparent',
      }}>
        <span style={{ fontFamily: SW_FONTS.mono, fontSize: 9, color: SW_COLORS.muted }}>{children ? '▾' : '·'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SW_FONTS.body, fontWeight: 700, fontSize: 12, color: SW_COLORS.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
          {sub && <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted, fontWeight: 600 }}>{sub}</div>}
        </div>
        {hasKpis && <span style={{ width: 6, height: 6, borderRadius: '50%', background: SW_COLORS.ok }} title="Cached KPIs"/>}
        {actions}
      </div>
      {expanded && children}
    </div>
  );
}
