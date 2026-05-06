import { SW_COLORS, SW_FONTS, SW_RADIUS, SW_SHADOWS } from '../design/tokens';
import { Button, Stat, SectionHeader, ToggleGroup } from '../components';
import { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  APPAREL_PALETTE,
  PALETTE_BY_ID,
  PALETTE_CATEGORIES,
  type PaletteElement,
  type PaletteCategory,
  MACHINE_CATALOG,
  type MachineCode,
} from '../domain';

interface PlacedElement {
  id: number;
  paletteId: string;
  x: number;
  y: number;
}

interface DragState {
  kind: 'palette' | 'move';
  paletteId?: string;
  id?: number;
}

interface HoverCell { x: number; y: number; }

/**
 * Layout Builder — drag-drop floor planning. The palette on the left is now
 * the apparel palette catalog from src/domain/palette.ts (30 elements across
 * 7 categories: flow / stations / resources / transport / control / quality
 * / layout) — Stitchworks' answer to the AnyLogic Process Modeling Library.
 *
 * Each placed element knows its palette type, so the inspector can show
 * cost, machine spec (if it's a station that wraps a machine), and a flow
 * health hint. Dropping a "Sewing Station" picks up the SNL machine spec by
 * default; dropping an "Embroidery Station" picks up the EMB spec; etc.
 */
export function LayoutBuilderPage() {
  const navigate = useNavigate();
  const GRID_W = 24, GRID_H = 14, CELL = 36;

  // Default placement that mirrors the original prototype's seeded layout
  // but keyed by APPAREL_PALETTE element ids so the inspector lights up.
  const [placed, setPlaced] = useState<PlacedElement[]>([
    { id: 1,  paletteId: 'cutting_station',   x: 1,  y: 1 },
    { id: 2,  paletteId: 'sewing_station',    x: 5,  y: 3 },
    { id: 3,  paletteId: 'sewing_station',    x: 7,  y: 3 },
    { id: 4,  paletteId: 'sewing_station',    x: 9,  y: 3 },
    { id: 5,  paletteId: 'sewing_station',    x: 11, y: 3 },
    { id: 6,  paletteId: 'sewing_station',    x: 13, y: 3 },
    { id: 7,  paletteId: 'pressing_station',  x: 15, y: 3 },
    { id: 8,  paletteId: 'inline_inspection', x: 17, y: 3 },
    { id: 9,  paletteId: 'packing_station',   x: 19, y: 3 },
    { id: 10, paletteId: 'wip_rack',          x: 5,  y: 6 },
    { id: 11, paletteId: 'wip_rack',          x: 7,  y: 6 },
    { id: 12, paletteId: 'wip_rack',          x: 9,  y: 6 },
  ]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<HoverCell | null>(null);
  const [tool, setTool] = useState<string>('place');
  const [paletteCategory, setPaletteCategory] = useState<PaletteCategory>('station');
  const idRef = useRef<number>(100);

  const totalCost = useMemo(
    () => placed.reduce((s, p) => s + costOf(PALETTE_BY_ID[p.paletteId]), 0),
    [placed],
  );

  function gridCell(e: React.DragEvent<HTMLDivElement>, gridEl: HTMLDivElement): HoverCell {
    const r = gridEl.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left)/CELL), y: Math.floor((e.clientY - r.top)/CELL) };
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const cell = gridCell(e, e.currentTarget);
    if (drag?.kind === 'palette' && drag.paletteId) {
      idRef.current += 1;
      setPlaced(p => [...p, { id: idRef.current, paletteId: drag.paletteId as string, x: cell.x, y: cell.y }]);
    } else if (drag?.kind === 'move') {
      setPlaced(p => p.map(m => m.id === drag.id ? { ...m, x: cell.x, y: cell.y } : m));
    }
    setDrag(null);
    setHover(null);
  }

  const filteredPalette = APPAREL_PALETTE.filter(e => e.category === paletteCategory);

  return (
    <div style={{ width:'100%', height:'100%', display:'grid', gridTemplateColumns:'280px 1fr 300px', background: SW_COLORS.paperDeep }}>
      {/* PALETTE */}
      <div style={{ borderRight:`1px solid ${SW_COLORS.line}`, background: SW_COLORS.paper, overflow:'auto', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:16, paddingBottom:8 }}>
          <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px', marginBottom: 8 }}>APPAREL PALETTE · DRAG TO GRID</div>
          <div style={{ fontSize: 10, color: SW_COLORS.muted, marginBottom: 10, lineHeight: 1.4 }}>
            {APPAREL_PALETTE.length} elements across {PALETTE_CATEGORIES.length} categories — Stitchworks' apparel-domain answer to the AnyLogic palette.
          </div>
        </div>

        <div style={{ padding:'0 12px 8px', display:'flex', gap:4, flexWrap:'wrap' }}>
          {PALETTE_CATEGORIES.map(c => {
            const active = paletteCategory === c.id;
            return (
              <button key={c.id} onClick={() => setPaletteCategory(c.id)}
                style={{
                  padding:'4px 8px', fontSize:10, fontWeight:700,
                  border:`1px solid ${active?SW_COLORS.ink:SW_COLORS.line}`,
                  background: active?SW_COLORS.ink:'transparent',
                  color: active?SW_COLORS.paper:SW_COLORS.muted,
                  borderRadius: SW_RADIUS.sm, cursor:'pointer',
                  fontFamily: SW_FONTS.mono, letterSpacing:'0.5px',
                }}>{c.label.toUpperCase()}</button>
            );
          })}
        </div>

        <div style={{ padding:'4px 16px 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap: 6 }}>
          {filteredPalette.map(p => {
            const cost = costOf(p);
            return (
              <div key={p.id} draggable
                onDragStart={e => { setDrag({ kind:'palette', paletteId: p.id }); e.dataTransfer.effectAllowed='copy'; }}
                title={`${p.description}\n\nAnyLogic equivalent: ${p.anyLogicEquivalent ?? '—'}`}
                style={{
                  border:`1.5px solid ${p.color}40`,
                  background: `${p.color}08`,
                  borderRadius: SW_RADIUS.sm,
                  padding: 8,
                  cursor: 'grab',
                  userSelect:'none',
                  display:'flex', flexDirection:'column', gap:2,
                }}>
                <div style={{ fontSize: 18, color: p.color }}>{p.icon}</div>
                <div style={{ fontSize: 10, fontWeight: 800, color: SW_COLORS.ink, lineHeight: 1.2 }}>{p.shortName ?? p.label}</div>
                {cost > 0 && (
                  <div style={{ fontSize: 9, fontFamily: SW_FONTS.mono, color: SW_COLORS.muted, fontWeight:700 }}>${cost.toLocaleString()}</div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 'auto', padding:'12px 16px 16px', borderTop:`1px solid ${SW_COLORS.line}` }}>
          <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px', marginBottom: 8 }}>TOOLS</div>
          <ToggleGroup value={tool} onChange={setTool} options={[
            { value:'place',  label:'Place' },
            { value:'move',   label:'Move' },
            { value:'delete', label:'Delete' },
          ]}/>
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" full size="sm" onClick={()=>setPlaced([])}>Clear floor</Button>
          </div>
        </div>
      </div>

      {/* GRID */}
      <div style={{ display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'12px 18px', background: SW_COLORS.paper, borderBottom: `1px solid ${SW_COLORS.line}`, display:'flex', alignItems:'center', gap: 14 }}>
          <SectionHeader kicker="Layout" title="Floor 1 · Sewing" sub={`${GRID_W} × ${GRID_H} cells · ${(GRID_W*GRID_H/9).toFixed(0)}m²`}/>
          <div style={{ flex:1 }}/>
          <Button variant="secondary" size="sm" icon="↶">Undo</Button>
          <Button variant="dark" size="sm" icon="✓" onClick={()=>navigate('/twin')}>Save layout</Button>
        </div>

        <div style={{ flex:1, overflow:'auto', padding: 24, display:'flex', justifyContent:'center', alignItems:'flex-start' }}>
          <div onDragOver={e=>{ e.preventDefault(); setHover(gridCell(e, e.currentTarget)); }}
               onDrop={handleDrop}
               onDragLeave={()=>setHover(null)}
               style={{
                position:'relative',
                width: GRID_W*CELL, height: GRID_H*CELL,
                background: `
                  linear-gradient(${SW_COLORS.line} 1px, transparent 1px),
                  linear-gradient(90deg, ${SW_COLORS.line} 1px, transparent 1px),
                  ${SW_COLORS.paper}
                `,
                backgroundSize: `${CELL}px ${CELL}px`,
                border: `2px solid ${SW_COLORS.ink}`,
                boxShadow: SW_SHADOWS.pop,
              }}>
              {/* hover preview */}
              {hover && drag && (() => {
                const previewId = drag.paletteId ?? placed.find(p => p.id === drag.id)?.paletteId;
                const preview = previewId ? PALETTE_BY_ID[previewId] : null;
                const w = footprintW(preview);
                const h = footprintH(preview);
                return (
                  <div style={{
                    position:'absolute',
                    left: hover.x*CELL, top: hover.y*CELL,
                    width: CELL*w, height: CELL*h,
                    background: SW_COLORS.brand+'30',
                    border: `2px dashed ${SW_COLORS.brand}`,
                    pointerEvents:'none',
                  }}/>
                );
              })()}

              {placed.map(p => {
                const el = PALETTE_BY_ID[p.paletteId];
                if (!el) return null;
                const w = footprintW(el);
                const h = footprintH(el);
                return (
                  <div key={p.id}
                    draggable={tool==='move'}
                    onDragStart={e => { setDrag({ kind:'move', id: p.id }); e.dataTransfer.effectAllowed='move'; }}
                    onClick={() => { if (tool==='delete') setPlaced(arr => arr.filter(x => x.id !== p.id)); }}
                    title={el.label}
                    style={{
                      position:'absolute',
                      left: p.x*CELL+2, top: p.y*CELL+2,
                      width: w*CELL-4, height: h*CELL-4,
                      background: el.color, color:'#fff',
                      borderRadius: 4,
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      cursor: tool==='move' ? 'grab' : tool==='delete' ? 'not-allowed' : 'pointer',
                      fontFamily: SW_FONTS.body,
                      fontSize: 11, fontWeight: 700,
                      boxShadow: SW_SHADOWS.card,
                      border: `1px solid #00000020`,
                    }}>
                    <span style={{ fontSize: 18 }}>{el.icon}</span>
                    <span style={{ fontSize: 9, fontFamily: SW_FONTS.mono, opacity:0.85 }}>#{p.id}</span>
                  </div>
                );
              })}
            </div>
        </div>
      </div>

      {/* INSPECTOR */}
      <div style={{ borderLeft:`1px solid ${SW_COLORS.line}`, background: SW_COLORS.paper, padding:16, overflow:'auto' }}>
        <SectionHeader kicker="Cost & flow" title="Layout summary"/>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom: 18 }}>
          <Stat label="ELEMENTS" value={placed.length}/>
          <Stat label="CAPEX" value={`$${(totalCost/1000).toFixed(1)}k`} color={SW_COLORS.brand}/>
          <Stat label="FLOOR USE" value={`${Math.round(placed.length/(GRID_W*GRID_H)*100)}`} unit="%"/>
          <Stat label="FLOW SCORE" value="B+" color={SW_COLORS.ok}/>
        </div>

        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.2px', marginBottom: 6 }}>BREAKDOWN BY CATEGORY</div>
        {PALETTE_CATEGORIES.map(c => {
          const inCat = placed.filter(p => PALETTE_BY_ID[p.paletteId]?.category === c.id);
          if (!inCat.length) return null;
          const subtotal = inCat.reduce((s, p) => s + costOf(PALETTE_BY_ID[p.paletteId]), 0);
          return (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, fontWeight:700, padding:'4px 0', borderBottom:`1px solid ${SW_COLORS.line}` }}>
                <span style={{ fontFamily: SW_FONTS.mono, color: SW_COLORS.muted, letterSpacing:'1px' }}>{c.label.toUpperCase()}</span>
                <span style={{ fontFamily: SW_FONTS.mono, color: SW_COLORS.brand }}>${subtotal.toLocaleString()}</span>
              </div>
              {Array.from(new Set(inCat.map(p => p.paletteId))).map(pid => {
                const el = PALETTE_BY_ID[pid];
                const c2 = inCat.filter(p => p.paletteId === pid).length;
                return (
                  <div key={pid} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', fontSize:11 }}>
                    <span style={{ fontSize:13, color: el.color, width: 16 }}>{el.icon}</span>
                    <span style={{ flex:1, fontWeight:600, color: SW_COLORS.ink }}>{el.shortName ?? el.label}</span>
                    <span style={{ fontFamily: SW_FONTS.mono, fontWeight:700, color: SW_COLORS.muted }}>×{c2}</span>
                  </div>
                );
              })}
            </div>
          );
        })}

        <div style={{ marginTop: 18, padding: 12, background: SW_COLORS.brandLite, borderRadius: SW_RADIUS.sm, border:`1px solid ${SW_COLORS.brand}30` }}>
          <div style={{ fontFamily: SW_FONTS.mono, fontSize:10, fontWeight:700, color: SW_COLORS.brandDeep, letterSpacing:'1px' }}>FLOW HINT</div>
          <div style={{ fontSize:12, color: SW_COLORS.ink, marginTop:4, lineHeight:1.5 }}>
            Place WIP racks between dissimilar operations to absorb pace mismatch. Inspect &amp; pack should be terminal — far end of the line. Material handlers move bundles between zones; budget ~1 handler per 8 sewing stations.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Cost lookup: stations that wrap a machine pull cost from MACHINE_CATALOG;
 * resources/control/layout default to a small fixed unit cost so the totals
 * still reflect floor-buildout spend.
 */
function costOf(el: PaletteElement | undefined): number {
  if (!el) return 0;
  const machineCode = (el.defaultProps?.machine as MachineCode | undefined);
  if (machineCode && MACHINE_CATALOG[machineCode]) {
    return MACHINE_CATALOG[machineCode].costUsd;
  }
  // Generic per-element cost for non-machine elements (pools, racks, layout).
  switch (el.category) {
    case 'transport': return 600;
    case 'control':   return 200;
    case 'quality':   return el.id === 'rework_cell' ? 1200 : 800;
    case 'layout':    return 0;
    case 'resource':  return 0;
    case 'flow':      return 0;
    default:          return 0;
  }
}

function footprintW(el: PaletteElement | null | undefined): number {
  if (!el) return 1;
  const machineCode = (el.defaultProps?.machine as MachineCode | undefined);
  if (machineCode && MACHINE_CATALOG[machineCode]) {
    return MACHINE_CATALOG[machineCode].footprintCells.w;
  }
  if (el.id === 'overhead_conveyor') return 4;
  if (el.id === 'wip_rack') return 1;
  if (el.id === 'zone') return 6;
  return 1;
}

function footprintH(el: PaletteElement | null | undefined): number {
  if (!el) return 1;
  const machineCode = (el.defaultProps?.machine as MachineCode | undefined);
  if (machineCode && MACHINE_CATALOG[machineCode]) {
    return MACHINE_CATALOG[machineCode].footprintCells.h;
  }
  if (el.id === 'overhead_conveyor') return 1;
  if (el.id === 'zone') return 4;
  return 1;
}
