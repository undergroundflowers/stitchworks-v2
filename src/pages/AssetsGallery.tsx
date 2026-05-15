/**
 * Asset Library — every workstation, worker, and product sprite Stitchworks
 * ships with, plus user-authored customs and overrides. Tabs switch between
 * the three families.
 *
 * The library is editable: click any card to open the inspector drawer on
 * the right, tweak the parameters, and the change persists in the project
 * store. Built-ins clone into an `*Edits` map on first edit (so you can
 * always Reset them); custom assets live alongside under `customMachines /
 * customWorkers / customProducts` and can be deleted outright.
 */

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Card, SectionHeader, Tag, ToggleGroup, Button, HudSelect } from '../components';
import { SW_COLORS, SW_FONTS, SW_RADIUS, SW_SHADOWS } from '../design/tokens';
import {
  WorkstationSprite,
  WorkerSprite,
  ProductSprite,
  PRODUCT_KINDS,
  type WorkerSpriteStyle,
  type ProductKind,
} from '../assets';
import {
  useProject,
  useMachines,
  useWorkers,
  useProducts,
  type EffectiveMachine,
  type EffectiveWorker,
  type EffectiveProduct,
  type CustomMachineSpec,
  type CustomWorkerArchetype,
  type CustomProductSpec,
} from '../store';
import { MACHINE_CATALOG, type MachineCategory, type MachineCode, type MachineSpec } from '../domain/machines';
import { WORKER_ARCHETYPES, type WorkerArchetype, type WorkerRole, type SkillId } from '../domain/workers';

type Tab = 'workstations' | 'workers' | 'products';

type EditorTarget =
  | { kind: 'machine'; code: string }
  | { kind: 'worker'; role: string }
  | { kind: 'product'; key: string }
  | { kind: 'new-machine' }
  | { kind: 'new-worker' }
  | { kind: 'new-product' }
  | null;

// ── Colour swatches the editor lets the user pick from ───────────────────
const COLOR_SWATCHES = [
  SW_COLORS.brand, SW_COLORS.bobbin, SW_COLORS.fabric, SW_COLORS.thread,
  SW_COLORS.trim, SW_COLORS.press, SW_COLORS.ship, SW_COLORS.alarm,
  SW_COLORS.ok, SW_COLORS.warn, SW_COLORS.ink, SW_COLORS.steel, SW_COLORS.muted,
];

const MACHINE_CATEGORIES: MachineCategory[] = [
  'sewing', 'cutting', 'spreading', 'pressing', 'embroidery', 'fusing', 'inspection', 'manual',
];

const SKILL_OPTIONS: SkillId[] = [
  'stitching', 'overlock', 'flatlock', 'kansai', 'feed_of_arm',
  'buttonhole', 'button_sew', 'bartack', 'embroidery',
  'cutting_manual', 'cutting_cad', 'spreading', 'fusing',
  'pressing', 'inspection', 'packing', 'bundling',
  'material_handling', 'mechanical_maint', 'supervision',
];

const PRODUCT_CATEGORIES: CustomProductSpec['category'][] = [
  'raw', 'wip', 'finished', 'packed',
];

const PRODUCT_CATEGORY_LABEL: Record<CustomProductSpec['category'], string> = {
  raw: 'Raw materials',
  wip: 'Work in progress',
  finished: 'Finished garments',
  packed: 'Packed / shipped',
};

// ── Page shell ───────────────────────────────────────────────────────────
export function AssetsGalleryPage() {
  const [tab, setTab] = useState<Tab>('workstations');
  const [target, setTarget] = useState<EditorTarget>(null);

  return (
    <div style={{ height: '100%', overflow: 'hidden', background: SW_COLORS.paperDeep, position: 'relative', display: 'flex' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 28px 80px' }}>
          <SectionHeader
            kicker="Asset library"
            title="Workstations · Workers · Products"
            sub="Edit the built-in catalog or author your own. Click any card to inspect and change parameters — changes persist with the project."
            right={
              <ToggleGroup
                value={tab}
                onChange={(v) => { setTab(v as Tab); setTarget(null); }}
                options={[
                  { value: 'workstations', label: 'Workstations' },
                  { value: 'workers', label: 'Workers' },
                  { value: 'products', label: 'Products' },
                ]}
              />
            }
          />

          {tab === 'workstations' && (
            <WorkstationsTab
              onPick={(code) => setTarget({ kind: 'machine', code })}
              onNew={() => setTarget({ kind: 'new-machine' })}
            />
          )}
          {tab === 'workers' && (
            <WorkersTab
              onPick={(role) => setTarget({ kind: 'worker', role })}
              onNew={() => setTarget({ kind: 'new-worker' })}
            />
          )}
          {tab === 'products' && (
            <ProductsTab
              onPick={(key) => setTarget({ kind: 'product', key })}
              onNew={() => setTarget({ kind: 'new-product' })}
            />
          )}
        </div>
      </div>

      {target && (
        <EditorDrawer target={target} onClose={() => setTarget(null)} />
      )}
    </div>
  );
}

// ── Workstations tab ─────────────────────────────────────────────────────
function WorkstationsTab({
  onPick,
  onNew,
}: {
  onPick: (code: string) => void;
  onNew: () => void;
}) {
  const machines = useMachines();
  const groups: { label: string; cats: MachineCategory[] }[] = [
    { label: 'Sewing', cats: ['sewing'] },
    { label: 'Cutting / Spreading', cats: ['cutting', 'spreading'] },
    { label: 'Pressing / Fusing', cats: ['pressing', 'fusing'] },
    { label: 'Embroidery', cats: ['embroidery'] },
    { label: 'Inspection / Manual', cats: ['inspection', 'manual'] },
  ];

  // Bucket every machine (built-in + custom) into a group; anything whose
  // category doesn't match a known group falls into "Custom".
  const groupedByCat = useMemo(() => {
    const map = new Map<string, EffectiveMachine[]>();
    for (const m of machines.all) {
      const g = groups.find((x) => x.cats.includes(m.category)) ?? { label: 'Custom', cats: [] };
      const list = map.get(g.label) ?? [];
      list.push(m);
      map.set(g.label, list);
    }
    return map;
  }, [machines.all]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <ToolbarRow onNew={onNew} newLabel="+ New workstation" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {[...groups, { label: 'Custom', cats: [] as MachineCategory[] }]
          .filter((g) => (groupedByCat.get(g.label)?.length ?? 0) > 0)
          .map((g) => (
            <div key={g.label}>
              <GroupTitle>{g.label}</GroupTitle>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 14,
                }}
              >
                {(groupedByCat.get(g.label) ?? []).map((m) => (
                  <MachineCard
                    key={m.code}
                    spec={m}
                    isCustom={machines.isCustom(m.code)}
                    isEdited={machines.hasEdit(m.code)}
                    onClick={() => onPick(m.code)}
                  />
                ))}
              </div>
            </div>
          ))}
      </div>
    </>
  );
}

function MachineCard({
  spec,
  isCustom,
  isEdited,
  onClick,
}: {
  spec: EffectiveMachine;
  isCustom: boolean;
  isEdited: boolean;
  onClick: () => void;
}) {
  const baseSprite: MachineCode =
    'baseSprite' in spec && spec.baseSprite ? spec.baseSprite : (spec.code as MachineCode);
  const renderable = (MACHINE_CATALOG as Record<string, MachineSpec>)[baseSprite] ? baseSprite : 'SNL';

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: SW_COLORS.paper,
        border: `1px solid ${SW_COLORS.line}`,
        borderLeft: `4px solid ${spec.color}`,
        borderRadius: SW_RADIUS.md,
        padding: 14,
        textAlign: 'left',
        cursor: 'pointer',
        position: 'relative',
        boxShadow: SW_SHADOWS.card,
        transition: 'box-shadow 120ms, transform 120ms',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = SW_SHADOWS.pop; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = SW_SHADOWS.card; }}
    >
      <BadgeRow isCustom={isCustom} isEdited={isEdited} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 110, background: SW_COLORS.paperDeep, borderRadius: SW_RADIUS.sm, marginBottom: 10 }}>
        <WorkstationSprite code={renderable as MachineCode} size={88} state="running" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Tag color={spec.color}>{spec.code}</Tag>
        <div style={{ fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 700, color: SW_COLORS.ink }}>{spec.shortName}</div>
      </div>
      <div style={{ fontSize: 11, color: SW_COLORS.muted, lineHeight: 1.4, minHeight: 30 }}>{spec.label}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted, flexWrap: 'wrap' }}>
        <span>${spec.costUsd.toLocaleString()}</span>
        <span>·</span>
        <span>{spec.powerKw} kW</span>
        <span>·</span>
        <span>{spec.footprintCells.w}×{spec.footprintCells.h}</span>
      </div>
    </button>
  );
}

// ── Workers tab ──────────────────────────────────────────────────────────
function WorkersTab({
  onPick,
  onNew,
}: {
  onPick: (role: string) => void;
  onNew: () => void;
}) {
  const workers = useWorkers();
  const [style, setStyle] = useState<WorkerSpriteStyle>('chibi');
  return (
    <>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: SW_COLORS.muted, fontFamily: SW_FONTS.mono, textTransform: 'uppercase', letterSpacing: 1 }}>Style</span>
          <ToggleGroup
            value={style}
            onChange={(v) => setStyle(v as WorkerSpriteStyle)}
            options={[
              { value: 'chibi', label: 'Chibi' },
              { value: 'silhouette', label: 'Silhouette' },
              { value: 'dots', label: 'Dots' },
            ]}
          />
        </div>
        <Button variant="primary" size="sm" onClick={onNew}>+ New worker role</Button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 14,
        }}
      >
        {workers.all.map((a) => (
          <WorkerCard
            key={a.role}
            spec={a}
            spriteStyle={style}
            isCustom={workers.isCustom(a.role)}
            isEdited={workers.hasEdit(a.role)}
            onClick={() => onPick(a.role)}
          />
        ))}
      </div>
    </>
  );
}

function WorkerCard({
  spec,
  spriteStyle,
  isCustom,
  isEdited,
  onClick,
}: {
  spec: EffectiveWorker;
  spriteStyle: WorkerSpriteStyle;
  isCustom: boolean;
  isEdited: boolean;
  onClick: () => void;
}) {
  const baseSprite: WorkerRole =
    'baseSprite' in spec && spec.baseSprite ? spec.baseSprite : (spec.role as WorkerRole);
  const renderable = (WORKER_ARCHETYPES as Record<string, WorkerArchetype>)[baseSprite]
    ? baseSprite
    : 'helper';

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: SW_COLORS.paper,
        border: `1px solid ${SW_COLORS.line}`,
        borderLeft: `4px solid ${spec.color}`,
        borderRadius: SW_RADIUS.md,
        padding: 14,
        textAlign: 'left',
        cursor: 'pointer',
        position: 'relative',
        boxShadow: SW_SHADOWS.card,
        transition: 'box-shadow 120ms',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = SW_SHADOWS.pop; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = SW_SHADOWS.card; }}
    >
      <BadgeRow isCustom={isCustom} isEdited={isEdited} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 130, background: SW_COLORS.paperDeep, borderRadius: SW_RADIUS.sm, marginBottom: 10 }}>
        <WorkerSprite role={renderable as WorkerRole} size={110} style={spriteStyle} state="busy" />
      </div>
      <div style={{ fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 700, color: SW_COLORS.ink, marginBottom: 4 }}>{spec.label}</div>
      <div style={{ fontSize: 11, color: SW_COLORS.muted, lineHeight: 1.4, minHeight: 30 }}>{spec.description}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
        {spec.primarySkills.map((s) => (
          <span key={s} style={{ fontFamily: SW_FONTS.mono, fontSize: 9, padding: '2px 5px', borderRadius: 3, background: spec.color, color: SW_COLORS.paper, fontWeight: 700 }}>{s}</span>
        ))}
      </div>
      <div style={{ marginTop: 8, fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted }}>
        ${spec.baseCostHr}/hr · {Math.round(spec.baseEfficiency * 100)}% eff
      </div>
    </button>
  );
}

// ── Products tab ─────────────────────────────────────────────────────────
function ProductsTab({
  onPick,
  onNew,
}: {
  onPick: (key: string) => void;
  onNew: () => void;
}) {
  const products = useProducts();
  const groups = useMemo(() => {
    const builtInGroups = [
      { label: 'Raw materials', kinds: ['fabric_roll', 'thread_cone', 'trim_card', 'button_card', 'zipper'] },
      { label: 'Work in progress', kinds: ['bundle', 'cut_piece', 'wip_garment', 'hanger'] },
      { label: 'Garments', kinds: ['tshirt', 'polo', 'shirt', 'trouser', 'sweatshirt'] },
      { label: 'Packed', kinds: ['polybag', 'carton'] },
    ];
    const out: { label: string; items: EffectiveProduct[] }[] = builtInGroups.map((g) => ({
      label: g.label,
      items: g.kinds.map((k) => products.byKind[k]).filter(Boolean),
    }));
    const customs = products.all.filter((p) => p.isCustom);
    if (customs.length) out.push({ label: 'Custom', items: customs });
    return out;
  }, [products]);

  return (
    <>
      <ToolbarRow onNew={onNew} newLabel="+ New product" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {groups.map((g) => (
          <div key={g.label}>
            <GroupTitle>{g.label}</GroupTitle>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 14,
              }}
            >
              {g.items.map((p) => (
                <ProductCard
                  key={p.kind}
                  spec={p}
                  onClick={() => onPick(p.kind)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ProductCard({ spec, onClick }: { spec: EffectiveProduct; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: SW_COLORS.paper,
        border: `1px solid ${SW_COLORS.line}`,
        borderRadius: SW_RADIUS.md,
        padding: 14,
        textAlign: 'left',
        cursor: 'pointer',
        position: 'relative',
        boxShadow: SW_SHADOWS.card,
        transition: 'box-shadow 120ms',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = SW_SHADOWS.pop; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = SW_SHADOWS.card; }}
    >
      <BadgeRow isCustom={spec.isCustom} isEdited={false} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, background: SW_COLORS.paperDeep, borderRadius: SW_RADIUS.sm, marginBottom: 10 }}>
        <ProductSprite
          kind={spec.baseSprite}
          size={92}
          color={spec.color}
          count={spec.baseSprite === 'bundle' ? 30 : spec.baseSprite === 'carton' ? 24 : undefined}
        />
      </div>
      <div style={{ fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 700, color: SW_COLORS.ink }}>{spec.label}</div>
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted, marginTop: 4 }}>{spec.kind}</div>
    </button>
  );
}

// ── Drawer ───────────────────────────────────────────────────────────────
function EditorDrawer({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(15,20,25,0.18)',
          zIndex: 10,
        }}
      />
      <aside
        style={{
          position: 'absolute', top: 0, right: 0, height: '100%',
          width: 440,
          maxWidth: '100%',
          background: SW_COLORS.paper,
          borderLeft: `1px solid ${SW_COLORS.line}`,
          boxShadow: SW_SHADOWS.hi,
          zIndex: 11,
          display: 'flex', flexDirection: 'column',
        }}
      >
        <DrawerBody target={target} onClose={onClose} />
      </aside>
    </>
  );
}

function DrawerBody({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  if (!target) return null;
  if (target.kind === 'machine') return <MachineEditor code={target.code} onClose={onClose} />;
  if (target.kind === 'worker') return <WorkerEditor role={target.role} onClose={onClose} />;
  if (target.kind === 'product') return <ProductEditor productKey={target.key} onClose={onClose} />;
  if (target.kind === 'new-machine') return <NewMachineEditor onClose={onClose} />;
  if (target.kind === 'new-worker') return <NewWorkerEditor onClose={onClose} />;
  if (target.kind === 'new-product') return <NewProductEditor onClose={onClose} />;
  return null;
}

// ── Machine editor ───────────────────────────────────────────────────────
function MachineEditor({ code, onClose }: { code: string; onClose: () => void }) {
  const machines = useMachines();
  const spec = machines.byCode[code];
  const isCustom = machines.isCustom(code);
  const isEdited = machines.hasEdit(code);
  const builtIn = (MACHINE_CATALOG as Record<string, MachineSpec>)[code];

  const patchMachine = useProject((s) => s.patchMachine);
  const resetMachine = useProject((s) => s.resetMachine);
  const patchCustomMachine = useProject((s) => s.patchCustomMachine);
  const removeCustomMachine = useProject((s) => s.removeCustomMachine);

  if (!spec) return <DrawerHeader title="Workstation" subtitle="Not found" onClose={onClose} />;

  const apply = (patch: Partial<EffectiveMachine>) => {
    if (isCustom) patchCustomMachine(code, patch as Partial<CustomMachineSpec>);
    else patchMachine(code, builtIn, patch as Partial<MachineSpec>);
  };

  return (
    <>
      <DrawerHeader
        title={spec.shortName}
        subtitle={isCustom ? 'Custom workstation' : isEdited ? 'Built-in · edited' : 'Built-in workstation'}
        onClose={onClose}
        right={
          isCustom ? (
            <Button variant="danger" size="sm" onClick={() => { removeCustomMachine(code); onClose(); }}>Delete</Button>
          ) : isEdited ? (
            <Button variant="ghost" size="sm" onClick={() => resetMachine(code)}>Reset</Button>
          ) : null
        }
      />
      <DrawerScroll>
        <Section label="Identity">
          <Field label="Code">
            <TextInput value={spec.code} disabled />
          </Field>
          <Field label="Short name">
            <TextInput value={spec.shortName} onChange={(v) => apply({ shortName: v })} />
          </Field>
          <Field label="Full label">
            <TextInput value={spec.label} onChange={(v) => apply({ label: v })} />
          </Field>
          <Field label="Description">
            <TextArea value={spec.description} onChange={(v) => apply({ description: v })} />
          </Field>
        </Section>

        <Section label="Classification">
          <Field label="Category">
            <Select
              value={spec.category}
              onChange={(v) => apply({ category: v as MachineCategory })}
              options={MACHINE_CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
          </Field>
          <Field label="Speed class">
            <Select
              value={spec.speedClass ?? ''}
              onChange={(v) => apply({ speedClass: (v || undefined) as MachineSpec['speedClass'] })}
              options={[
                { value: '', label: '—' },
                { value: 'low', label: 'Low' },
                { value: 'mid', label: 'Mid' },
                { value: 'high', label: 'High' },
              ]}
            />
          </Field>
          <Field label="Accent colour">
            <ColorPicker value={spec.color} onChange={(c) => apply({ color: c })} />
          </Field>
        </Section>

        <Section label="Procurement & footprint">
          <NumPair>
            <Field label="Cost (USD)">
              <NumberInput value={spec.costUsd} step={50} min={0} onChange={(n) => apply({ costUsd: n })} />
            </Field>
            <Field label="Power (kW)">
              <NumberInput value={spec.powerKw} step={0.1} min={0} onChange={(n) => apply({ powerKw: n })} />
            </Field>
          </NumPair>
          <NumPair>
            <Field label="Footprint W (cells)">
              <NumberInput value={spec.footprintCells.w} step={1} min={1} onChange={(w) => apply({ footprintCells: { ...spec.footprintCells, w } })} />
            </Field>
            <Field label="Footprint H (cells)">
              <NumberInput value={spec.footprintCells.h} step={1} min={1} onChange={(h) => apply({ footprintCells: { ...spec.footprintCells, h } })} />
            </Field>
          </NumPair>
          <Field label="Brands (comma-separated)">
            <TextInput
              value={(spec.brands ?? []).join(', ')}
              onChange={(v) => apply({ brands: v.split(',').map((x) => x.trim()).filter(Boolean) })}
            />
          </Field>
          <Field label="Manual (person-only)">
            <Toggle
              value={!!spec.isManual}
              onChange={(b) => apply({ isManual: b })}
            />
          </Field>
        </Section>
      </DrawerScroll>
    </>
  );
}

// ── Worker editor ────────────────────────────────────────────────────────
function WorkerEditor({ role, onClose }: { role: string; onClose: () => void }) {
  const workers = useWorkers();
  const spec = workers.byRole[role];
  const isCustom = workers.isCustom(role);
  const isEdited = workers.hasEdit(role);
  const builtIn = (WORKER_ARCHETYPES as Record<string, WorkerArchetype>)[role];

  const patchWorker = useProject((s) => s.patchWorker);
  const resetWorker = useProject((s) => s.resetWorker);
  const patchCustomWorker = useProject((s) => s.patchCustomWorker);
  const removeCustomWorker = useProject((s) => s.removeCustomWorker);

  if (!spec) return <DrawerHeader title="Worker" subtitle="Not found" onClose={onClose} />;

  const apply = (patch: Partial<EffectiveWorker>) => {
    if (isCustom) patchCustomWorker(role, patch as Partial<CustomWorkerArchetype>);
    else patchWorker(role, builtIn, patch as Partial<WorkerArchetype>);
  };

  const toggleSkill = (s: SkillId, pool: 'primarySkills' | 'secondarySkills') => {
    const cur = (spec[pool] ?? []) as SkillId[];
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    apply({ [pool]: next } as Partial<EffectiveWorker>);
  };

  return (
    <>
      <DrawerHeader
        title={spec.label}
        subtitle={isCustom ? 'Custom worker role' : isEdited ? 'Built-in · edited' : 'Built-in worker role'}
        onClose={onClose}
        right={
          isCustom ? (
            <Button variant="danger" size="sm" onClick={() => { removeCustomWorker(role); onClose(); }}>Delete</Button>
          ) : isEdited ? (
            <Button variant="ghost" size="sm" onClick={() => resetWorker(role)}>Reset</Button>
          ) : null
        }
      />
      <DrawerScroll>
        <Section label="Identity">
          <Field label="Role id">
            <TextInput value={spec.role} disabled />
          </Field>
          <Field label="Label">
            <TextInput value={spec.label} onChange={(v) => apply({ label: v })} />
          </Field>
          <Field label="Description">
            <TextArea value={spec.description} onChange={(v) => apply({ description: v })} />
          </Field>
          <Field label="Accent colour">
            <ColorPicker value={spec.color} onChange={(c) => apply({ color: c })} />
          </Field>
        </Section>

        <Section label="Performance">
          <NumPair>
            <Field label="Cost ($ / hr)">
              <NumberInput value={spec.baseCostHr} step={1} min={0} onChange={(n) => apply({ baseCostHr: n })} />
            </Field>
            <Field label="Base efficiency">
              <NumberInput value={spec.baseEfficiency} step={0.05} min={0} max={1.5} onChange={(n) => apply({ baseEfficiency: n })} />
            </Field>
          </NumPair>
          <NumPair>
            <Field label="Walk speed (m/s)">
              <NumberInput value={spec.walkSpeedMps} step={0.1} min={0} onChange={(n) => apply({ walkSpeedMps: n })} />
            </Field>
            <Field label="Owns a station">
              <Toggle value={spec.ownsStation} onChange={(b) => apply({ ownsStation: b })} />
            </Field>
          </NumPair>
        </Section>

        <Section label="Primary skills">
          <SkillGrid
            selected={(spec.primarySkills ?? []) as SkillId[]}
            onToggle={(s) => toggleSkill(s, 'primarySkills')}
          />
        </Section>

        <Section label="Secondary skills">
          <SkillGrid
            selected={(spec.secondarySkills ?? []) as SkillId[]}
            onToggle={(s) => toggleSkill(s, 'secondarySkills')}
          />
        </Section>
      </DrawerScroll>
    </>
  );
}

// ── Product editor ───────────────────────────────────────────────────────
function ProductEditor({ productKey, onClose }: { productKey: string; onClose: () => void }) {
  const products = useProducts();
  const spec = products.byKind[productKey];
  const isCustom = products.isCustom(productKey);

  const patchCustomProduct = useProject((s) => s.patchCustomProduct);
  const removeCustomProduct = useProject((s) => s.removeCustomProduct);

  if (!spec) return <DrawerHeader title="Product" subtitle="Not found" onClose={onClose} />;

  return (
    <>
      <DrawerHeader
        title={spec.label}
        subtitle={isCustom ? 'Custom product' : 'Built-in product · read-only'}
        onClose={onClose}
        right={
          isCustom ? (
            <Button variant="danger" size="sm" onClick={() => { removeCustomProduct(productKey); onClose(); }}>Delete</Button>
          ) : null
        }
      />
      <DrawerScroll>
        <Section label="Identity">
          <Field label="Kind id">
            <TextInput value={spec.kind} disabled />
          </Field>
          <Field label="Label">
            <TextInput
              value={spec.label}
              onChange={(v) => isCustom && patchCustomProduct(productKey, { label: v })}
              disabled={!isCustom}
            />
          </Field>
          {isCustom && (
            <Field label="Description">
              <TextArea
                value={spec.description ?? ''}
                onChange={(v) => patchCustomProduct(productKey, { description: v })}
              />
            </Field>
          )}
        </Section>
        <Section label="Appearance">
          <Field label="Base sprite">
            <Select
              value={spec.baseSprite}
              onChange={(v) => isCustom && patchCustomProduct(productKey, { baseSprite: v as ProductKind })}
              disabled={!isCustom}
              options={PRODUCT_KINDS.map((k) => ({ value: k, label: k }))}
            />
          </Field>
          <Field label="Accent colour (custom only)">
            <ColorPicker
              value={spec.color ?? '#999999'}
              onChange={(c) => isCustom && patchCustomProduct(productKey, { color: c })}
            />
          </Field>
        </Section>
        {!isCustom && (
          <div style={{ padding: '0 18px 18px', fontSize: 12, color: SW_COLORS.muted, lineHeight: 1.5 }}>
            Built-in products are hand-drawn SVG sprites and aren't tunable from the library. Create a custom product to remix the sprite with your own label and colour.
          </div>
        )}
      </DrawerScroll>
    </>
  );
}

// ── New-asset editors ────────────────────────────────────────────────────
function NewMachineEditor({ onClose }: { onClose: () => void }) {
  const addCustomMachine = useProject((s) => s.addCustomMachine);
  const machines = useMachines();
  const [draft, setDraft] = useState<CustomMachineSpec>(() => ({
    code: '',
    isCustom: true,
    baseSprite: 'SNL',
    category: 'sewing',
    label: '',
    shortName: '',
    description: '',
    icon: '⌃',
    color: SW_COLORS.brand,
    costUsd: 1000,
    powerKw: 0.5,
    footprintCells: { w: 1, h: 1 },
    speedClass: 'mid',
    brands: [],
  }));
  const [err, setErr] = useState<string | null>(null);

  const update = <K extends keyof CustomMachineSpec>(k: K, v: CustomMachineSpec[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const submit = () => {
    const code = draft.code.trim().toUpperCase();
    if (!code) return setErr('Code is required');
    if (machines.byCode[code]) return setErr(`Code "${code}" already exists`);
    if (!draft.shortName.trim()) return setErr('Short name is required');
    addCustomMachine({ ...draft, code });
    onClose();
  };

  return (
    <>
      <DrawerHeader title="New workstation" subtitle="Define a custom machine" onClose={onClose} />
      <DrawerScroll>
        <Section label="Identity">
          <Field label="Code (e.g. MY-SNL)">
            <TextInput value={draft.code} onChange={(v) => update('code', v.toUpperCase())} />
          </Field>
          <Field label="Short name">
            <TextInput value={draft.shortName} onChange={(v) => update('shortName', v)} />
          </Field>
          <Field label="Full label">
            <TextInput value={draft.label} onChange={(v) => update('label', v)} />
          </Field>
          <Field label="Description">
            <TextArea value={draft.description} onChange={(v) => update('description', v)} />
          </Field>
        </Section>

        <Section label="Classification">
          <Field label="Category">
            <Select
              value={draft.category}
              onChange={(v) => update('category', v as MachineCategory)}
              options={MACHINE_CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
          </Field>
          <Field label="Base sprite">
            <Select
              value={draft.baseSprite}
              onChange={(v) => update('baseSprite', v as MachineCode)}
              options={Object.keys(MACHINE_CATALOG).map((c) => ({ value: c, label: c }))}
            />
          </Field>
          <Field label="Accent colour">
            <ColorPicker value={draft.color} onChange={(c) => update('color', c)} />
          </Field>
        </Section>

        <Section label="Procurement & footprint">
          <NumPair>
            <Field label="Cost (USD)">
              <NumberInput value={draft.costUsd} step={50} min={0} onChange={(n) => update('costUsd', n)} />
            </Field>
            <Field label="Power (kW)">
              <NumberInput value={draft.powerKw} step={0.1} min={0} onChange={(n) => update('powerKw', n)} />
            </Field>
          </NumPair>
          <NumPair>
            <Field label="Footprint W">
              <NumberInput value={draft.footprintCells.w} step={1} min={1} onChange={(w) => update('footprintCells', { ...draft.footprintCells, w })} />
            </Field>
            <Field label="Footprint H">
              <NumberInput value={draft.footprintCells.h} step={1} min={1} onChange={(h) => update('footprintCells', { ...draft.footprintCells, h })} />
            </Field>
          </NumPair>
        </Section>

        {err && <div style={{ padding: '0 18px', color: SW_COLORS.alarm, fontSize: 12 }}>{err}</div>}

        <DrawerFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>Create</Button>
        </DrawerFooter>
      </DrawerScroll>
    </>
  );
}

function NewWorkerEditor({ onClose }: { onClose: () => void }) {
  const addCustomWorker = useProject((s) => s.addCustomWorker);
  const workers = useWorkers();
  const [draft, setDraft] = useState<CustomWorkerArchetype>(() => ({
    role: '',
    isCustom: true,
    baseSprite: 'helper',
    label: '',
    description: '',
    icon: '✋',
    color: SW_COLORS.brand,
    primarySkills: [],
    secondarySkills: [],
    baseEfficiency: 0.85,
    baseCostHr: 7,
    walkSpeedMps: 1.0,
    ownsStation: false,
  }));
  const [err, setErr] = useState<string | null>(null);

  const update = <K extends keyof CustomWorkerArchetype>(k: K, v: CustomWorkerArchetype[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const toggleSkill = (s: SkillId, pool: 'primarySkills' | 'secondarySkills') => {
    const cur = (draft[pool] ?? []) as SkillId[];
    update(pool, (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]) as CustomWorkerArchetype[typeof pool]);
  };

  const submit = () => {
    const role = draft.role.trim().toLowerCase().replace(/\s+/g, '_');
    if (!role) return setErr('Role id is required');
    if (workers.byRole[role]) return setErr(`Role "${role}" already exists`);
    if (!draft.label.trim()) return setErr('Label is required');
    addCustomWorker({ ...draft, role });
    onClose();
  };

  return (
    <>
      <DrawerHeader title="New worker role" subtitle="Define a custom archetype" onClose={onClose} />
      <DrawerScroll>
        <Section label="Identity">
          <Field label="Role id (e.g. line_lead)">
            <TextInput value={draft.role} onChange={(v) => update('role', v)} />
          </Field>
          <Field label="Label">
            <TextInput value={draft.label} onChange={(v) => update('label', v)} />
          </Field>
          <Field label="Description">
            <TextArea value={draft.description} onChange={(v) => update('description', v)} />
          </Field>
          <Field label="Base sprite">
            <Select
              value={draft.baseSprite}
              onChange={(v) => update('baseSprite', v as WorkerRole)}
              options={Object.keys(WORKER_ARCHETYPES).map((r) => ({ value: r, label: r }))}
            />
          </Field>
          <Field label="Accent colour">
            <ColorPicker value={draft.color} onChange={(c) => update('color', c)} />
          </Field>
        </Section>

        <Section label="Performance">
          <NumPair>
            <Field label="Cost ($ / hr)">
              <NumberInput value={draft.baseCostHr} step={1} min={0} onChange={(n) => update('baseCostHr', n)} />
            </Field>
            <Field label="Base efficiency">
              <NumberInput value={draft.baseEfficiency} step={0.05} min={0} max={1.5} onChange={(n) => update('baseEfficiency', n)} />
            </Field>
          </NumPair>
          <NumPair>
            <Field label="Walk speed (m/s)">
              <NumberInput value={draft.walkSpeedMps} step={0.1} min={0} onChange={(n) => update('walkSpeedMps', n)} />
            </Field>
            <Field label="Owns a station">
              <Toggle value={draft.ownsStation} onChange={(b) => update('ownsStation', b)} />
            </Field>
          </NumPair>
        </Section>

        <Section label="Primary skills">
          <SkillGrid
            selected={(draft.primarySkills ?? []) as SkillId[]}
            onToggle={(s) => toggleSkill(s, 'primarySkills')}
          />
        </Section>

        <Section label="Secondary skills">
          <SkillGrid
            selected={(draft.secondarySkills ?? []) as SkillId[]}
            onToggle={(s) => toggleSkill(s, 'secondarySkills')}
          />
        </Section>

        {err && <div style={{ padding: '0 18px', color: SW_COLORS.alarm, fontSize: 12 }}>{err}</div>}

        <DrawerFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>Create</Button>
        </DrawerFooter>
      </DrawerScroll>
    </>
  );
}

function NewProductEditor({ onClose }: { onClose: () => void }) {
  const addCustomProduct = useProject((s) => s.addCustomProduct);
  const products = useProducts();
  const [draft, setDraft] = useState<CustomProductSpec>(() => ({
    kind: '',
    isCustom: true,
    baseSprite: 'tshirt',
    label: '',
    category: 'finished',
    color: SW_COLORS.brand,
    description: '',
  }));
  const [err, setErr] = useState<string | null>(null);

  const update = <K extends keyof CustomProductSpec>(k: K, v: CustomProductSpec[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const submit = () => {
    const kind = draft.kind.trim().toLowerCase().replace(/\s+/g, '_');
    if (!kind) return setErr('Kind id is required');
    if (products.byKind[kind]) return setErr(`Kind "${kind}" already exists`);
    if (!draft.label.trim()) return setErr('Label is required');
    addCustomProduct({ ...draft, kind });
    onClose();
  };

  return (
    <>
      <DrawerHeader title="New product" subtitle="Add a custom SKU or material" onClose={onClose} />
      <DrawerScroll>
        <Section label="Identity">
          <Field label="Kind id (e.g. denim_pant)">
            <TextInput value={draft.kind} onChange={(v) => update('kind', v)} />
          </Field>
          <Field label="Label">
            <TextInput value={draft.label} onChange={(v) => update('label', v)} />
          </Field>
          <Field label="Description">
            <TextArea value={draft.description ?? ''} onChange={(v) => update('description', v)} />
          </Field>
          <Field label="Category">
            <Select
              value={draft.category}
              onChange={(v) => update('category', v as CustomProductSpec['category'])}
              options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: PRODUCT_CATEGORY_LABEL[c] }))}
            />
          </Field>
        </Section>

        <Section label="Appearance">
          <Field label="Base sprite">
            <Select
              value={draft.baseSprite}
              onChange={(v) => update('baseSprite', v as ProductKind)}
              options={PRODUCT_KINDS.map((k) => ({ value: k, label: k }))}
            />
          </Field>
          <Field label="Accent colour">
            <ColorPicker value={draft.color ?? SW_COLORS.brand} onChange={(c) => update('color', c)} />
          </Field>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <ProductSprite kind={draft.baseSprite} size={120} color={draft.color} />
          </div>
        </Section>

        {err && <div style={{ padding: '0 18px', color: SW_COLORS.alarm, fontSize: 12 }}>{err}</div>}

        <DrawerFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>Create</Button>
        </DrawerFooter>
      </DrawerScroll>
    </>
  );
}

// ── Drawer chrome + form atoms ───────────────────────────────────────────
function DrawerHeader({
  title,
  subtitle,
  onClose,
  right,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  right?: ReactNode;
}) {
  return (
    <div style={{ padding: '16px 18px', borderBottom: `1px solid ${SW_COLORS.line}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: SW_COLORS.muted }}>{subtitle}</div>
        <div style={{ fontFamily: SW_FONTS.display, fontSize: 20, fontWeight: 800, color: SW_COLORS.ink, marginTop: 2 }}>{title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {right}
        <button
          type="button"
          onClick={onClose}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 18, color: SW_COLORS.muted, padding: 4,
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function DrawerScroll({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  );
}

function DrawerFooter({ children }: { children: ReactNode }) {
  return (
    <div style={{ marginTop: 'auto', padding: 18, borderTop: `1px solid ${SW_COLORS.line}`, display: 'flex', gap: 8, justifyContent: 'flex-end', background: SW_COLORS.paperDeep }}>
      {children}
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ padding: '14px 18px', borderBottom: `1px solid ${SW_COLORS.line}` }}>
      <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: SW_COLORS.muted, marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: SW_COLORS.muted, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function NumPair({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>;
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  fontSize: 13,
  fontFamily: SW_FONTS.body,
  border: `1px solid ${SW_COLORS.line}`,
  borderRadius: SW_RADIUS.sm,
  background: SW_COLORS.paper,
  color: SW_COLORS.ink,
  outline: 'none',
};

function TextInput({ value, onChange, disabled }: { value: string; onChange?: (v: string) => void; disabled?: boolean }) {
  return (
    <input
      type="text"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      style={{ ...inputStyle, opacity: disabled ? 0.6 : 1 }}
    />
  );
}

function TextArea({ value, onChange, disabled }: { value: string; onChange?: (v: string) => void; disabled?: boolean }) {
  return (
    <textarea
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      rows={2}
      style={{ ...inputStyle, fontFamily: SW_FONTS.body, resize: 'vertical', opacity: disabled ? 0.6 : 1 }}
    />
  );
}

function NumberInput({ value, onChange, step, min, max }: { value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      step={step ?? 1}
      min={min}
      max={max}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
      style={{ ...inputStyle, fontFamily: SW_FONTS.mono }}
    />
  );
}

function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange?: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <HudSelect
      value={value}
      onChange={(v) => onChange?.(v)}
      variant="light"
      width="100%"
      disabled={disabled}
      options={options}
    />
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (b: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12, padding: 2,
        border: `1px solid ${SW_COLORS.line}`,
        background: value ? SW_COLORS.brand : SW_COLORS.paperDeep,
        cursor: 'pointer',
        position: 'relative',
      }}
      aria-pressed={value}
    >
      <span
        style={{
          display: 'block',
          width: 18, height: 18,
          background: SW_COLORS.paper,
          borderRadius: '50%',
          boxShadow: SW_SHADOWS.card,
          transform: `translateX(${value ? 20 : 0}px)`,
          transition: 'transform 120ms',
        }}
      />
    </button>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          style={{
            width: 22, height: 22, borderRadius: '50%',
            background: c,
            border: `2px solid ${value === c ? SW_COLORS.ink : 'transparent'}`,
            cursor: 'pointer',
            padding: 0,
          }}
          aria-label={`Pick ${c}`}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
        aria-label="Custom colour"
      />
    </div>
  );
}

function SkillGrid({ selected, onToggle }: { selected: SkillId[]; onToggle: (s: SkillId) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {SKILL_OPTIONS.map((s) => {
        const on = selected.includes(s);
        return (
          <button
            key={s}
            type="button"
            onClick={() => onToggle(s)}
            style={{
              fontFamily: SW_FONTS.mono,
              fontSize: 10,
              fontWeight: 700,
              padding: '4px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              border: `1px solid ${on ? SW_COLORS.brand : SW_COLORS.line}`,
              background: on ? SW_COLORS.brand : SW_COLORS.paper,
              color: on ? SW_COLORS.paper : SW_COLORS.ink,
            }}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

// ── Bits & pieces ────────────────────────────────────────────────────────
function ToolbarRow({ onNew, newLabel }: { onNew: () => void; newLabel: string }) {
  return (
    <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'flex-end' }}>
      <Button variant="primary" size="sm" onClick={onNew}>{newLabel}</Button>
    </div>
  );
}

function BadgeRow({ isCustom, isEdited }: { isCustom: boolean; isEdited: boolean }) {
  if (!isCustom && !isEdited) return null;
  return (
    <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 1 }}>
      {isCustom && (
        <span style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 3, background: SW_COLORS.brand, color: SW_COLORS.paper, letterSpacing: 0.5, textTransform: 'uppercase' }}>Custom</span>
      )}
      {!isCustom && isEdited && (
        <span style={{ fontFamily: SW_FONTS.mono, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 3, background: SW_COLORS.thread, color: SW_COLORS.ink, letterSpacing: 0.5, textTransform: 'uppercase' }}>Edited</span>
      )}
    </div>
  );
}

function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: SW_FONTS.mono,
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        color: SW_COLORS.muted,
        marginBottom: 10,
        paddingBottom: 6,
        borderBottom: `1px solid ${SW_COLORS.line}`,
      }}
    >
      {children}
    </div>
  );
}
