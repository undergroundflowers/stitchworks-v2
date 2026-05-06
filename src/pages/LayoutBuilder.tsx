import { SW_COLORS, SW_FONTS, SW_RADIUS, SW_SHADOWS } from '../design/tokens';
import { Button, Stat, SectionHeader, ToggleGroup } from '../components';
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const SW_MACHINES = [
  { id:'sew',  label:'Sewing M/C',   icon:'⌃', color: SW_COLORS.brand,  cost: 1200, w:1, h:1 },
  { id:'over', label:'Overlock',     icon:'≋', color: SW_COLORS.bobbin, cost: 1800, w:1, h:1 },
  { id:'btn',  label:'Buttonhole',   icon:'◉', color: SW_COLORS.trim,   cost: 2400, w:1, h:1 },
  { id:'cut',  label:'Cutter',       icon:'✂', color: SW_COLORS.press,  cost: 8000, w:2, h:1 },
  { id:'iron', label:'Press',        icon:'▭', color: SW_COLORS.thread, cost: 1600, w:1, h:1 },
  { id:'rack', label:'WIP Rack',     icon:'▥', color: SW_COLORS.fabric, cost: 200,  w:1, h:1 },
  { id:'ins',  label:'Inspect Stn',  icon:'◇', color: SW_COLORS.steel,  cost: 800,  w:1, h:1 },
  { id:'pack', label:'Pack Stn',     icon:'□', color: SW_COLORS.ship,   cost: 1000, w:2, h:1 },
];

interface PlacedMachine { id: number; type: string; x: number; y: number; }
interface DragState {
  kind: 'palette' | 'move';
  type?: string;
  id?: number;
}
interface HoverCell { x: number; y: number; }

export function LayoutBuilderPage() {
  const navigate = useNavigate();
  const GRID_W = 24, GRID_H = 14, CELL = 36;
  const [placed, setPlaced] = useState<PlacedMachine[]>([
    { id:1, type:'cut',  x:1,  y:1 },
    { id:2, type:'sew',  x:5,  y:3 },
    { id:3, type:'sew',  x:7,  y:3 },
    { id:4, type:'sew',  x:9,  y:3 },
    { id:5, type:'over', x:11, y:3 },
    { id:6, type:'btn',  x:13, y:3 },
    { id:7, type:'iron', x:15, y:3 },
    { id:8, type:'ins',  x:17, y:3 },
    { id:9, type:'pack', x:19, y:3 },
    { id:10,type:'rack', x:5,  y:6 }, { id:11, type:'rack', x:7, y:6 }, { id:12, type:'rack', x:9, y:6 },
  ]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<HoverCell | null>(null);
  const [tool, setTool] = useState<string>('place');
  const idRef = useRef<number>(100);

  const totalCost = placed.reduce((s,p)=> s + (SW_MACHINES.find(m=>m.id===p.type)?.cost||0), 0);

  function gridCell(e: React.DragEvent<HTMLDivElement>, gridEl: HTMLDivElement): HoverCell {
    const r = gridEl.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left)/CELL), y: Math.floor((e.clientY - r.top)/CELL) };
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const cell = gridCell(e, e.currentTarget);
    if (drag?.kind === 'palette') {
      idRef.current += 1;
      setPlaced(p => [...p, { id: idRef.current, type: drag.type as string, x: cell.x, y: cell.y }]);
    } else if (drag?.kind === 'move') {
      setPlaced(p => p.map(m => m.id === drag.id ? { ...m, x: cell.x, y: cell.y } : m));
    }
    setDrag(null);
    setHover(null);
  }

  return (
    <div style={{ width:'100%', height:'100%', display:'grid', gridTemplateColumns:'260px 1fr 280px', background: SW_COLORS.paperDeep }}>
      {/* PALETTE */}
      <div style={{ borderRight:`1px solid ${SW_COLORS.line}`, background: SW_COLORS.paper, padding:16, overflow:'auto' }}>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px', marginBottom: 10 }}>PALETTE · DRAG TO GRID</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8 }}>
          {SW_MACHINES.map(m => (
            <div key={m.id} draggable
              onDragStart={e => { setDrag({ kind:'palette', type: m.id }); e.dataTransfer.effectAllowed='copy'; }}
              style={{
                border:`1.5px solid ${m.color}40`,
                background: `${m.color}08`,
                borderRadius: SW_RADIUS.sm,
                padding: 10,
                cursor: 'grab',
                userSelect:'none',
              }}>
              <div style={{ fontSize: 22, color: m.color, marginBottom: 4 }}>{m.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: SW_COLORS.ink }}>{m.label}</div>
              <div style={{ fontSize: 10, fontFamily: SW_FONTS.mono, color: SW_COLORS.muted, fontWeight:700 }}>${m.cost}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.5px', marginBottom: 10 }}>TOOLS</div>
        <ToggleGroup value={tool} onChange={setTool} options={[
          { value:'place',  label:'Place' },
          { value:'move',   label:'Move' },
          { value:'delete', label:'Delete' },
        ]}/>

        <div style={{ marginTop: 24 }}>
          <Button variant="secondary" full size="sm" onClick={()=>setPlaced([])}>Clear floor</Button>
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
              {hover && drag && (
                <div style={{
                  position:'absolute',
                  left: hover.x*CELL, top: hover.y*CELL,
                  width: CELL*(SW_MACHINES.find(m=>m.id===(drag.type||placed.find(p=>p.id===drag.id)?.type))?.w||1),
                  height: CELL*(SW_MACHINES.find(m=>m.id===(drag.type||placed.find(p=>p.id===drag.id)?.type))?.h||1),
                  background: SW_COLORS.brand+'30',
                  border: `2px dashed ${SW_COLORS.brand}`,
                  pointerEvents:'none',
                }}/>
              )}

              {placed.map(p => {
                const m = SW_MACHINES.find(x=>x.id===p.type);
                if (!m) return null;
                return (
                  <div key={p.id}
                    draggable={tool==='move'}
                    onDragStart={e => { setDrag({ kind:'move', id: p.id }); e.dataTransfer.effectAllowed='move'; }}
                    onClick={() => { if (tool==='delete') setPlaced(arr => arr.filter(x => x.id !== p.id)); }}
                    style={{
                      position:'absolute',
                      left: p.x*CELL+2, top: p.y*CELL+2,
                      width: m.w*CELL-4, height: m.h*CELL-4,
                      background: m.color, color:'#fff',
                      borderRadius: 4,
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      cursor: tool==='move' ? 'grab' : tool==='delete' ? 'not-allowed' : 'pointer',
                      fontFamily: SW_FONTS.body,
                      fontSize: 11, fontWeight: 700,
                      boxShadow: SW_SHADOWS.card,
                      border: `1px solid #00000020`,
                    }}>
                    <span style={{ fontSize: 18 }}>{m.icon}</span>
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
          <Stat label="MACHINES" value={placed.length}/>
          <Stat label="CAPEX" value={`$${(totalCost/1000).toFixed(1)}k`} color={SW_COLORS.brand}/>
          <Stat label="FLOOR USE" value={`${Math.round(placed.length/(GRID_W*GRID_H)*100)}`} unit="%"/>
          <Stat label="FLOW SCORE" value="B+" color={SW_COLORS.ok}/>
        </div>

        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing:'1.2px', marginBottom: 6 }}>BREAKDOWN</div>
        {SW_MACHINES.map(m => {
          const c = placed.filter(p=>p.type===m.id).length;
          if (!c) return null;
          return (
            <div key={m.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderTop: `1px solid ${SW_COLORS.line}`, fontSize:12 }}>
              <span style={{ fontSize:14, color: m.color, width: 18 }}>{m.icon}</span>
              <span style={{ flex:1, fontWeight:600, color: SW_COLORS.ink }}>{m.label}</span>
              <span style={{ fontFamily: SW_FONTS.mono, fontWeight:700, color: SW_COLORS.muted }}>×{c}</span>
              <span style={{ fontFamily: SW_FONTS.mono, fontWeight:700, color: SW_COLORS.brand, width:60, textAlign:'right' }}>${(c*m.cost).toLocaleString()}</span>
            </div>
          );
        })}

        <div style={{ marginTop: 18, padding: 12, background: SW_COLORS.brandLite, borderRadius: SW_RADIUS.sm, border:`1px solid ${SW_COLORS.brand}30` }}>
          <div style={{ fontFamily: SW_FONTS.mono, fontSize:10, fontWeight:700, color: SW_COLORS.brandDeep, letterSpacing:'1px' }}>FLOW HINT</div>
          <div style={{ fontSize:12, color: SW_COLORS.ink, marginTop:4, lineHeight:1.5 }}>
            Place WIP racks between dissimilar operations to absorb pace mismatch. Your inspect & pack stations should be terminal — far end of the line.
          </div>
        </div>
      </div>
    </div>
  );
}
