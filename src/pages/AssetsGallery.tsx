/**
 * Assets gallery — every workstation, worker, and product sprite Stitchworks
 * ships with, in one scrollable page. Tabs switch between the three families;
 * each card shows the sprite, its label, and a code/spec strip so the user
 * can confirm what each sprite is meant to represent before dropping it
 * onto a layout.
 */

import { useState } from 'react';
import { Card, SectionHeader, Tag, ToggleGroup } from '../components';
import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import {
  WorkstationSprite,
  WorkerSprite,
  ProductSprite,
  PRODUCT_GROUPS,
  PRODUCT_LABELS,
  type WorkerSpriteStyle,
} from '../assets';
import { ALL_MACHINES } from '../domain/machines';
import { ALL_WORKER_ARCHETYPES } from '../domain/workers';

type Tab = 'workstations' | 'workers' | 'products';

export function AssetsGalleryPage() {
  const [tab, setTab] = useState<Tab>('workstations');
  return (
    <div style={{ height: '100%', overflow: 'auto', background: SW_COLORS.paperDeep }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 28px 80px' }}>
        <SectionHeader
          kicker="Asset library"
          title="Workstations · Workers · Products"
          sub="Every sprite Stitchworks ships with — drop them on a layout, an order, or a roster. Pure SVG, scales without aliasing, retints with the active vibe."
          right={
            <ToggleGroup
              value={tab}
              onChange={(v) => setTab(v as Tab)}
              options={[
                { value: 'workstations', label: 'Workstations' },
                { value: 'workers', label: 'Workers' },
                { value: 'products', label: 'Products' },
              ]}
            />
          }
        />

        {tab === 'workstations' && <WorkstationsTab />}
        {tab === 'workers' && <WorkersTab />}
        {tab === 'products' && <ProductsTab />}
      </div>
    </div>
  );
}

// ── Workstations tab ────────────────────────────────────────────────────
function WorkstationsTab() {
  const groups: { label: string; codes: typeof ALL_MACHINES }[] = [
    { label: 'Sewing', codes: ALL_MACHINES.filter((m) => m.category === 'sewing') },
    { label: 'Cutting / Spreading', codes: ALL_MACHINES.filter((m) => m.category === 'cutting' || m.category === 'spreading') },
    { label: 'Pressing / Fusing', codes: ALL_MACHINES.filter((m) => m.category === 'pressing' || m.category === 'fusing') },
    { label: 'Embroidery', codes: ALL_MACHINES.filter((m) => m.category === 'embroidery') },
    { label: 'Inspection / Manual', codes: ALL_MACHINES.filter((m) => m.category === 'inspection' || m.category === 'manual') },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {groups.map((g) => (
        <div key={g.label}>
          <GroupTitle>{g.label}</GroupTitle>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 14,
            }}
          >
            {g.codes.map((m) => (
              <Card key={m.code} accent={m.color} padding={14}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 110, background: SW_COLORS.paperDeep, borderRadius: SW_RADIUS.sm, marginBottom: 10 }}>
                  <WorkstationSprite code={m.code} size={88} state="running" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Tag color={m.color}>{m.code}</Tag>
                  <div style={{ fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 700, color: SW_COLORS.ink }}>{m.shortName}</div>
                </div>
                <div style={{ fontSize: 11, color: SW_COLORS.muted, lineHeight: 1.4, minHeight: 30 }}>{m.label}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted }}>
                  <span>${m.costUsd.toLocaleString()}</span>
                  <span>·</span>
                  <span>{m.powerKw} kW</span>
                  <span>·</span>
                  <span>{m.footprintCells.w}×{m.footprintCells.h}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Workers tab ─────────────────────────────────────────────────────────
function WorkersTab() {
  const [style, setStyle] = useState<WorkerSpriteStyle>('chibi');
  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
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
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 14,
        }}
      >
        {ALL_WORKER_ARCHETYPES.map((a) => (
          <Card key={a.role} accent={a.color} padding={14}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 130, background: SW_COLORS.paperDeep, borderRadius: SW_RADIUS.sm, marginBottom: 10 }}>
              <WorkerSprite role={a.role} size={110} style={style} state="busy" />
            </div>
            <div style={{ fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 700, color: SW_COLORS.ink, marginBottom: 4 }}>{a.label}</div>
            <div style={{ fontSize: 11, color: SW_COLORS.muted, lineHeight: 1.4, minHeight: 30 }}>{a.description}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {a.primarySkills.map((s) => (
                <span key={s} style={{ fontFamily: SW_FONTS.mono, fontSize: 9, padding: '2px 5px', borderRadius: 3, background: a.color, color: SW_COLORS.paper, fontWeight: 700 }}>{s}</span>
              ))}
            </div>
            <div style={{ marginTop: 8, fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted }}>
              ${a.baseCostHr}/hr · {Math.round(a.baseEfficiency * 100)}% eff
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

// ── Products tab ────────────────────────────────────────────────────────
function ProductsTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {PRODUCT_GROUPS.map((g) => (
        <div key={g.label}>
          <GroupTitle>{g.label}</GroupTitle>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 14,
            }}
          >
            {g.kinds.map((k) => (
              <Card key={k} padding={14}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, background: SW_COLORS.paperDeep, borderRadius: SW_RADIUS.sm, marginBottom: 10 }}>
                  <ProductSprite kind={k} size={92} count={k === 'bundle' ? 30 : k === 'carton' ? 24 : undefined} />
                </div>
                <div style={{ fontFamily: SW_FONTS.body, fontSize: 13, fontWeight: 700, color: SW_COLORS.ink }}>{PRODUCT_LABELS[k]}</div>
                <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, color: SW_COLORS.muted, marginTop: 4 }}>{k}</div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
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
