import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SW_COLORS, SW_FONTS } from '../design/tokens';
import {
  ISO_FIXTURE_CATALOG,
  ISO_CATEGORIES,
  ISO_LAYOUT_FACTORY,
  ISO_LAYOUT_DEPT_BY_ID,
  SW_PAL,
  isoProj,
  unproject,
  ptsToStr,
  defaultPropsFor,
  loadIsoLayouts,
  saveIsoLayouts,
  type IsoLayout,
  type IsoLayoutMap,
  type IsoElement,
  type IsoLinkKind,
  type IsoFixturePropValue,
} from '../domain';

/**
 * Iso Builder — isometric 3D-feel layout builder. Two modes, switched on the URL:
 *
 *   /iso                   → factory-level builder
 *   /iso/dept/:deptId      → builder scoped to one department
 *
 * Ported 1:1 from the design prototype's sw/sw-iso-builder-screen.jsx; data and
 * SVG draw fns live in src/domain/iso.ts. Visual fidelity is preserved — every
 * inline style, SVG path, animation, and constant matches the prototype.
 */

// ============================================================================
// SHARED STYLE CONSTS (top-level so children can borrow)
// ============================================================================

const btnSec: CSSProperties = {
  background: SW_COLORS.paper,
  border: `1px solid ${SW_COLORS.line}`,
  padding: '6px 11px',
  fontFamily: SW_FONTS.display,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.06em',
  cursor: 'pointer',
  borderRadius: 6,
  color: SW_COLORS.steel,
};

const btnPrim: CSSProperties = {
  background: SW_COLORS.brand,
  border: 'none',
  color: '#fff',
  padding: '6px 12px',
  fontFamily: SW_FONTS.display,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.06em',
  cursor: 'pointer',
  borderRadius: 6,
};

const btnIcon: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  width: 24,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: SW_FONTS.display,
  fontWeight: 900,
  color: SW_COLORS.steel,
  borderRadius: 4,
};

// ============================================================================
// MAIN PAGE
// ============================================================================

type Mode = 'factory' | 'dept';

export function IsoBuilderPage() {
  const navigate = useNavigate();
  const { deptId } = useParams<{ deptId: string }>();
  const mode: Mode = deptId ? 'dept' : 'factory';

  const layoutKey = mode === 'dept' ? 'dept_' + deptId : 'factory';

  const [layouts, setLayouts] = useState<IsoLayoutMap>(() => {
    const all = loadIsoLayouts();
    if (!all[layoutKey]) {
      all[layoutKey] =
        mode === 'dept'
          ? ISO_LAYOUT_DEPT_BY_ID(deptId || 'unknown')
          : ISO_LAYOUT_FACTORY;
      saveIsoLayouts(all);
    }
    return all;
  });
  const [activeLayoutKey, setActiveLayoutKey] = useState<string>(layoutKey);
  const layout: IsoLayout = layouts[activeLayoutKey] || layouts[layoutKey];

  const setLayout = useCallback(
    (next: IsoLayout | ((L: IsoLayout) => IsoLayout)) => {
      const updater = typeof next === 'function' ? (next as (L: IsoLayout) => IsoLayout)(layout) : next;
      const newAll: IsoLayoutMap = { ...layouts, [activeLayoutKey]: updater };
      setLayouts(newAll);
      saveIsoLayouts(newAll);
    },
    [layout, layouts, activeLayoutKey],
  );

  const [activeCat, setActiveCat] = useState<string>('arch');
  const [search, setSearch] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  const [draggingAsset, setDraggingAsset] = useState<string | null>(null);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [linkMode, setLinkMode] = useState<IsoLinkKind | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [showRelationships, setShowRelationships] = useState<boolean>(true);
  const [showWorkflow, setShowWorkflow] = useState<boolean>(false);
  const [showJSON, setShowJSON] = useState<boolean>(false);

  const stageRef = useRef<HTMLDivElement | null>(null);

  const filteredCatalog = useMemo(() => {
    const cat = ISO_FIXTURE_CATALOG.filter((a) => a.cat === activeCat);
    if (!search) return cat;
    const s = search.toLowerCase();
    return cat.filter((a) => a.label.toLowerCase().includes(s));
  }, [activeCat, search]);

  // ----- mutations -----
  function addElement(catalogId: string, x: number, y: number) {
    const a = ISO_FIXTURE_CATALOG.find((c) => c.id === catalogId);
    if (!a) return;
    const newId = 'el-' + Date.now().toString(36);
    setLayout((L) => ({
      ...L,
      elements: [...L.elements, { id: newId, catalogId, x, y, rot: 0, props: defaultPropsFor(catalogId) }],
    }));
    setSelectedId(newId);
  }
  function moveElement(id: string, x: number, y: number) {
    setLayout((L) => ({ ...L, elements: L.elements.map((e) => (e.id === id ? { ...e, x, y } : e)) }));
  }
  function rotateElement(id: string) {
    setLayout((L) => ({
      ...L,
      elements: L.elements.map((e) => (e.id === id ? { ...e, rot: (e.rot + 90) % 360 } : e)),
    }));
  }
  function deleteElement(id: string) {
    setLayout((L) => ({
      ...L,
      elements: L.elements.filter((e) => e.id !== id),
      links: L.links.filter((l) => l.from !== id && l.to !== id),
    }));
    setSelectedId(null);
  }
  function duplicateElement(id: string) {
    const e = layout.elements.find((x) => x.id === id);
    if (!e) return;
    const newId = 'el-' + Date.now().toString(36);
    setLayout((L) => ({
      ...L,
      elements: [
        ...L.elements,
        { ...(JSON.parse(JSON.stringify(e)) as IsoElement), id: newId, x: e.x + 1, y: e.y + 1 },
      ],
    }));
    setSelectedId(newId);
  }
  function updateProp(id: string, key: string, value: IsoFixturePropValue) {
    setLayout((L) => ({
      ...L,
      elements: L.elements.map((e) => (e.id === id ? { ...e, props: { ...e.props, [key]: value } } : e)),
    }));
  }
  function addLink(kind: IsoLinkKind, from: string, to: string) {
    if (from === to) return;
    const newId = 'lk-' + Date.now().toString(36);
    setLayout((L) => ({ ...L, links: [...(L.links || []), { id: newId, kind, from, to, label: '' }] }));
  }

  // ----- pointer handlers on canvas -----
  function onCanvasMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left - rect.width / 2 - pan.x) / zoom;
    const sy = (e.clientY - rect.top - rect.height / 2 - pan.y) / zoom;
    const w = unproject(sx, sy);
    const cell = { x: Math.floor(w.x), y: Math.floor(w.y) };
    if (cell.x >= 0 && cell.x < layout.gridW && cell.y >= 0 && cell.y < layout.gridH) {
      setHoverCell(cell);
    } else {
      setHoverCell(null);
    }
  }
  function onCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!hoverCell) return;
    if (draggingAsset) {
      addElement(draggingAsset, hoverCell.x, hoverCell.y);
      setDraggingAsset(null);
      return;
    }
    const t = e.target as Element;
    if (t.tagName === 'rect' || t.tagName === 'svg') setSelectedId(null);
  }
  function onElementClick(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (linkMode) {
      if (!linkFrom) {
        setLinkFrom(id);
      } else if (linkFrom !== id) {
        addLink(linkMode, linkFrom, id);
        setLinkFrom(null);
        setLinkMode(null);
      }
      return;
    }
    setSelectedId(id);
  }
  function onElementDragStart(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (linkMode) return;
    setSelectedId(id);
    const startX = e.clientX,
      startY = e.clientY;
    const el = layout.elements.find((x) => x.id === id);
    if (!el) return;
    const x0 = el.x,
      y0 = el.y;
    function move(ev: MouseEvent) {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      const w = unproject(dx, dy);
      const nx = Math.max(0, Math.min(layout.gridW - 1, Math.round(x0 + w.x)));
      const ny = Math.max(0, Math.min(layout.gridH - 1, Math.round(y0 + w.y)));
      moveElement(id, nx, ny);
    }
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
  function onPanStart(e: React.MouseEvent<HTMLDivElement>) {
    const t = e.target as Element;
    if (t.tagName !== 'svg' && t.tagName !== 'rect') return;
    if (draggingAsset || linkMode) return;
    const startX = e.clientX,
      startY = e.clientY;
    const p0 = { ...pan };
    function move(ev: MouseEvent) {
      setPan({ x: p0.x + (ev.clientX - startX), y: p0.y + (ev.clientY - startY) });
    }
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' && selectedId) rotateElement(selectedId);
      const t = e.target as Element | null;
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedId &&
        t?.tagName !== 'INPUT' &&
        t?.tagName !== 'TEXTAREA'
      )
        deleteElement(selectedId);
      if (e.key === 'Escape') {
        setLinkMode(null);
        setLinkFrom(null);
        setDraggingAsset(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, layout]);

  // depth-sorted elements
  const sorted = useMemo(
    () => [...layout.elements].sort((a, b) => a.x + a.y - (b.x + b.y)),
    [layout.elements],
  );
  const selected = layout.elements.find((e) => e.id === selectedId) || null;

  function onBack() {
    if (mode === 'dept') navigate(`/dept/${deptId}`);
    else navigate('/twin');
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateColumns: '260px 1fr 320px',
        gridTemplateRows: 'auto 1fr',
        background: SW_COLORS.paperDeep,
        fontFamily: SW_FONTS.body,
      }}
    >
      {/* top bar */}
      <div
        style={{
          gridColumn: '1 / 4',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          background: SW_COLORS.paper,
          borderBottom: `1px solid ${SW_COLORS.line}`,
        }}
      >
        <button onClick={onBack} style={btnSec}>
          ← BACK
        </button>
        <div
          style={{
            fontFamily: SW_FONTS.display,
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: '-0.01em',
          }}
        >
          {mode === 'dept' ? 'DEPT BUILDER · ' + (deptId || '').toUpperCase() : 'FACTORY BUILDER'}
        </div>
        <div style={{ flex: 1 }} />
        <LayoutSelector
          layouts={layouts}
          activeKey={activeLayoutKey}
          onPick={setActiveLayoutKey}
          onNew={(name) => {
            const k = 'custom_' + Date.now().toString(36);
            const all: IsoLayoutMap = {
              ...layouts,
              [k]: { ...(JSON.parse(JSON.stringify(layout)) as IsoLayout), name },
            };
            setLayouts(all);
            saveIsoLayouts(all);
            setActiveLayoutKey(k);
          }}
        />
        <button onClick={() => setShowJSON(true)} style={btnSec}>
          EXPORT JSON
        </button>
        <button onClick={() => navigate('/floor')} style={btnPrim}>
          ▶ RUN SIM
        </button>
      </div>

      {/* left palette */}
      <div
        style={{
          gridColumn: '1',
          gridRow: '2',
          borderRight: `1px solid ${SW_COLORS.line}`,
          background: SW_COLORS.paper,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {/* category tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            borderBottom: `1px solid ${SW_COLORS.line}`,
          }}
        >
          {ISO_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              title={c.label}
              style={{
                background: activeCat === c.id ? SW_COLORS.ink : 'transparent',
                color: activeCat === c.id ? '#fff' : SW_COLORS.steel,
                border: 'none',
                cursor: 'pointer',
                padding: '10px 0',
                fontFamily: SW_FONTS.display,
                fontSize: 14,
                fontWeight: 900,
              }}
            >
              {c.icon}
            </button>
          ))}
        </div>
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${SW_COLORS.line}` }}>
          <div
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 9,
              fontWeight: 700,
              color: SW_COLORS.muted,
              letterSpacing: '1.5px',
              marginBottom: 4,
            }}
          >
            {(ISO_CATEGORIES.find((c) => c.id === activeCat)?.label || '').toUpperCase()}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            style={{
              width: '100%',
              padding: '5px 8px',
              fontSize: 11,
              fontFamily: SW_FONTS.mono,
              border: `1px solid ${SW_COLORS.line}`,
              borderRadius: 4,
            }}
          />
        </div>
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 8,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
          }}
        >
          {filteredCatalog.map((a) => (
            <div
              key={a.id}
              onClick={() => setDraggingAsset(a.id)}
              style={{
                background: draggingAsset === a.id ? SW_COLORS.brandLite : SW_COLORS.paperDeep,
                border: `1px solid ${draggingAsset === a.id ? SW_COLORS.brand : SW_COLORS.line}`,
                borderRadius: 6,
                padding: 6,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <svg width={64} height={48} viewBox="-32 -24 64 48" style={{ display: 'block' }}>
                {a.draw({ w: a.w, d: a.d, h: a.h }) as ReactNode}
              </svg>
              <div
                style={{
                  fontFamily: SW_FONTS.mono,
                  fontSize: 9,
                  fontWeight: 700,
                  color: SW_COLORS.steel,
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}
              >
                {a.label}
              </div>
            </div>
          ))}
        </div>
        {/* active drag chip */}
        {draggingAsset && (
          <div
            style={{
              padding: '8px 12px',
              background: SW_COLORS.brand,
              color: '#fff',
              fontFamily: SW_FONTS.display,
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '0.06em',
            }}
          >
            ✚ Click on canvas to place · Esc to cancel
          </div>
        )}
      </div>

      {/* canvas */}
      <div
        style={{
          gridColumn: '2',
          gridRow: '2',
          position: 'relative',
          overflow: 'hidden',
          background: '#FAF8F2',
        }}
      >
        {/* top toolbar overlay */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            right: 10,
            zIndex: 4,
            display: 'flex',
            gap: 6,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 4,
              background: SW_COLORS.paper,
              padding: 3,
              borderRadius: 6,
              border: `1px solid ${SW_COLORS.line}`,
            }}
          >
            {(['flow', 'operator', 'conv', 'buffer', 'power', 'comm'] as IsoLinkKind[]).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setLinkMode(linkMode === k ? null : k);
                  setLinkFrom(null);
                }}
                style={{
                  background: linkMode === k ? SW_COLORS.brand : 'transparent',
                  color: linkMode === k ? '#fff' : SW_COLORS.steel,
                  border: 'none',
                  padding: '5px 9px',
                  fontFamily: SW_FONTS.display,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                  borderRadius: 4,
                }}
              >
                {(
                  { flow: 'FLOW', operator: 'OPER', conv: 'CONV', buffer: 'BUF', power: 'PWR', comm: 'COMM' } as Record<
                    IsoLinkKind,
                    string
                  >
                )[k]}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowRelationships((s) => !s)}
            style={{
              ...btnSec,
              background: showRelationships ? SW_COLORS.ink : SW_COLORS.paper,
              color: showRelationships ? '#fff' : SW_COLORS.steel,
            }}
          >
            {showRelationships ? '◉ LINKS ON' : '○ LINKS OFF'}
          </button>
          <button onClick={() => setShowWorkflow((s) => !s)} style={btnSec}>
            WORKFLOW
          </button>
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: 'flex',
              gap: 4,
              background: SW_COLORS.paper,
              padding: 3,
              borderRadius: 6,
              border: `1px solid ${SW_COLORS.line}`,
            }}
          >
            <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))} style={btnIcon}>
              −
            </button>
            <div
              style={{
                padding: '4px 8px',
                fontFamily: SW_FONTS.mono,
                fontSize: 11,
                fontWeight: 700,
                minWidth: 44,
                textAlign: 'center',
              }}
            >
              {Math.round(zoom * 100) + '%'}
            </div>
            <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))} style={btnIcon}>
              +
            </button>
            <button
              onClick={() => {
                setPan({ x: 0, y: 0 });
                setZoom(1);
              }}
              style={btnIcon}
            >
              ⌂
            </button>
          </div>
        </div>

        {/* status (link mode hint) */}
        {linkMode && (
          <div
            style={{
              position: 'absolute',
              top: 56,
              left: 14,
              zIndex: 4,
              background: SW_COLORS.brand,
              color: '#fff',
              padding: '5px 10px',
              fontFamily: SW_FONTS.mono,
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 4,
            }}
          >
            {linkFrom ? '→ Click target element' : 'Click source element'}
          </div>
        )}

        {/* stage */}
        <div
          ref={stageRef}
          onMouseMove={onCanvasMouseMove}
          onClick={onCanvasClick}
          onMouseDown={onPanStart}
          style={{
            position: 'absolute',
            inset: 0,
            cursor: draggingAsset ? 'crosshair' : linkMode ? 'pointer' : 'grab',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            <svg width={1} height={1} style={{ overflow: 'visible' }}>
              {/* ground */}
              <IsoGround w={layout.gridW} h={layout.gridH} />
              {/* hover cell highlight */}
              {hoverCell && <IsoCellHighlight x={hoverCell.x} y={hoverCell.y} />}
              {/* elements */}
              {sorted.map((e) => {
                const a = ISO_FIXTURE_CATALOG.find((c) => c.id === e.catalogId);
                if (!a) return null;
                const p = isoProj(e.x, e.y, 0);
                return (
                  <g
                    key={e.id}
                    transform={`translate(${p.sx}, ${p.sy})`}
                    onClick={(ev) => onElementClick(e.id, ev)}
                    onMouseDown={(ev) => onElementDragStart(e.id, ev)}
                    style={{ cursor: linkMode ? 'crosshair' : 'grab' }}
                  >
                    {a.draw({ w: a.w, d: a.d, h: a.h }) as ReactNode}
                    {/* selection ring */}
                    {e.id === selectedId &&
                      (() => {
                        const A = isoProj(0, 0, 0),
                          B = isoProj(a.w, 0, 0),
                          C = isoProj(a.w, a.d, 0),
                          D = isoProj(0, a.d, 0);
                        return (
                          <polygon
                            points={ptsToStr([A, B, C, D])}
                            fill="none"
                            stroke={SW_COLORS.brand}
                            strokeWidth={2.5}
                            strokeDasharray="3 2"
                          />
                        );
                      })()}
                    {/* link source ring */}
                    {e.id === linkFrom &&
                      (() => {
                        const A = isoProj(0, 0, 0),
                          B = isoProj(a.w, 0, 0),
                          C = isoProj(a.w, a.d, 0),
                          D = isoProj(0, a.d, 0);
                        return (
                          <polygon
                            points={ptsToStr([A, B, C, D])}
                            fill="none"
                            stroke={SW_PAL.yellow}
                            strokeWidth={3}
                          />
                        );
                      })()}
                  </g>
                );
              })}
              {/* links overlay */}
              {showRelationships &&
                (layout.links || []).map((l) => {
                  const fe = layout.elements.find((x) => x.id === l.from);
                  const te = layout.elements.find((x) => x.id === l.to);
                  if (!fe || !te) return null;
                  const fa = ISO_FIXTURE_CATALOG.find((c) => c.id === fe.catalogId);
                  const ta = ISO_FIXTURE_CATALOG.find((c) => c.id === te.catalogId);
                  if (!fa || !ta) return null;
                  const fp = isoProj(fe.x + fa.w / 2, fe.y + fa.d / 2, fa.h + 0.2);
                  const tp = isoProj(te.x + ta.w / 2, te.y + ta.d / 2, ta.h + 0.2);
                  const color =
                    (
                      {
                        flow: SW_PAL.red,
                        operator: SW_PAL.blue,
                        conv: SW_PAL.steel,
                        buffer: SW_PAL.green,
                        power: SW_PAL.yellow,
                        comm: '#8B5CF6',
                      } as Record<IsoLinkKind, string>
                    )[l.kind] || SW_PAL.ink;
                  const dash = l.kind === 'power' ? '4 3' : l.kind === 'comm' ? '2 4' : undefined;
                  return (
                    <g key={l.id}>
                      <line
                        x1={fp.sx}
                        y1={fp.sy}
                        x2={tp.sx}
                        y2={tp.sy}
                        stroke={color}
                        strokeWidth={2.5}
                        strokeDasharray={dash}
                        strokeLinecap="round"
                        markerEnd={'url(#sw-arrow-' + l.kind + ')'}
                      />
                      {l.label && (
                        <text
                          x={(fp.sx + tp.sx) / 2}
                          y={(fp.sy + tp.sy) / 2 - 4}
                          fontFamily={SW_FONTS.mono}
                          fontSize={9}
                          fontWeight={700}
                          fill={color}
                          textAnchor="middle"
                        >
                          {l.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              {/* arrow defs */}
              <defs>
                {(['flow', 'operator', 'conv', 'buffer', 'power', 'comm'] as IsoLinkKind[]).map((k) => {
                  const color = (
                    {
                      flow: SW_PAL.red,
                      operator: SW_PAL.blue,
                      conv: SW_PAL.steel,
                      buffer: SW_PAL.green,
                      power: SW_PAL.yellow,
                      comm: '#8B5CF6',
                    } as Record<IsoLinkKind, string>
                  )[k];
                  return (
                    <marker
                      key={k}
                      id={'sw-arrow-' + k}
                      viewBox="0 0 10 10"
                      refX={8}
                      refY={5}
                      markerWidth={6}
                      markerHeight={6}
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
                    </marker>
                  );
                })}
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* right inspector */}
      <div
        style={{
          gridColumn: '3',
          gridRow: '2',
          borderLeft: `1px solid ${SW_COLORS.line}`,
          background: SW_COLORS.paper,
          overflow: 'auto',
        }}
      >
        {selected ? (
          <PropertiesPanel
            element={selected}
            updateProp={updateProp}
            onRotate={() => rotateElement(selected.id)}
            onDuplicate={() => duplicateElement(selected.id)}
            onDelete={() => deleteElement(selected.id)}
          />
        ) : (
          <EmptyInspector layout={layout} mode={mode} />
        )}
      </div>

      {/* workflow modal */}
      {showWorkflow && <WorkflowModal layout={layout} onClose={() => setShowWorkflow(false)} />}
      {/* JSON export modal */}
      {showJSON && <JsonModal layout={layout} onClose={() => setShowJSON(false)} />}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function IsoGround({ w, h }: { w: number; h: number }) {
  const cells: ReactNode[] = [];
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      const A = isoProj(x, y, 0),
        B = isoProj(x + 1, y, 0),
        C = isoProj(x + 1, y + 1, 0),
        D = isoProj(x, y + 1, 0);
      cells.push(
        <polygon
          key={x + '-' + y}
          points={ptsToStr([A, B, C, D])}
          fill="#FAF8F2"
          stroke="#E8E0CC"
          strokeWidth={0.5}
        />,
      );
    }
  return <g>{cells}</g>;
}

function IsoCellHighlight({ x, y }: { x: number; y: number }) {
  const A = isoProj(x, y, 0),
    B = isoProj(x + 1, y, 0),
    C = isoProj(x + 1, y + 1, 0),
    D = isoProj(x, y + 1, 0);
  return (
    <polygon
      points={ptsToStr([A, B, C, D])}
      fill={SW_COLORS.brand}
      fillOpacity={0.25}
      stroke={SW_COLORS.brand}
      strokeWidth={1.5}
    />
  );
}

interface PropertiesPanelProps {
  element: IsoElement;
  updateProp: (id: string, key: string, value: IsoFixturePropValue) => void;
  onRotate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function PropertiesPanel({ element, updateProp, onRotate, onDuplicate, onDelete }: PropertiesPanelProps) {
  const a = ISO_FIXTURE_CATALOG.find((c) => c.id === element.catalogId);
  const cat = ISO_CATEGORIES.find((c) => c.id === a?.cat);
  const props = element.props || {};
  const [newKey, setNewKey] = useState<string>('');
  const [newVal, setNewVal] = useState<string>('');
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div
          style={{
            fontFamily: SW_FONTS.mono,
            fontSize: 9,
            fontWeight: 700,
            color: SW_COLORS.brand,
            letterSpacing: '1.5px',
          }}
        >
          {(cat?.label || '').toUpperCase()}
        </div>
        <div style={{ fontFamily: SW_FONTS.display, fontSize: 18, fontWeight: 900, marginTop: 2 }}>
          {(props.name as string) || a?.label}
        </div>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted }}>
          {'cell (' + element.x + ', ' + element.y + ') · rot ' + element.rot + '°'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={onRotate} style={btnSec} title="Rotate (R)">
          ↻ ROTATE
        </button>
        <button onClick={onDuplicate} style={btnSec}>
          ⎘ DUPE
        </button>
        <button onClick={onDelete} style={{ ...btnSec, color: SW_COLORS.alarm }}>
          ✕ DEL
        </button>
      </div>
      <div style={{ borderTop: `1px solid ${SW_COLORS.line}`, paddingTop: 10 }}>
        {Object.entries(props).map(([k, v]) => (
          <PropRow key={k} lbl={k} val={v} onChange={(nv) => updateProp(element.id, k, nv)} />
        ))}
      </div>
      {/* add custom field */}
      <div style={{ borderTop: `1px solid ${SW_COLORS.line}`, paddingTop: 10 }}>
        <div
          style={{
            fontFamily: SW_FONTS.mono,
            fontSize: 9,
            fontWeight: 700,
            color: SW_COLORS.muted,
            letterSpacing: '1.5px',
            marginBottom: 4,
          }}
        >
          CUSTOM FIELD
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            placeholder="key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            style={{
              flex: 1,
              padding: '4px 6px',
              fontSize: 11,
              border: `1px solid ${SW_COLORS.line}`,
              borderRadius: 4,
            }}
          />
          <input
            placeholder="value"
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            style={{
              flex: 1,
              padding: '4px 6px',
              fontSize: 11,
              border: `1px solid ${SW_COLORS.line}`,
              borderRadius: 4,
            }}
          />
          <button
            onClick={() => {
              if (newKey) {
                updateProp(element.id, newKey, newVal);
                setNewKey('');
                setNewVal('');
              }
            }}
            style={btnSec}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

interface PropRowProps {
  lbl: string;
  val: IsoFixturePropValue;
  onChange: (v: IsoFixturePropValue) => void;
}

function PropRow({ lbl, val, onChange }: PropRowProps) {
  const isNum = typeof val === 'number';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 6,
        marginBottom: 6,
        alignItems: 'center',
      }}
    >
      <div
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 10,
          color: SW_COLORS.muted,
          fontWeight: 700,
        }}
      >
        {lbl}
      </div>
      <input
        value={val == null ? '' : String(val)}
        onChange={(e) => onChange(isNum ? parseFloat(e.target.value) || 0 : e.target.value)}
        style={{
          padding: '4px 6px',
          fontSize: 11,
          border: `1px solid ${SW_COLORS.line}`,
          borderRadius: 4,
          fontFamily: SW_FONTS.mono,
        }}
      />
    </div>
  );
}

function EmptyInspector({ layout, mode }: { layout: IsoLayout; mode: Mode }) {
  return (
    <div style={{ padding: 14 }}>
      <div
        style={{
          fontFamily: SW_FONTS.mono,
          fontSize: 9,
          fontWeight: 700,
          color: SW_COLORS.muted,
          letterSpacing: '1.5px',
        }}
      >
        {mode === 'dept' ? 'DEPT BUILDER' : 'FACTORY BUILDER'}
      </div>
      <div
        style={{
          fontFamily: SW_FONTS.display,
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: '-0.02em',
          marginTop: 2,
        }}
      >
        {layout.name}
      </div>
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 11, color: SW_COLORS.muted, marginTop: 4 }}>
        {layout.elements.length +
          ' elements · ' +
          (layout.links?.length || 0) +
          ' links · ' +
          layout.gridW +
          '×' +
          layout.gridH +
          ' grid'}
      </div>
      <div
        style={{
          marginTop: 14,
          padding: 10,
          background: SW_COLORS.paperDeep,
          borderRadius: 6,
          fontSize: 12,
          color: SW_COLORS.steel,
          lineHeight: 1.5,
        }}
      >
        <div
          style={{
            fontFamily: SW_FONTS.display,
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.04em',
            marginBottom: 6,
          }}
        >
          HOW TO USE
        </div>
        • Pick a category in the left rail
        <br />• Click an asset to arm it, then click the canvas to place
        <br />• Click an element to inspect/edit properties
        <br />• Drag elements to reposition · R to rotate · Del to remove
        <br />• Top toolbar: pick a link mode (FLOW/OPER/CONV/...) then click source → target
        <br />• Pan: drag empty floor · Zoom: − / + buttons
      </div>
    </div>
  );
}

interface LayoutSelectorProps {
  layouts: IsoLayoutMap;
  activeKey: string;
  onPick: (k: string) => void;
  onNew: (name: string) => void;
}

function LayoutSelector({ layouts, activeKey, onPick, onNew }: LayoutSelectorProps) {
  const [creating, setCreating] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('My Layout');
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <select
        value={activeKey}
        onChange={(e) => onPick(e.target.value)}
        style={{
          padding: '5px 8px',
          fontSize: 11,
          fontFamily: SW_FONTS.mono,
          fontWeight: 700,
          border: `1px solid ${SW_COLORS.line}`,
          borderRadius: 4,
        }}
      >
        {Object.entries(layouts).map(([k, v]) => (
          <option key={k} value={k}>
            {v.name + ' [' + k + ']'}
          </option>
        ))}
      </select>
      {creating ? (
        <div style={{ display: 'flex', gap: 3 }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{
              width: 120,
              padding: '4px 6px',
              fontSize: 11,
              border: `1px solid ${SW_COLORS.line}`,
              borderRadius: 4,
            }}
          />
          <button
            onClick={() => {
              onNew(newName);
              setCreating(false);
            }}
            style={btnSec}
          >
            ✓
          </button>
          <button onClick={() => setCreating(false)} style={btnSec}>
            ✕
          </button>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} style={btnSec}>
          + NEW
        </button>
      )}
    </div>
  );
}

function WorkflowModal({ layout, onClose }: { layout: IsoLayout; onClose: () => void }) {
  const operators = layout.elements.filter(
    (e) => ISO_FIXTURE_CATALOG.find((c) => c.id === e.catalogId)?.cat === 'op',
  );
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,20,25,0.5)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 95vw)',
          maxHeight: '85vh',
          overflow: 'auto',
          background: SW_COLORS.paper,
          border: `2px solid ${SW_COLORS.ink}`,
          borderRadius: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 18px',
            borderBottom: `1px solid ${SW_COLORS.line}`,
          }}
        >
          <div style={{ fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900 }}>Operator workflows</div>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: 18 }}>
          {operators.length === 0 ? (
            <div style={{ color: SW_COLORS.muted, fontSize: 13 }}>
              Place an operator and link them to a machine to see their workflow.
            </div>
          ) : (
            operators.map((op) => {
              const opAsset = ISO_FIXTURE_CATALOG.find((c) => c.id === op.catalogId);
              const mansLinks = (layout.links || []).filter((l) => l.from === op.id && l.kind === 'operator');
              const machines = mansLinks
                .map((l) => layout.elements.find((e) => e.id === l.to))
                .filter((m): m is IsoElement => Boolean(m));
              const inFlows = (layout.links || []).filter(
                (l) => l.kind === 'flow' && machines.find((m) => m.id === l.to),
              );
              const outFlows = (layout.links || []).filter(
                (l) => l.kind === 'flow' && machines.find((m) => m.id === l.from),
              );
              return (
                <div
                  key={op.id}
                  style={{
                    padding: 12,
                    background: SW_COLORS.paperDeep,
                    borderRadius: 8,
                    marginBottom: 10,
                    border: `1px solid ${SW_COLORS.line}`,
                  }}
                >
                  <div style={{ fontFamily: SW_FONTS.display, fontSize: 14, fontWeight: 900 }}>
                    {(op.props?.name as string) || opAsset?.label}
                  </div>
                  <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted }}>
                    {'skill ' + (op.props?.skill ?? '-') + ' · ' + (op.props?.shift ?? '')}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6 }}>
                    <strong>Mans:</strong>{' '}
                    {machines
                      .map(
                        (m) =>
                          (m.props?.name as string) ||
                          ISO_FIXTURE_CATALOG.find((c) => c.id === m.catalogId)?.label,
                      )
                      .join(', ') || '—'}
                    <br />
                    <strong>Receives from:</strong>{' '}
                    {inFlows
                      .map((l) => {
                        const e = layout.elements.find((x) => x.id === l.from);
                        return (e?.props?.name as string) || '';
                      })
                      .filter(Boolean)
                      .join(', ') || '—'}
                    <br />
                    <strong>Sends to:</strong>{' '}
                    {outFlows
                      .map((l) => {
                        const e = layout.elements.find((x) => x.id === l.to);
                        return (e?.props?.name as string) || '';
                      })
                      .filter(Boolean)
                      .join(', ') || '—'}
                    <br />
                    <strong>Cycle (avg):</strong>{' '}
                    {machines.length
                      ? Math.round(
                          machines.reduce((s, m) => s + ((m.props?.cycle_s as number) || 30), 0) / machines.length,
                        ) + 's'
                      : '—'}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function JsonModal({ layout, onClose }: { layout: IsoLayout; onClose: () => void }) {
  const json = JSON.stringify(layout, null, 2);
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,20,25,0.5)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(680px, 95vw)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: SW_COLORS.paper,
          border: `2px solid ${SW_COLORS.ink}`,
          borderRadius: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 18px',
            borderBottom: `1px solid ${SW_COLORS.line}`,
          }}
        >
          <div style={{ fontFamily: SW_FONTS.display, fontSize: 16, fontWeight: 900 }}>Layout JSON</div>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => {
              navigator.clipboard.writeText(json);
            }}
            style={btnSec}
          >
            COPY
          </button>
          <button onClick={onClose} style={{ ...btnSec, marginLeft: 4 }}>
            ✕
          </button>
        </div>
        <textarea
          readOnly
          value={json}
          style={{
            flex: 1,
            padding: 14,
            fontFamily: SW_FONTS.mono,
            fontSize: 11,
            border: 'none',
            resize: 'none',
            minHeight: 400,
            background: SW_COLORS.paperDeep,
          }}
        />
      </div>
    </div>
  );
}
