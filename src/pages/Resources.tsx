import { SW_COLORS, SW_FONTS, SW_RADIUS } from '../design/tokens';
import { alpha } from '../design/color-utils';
import { Card, Button, Stat, Tag, HudSelect, EmptyState, NewGarmentTemplateDialog, NumberInput, useConfirm, Icon, ViewTitle } from '../components';
import { useRef, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ALL_MACHINES,
  type MachineCode,
  type Operation,
  type GarmentTemplate,
  GARMENT_TEMPLATES,
} from '../domain';
import { useProject, useGarments, type EffectiveGarments } from '../store';
import { useTwin } from '../store/twin';
import { parseGarmentXlsx, type ImportedGarment } from '../lib/import-garment-xlsx';
import {
  parseFloorXlsx,
  placeLayoutStations,
  commitFloorImport,
  type ImportedFloor,
  type LayoutPlacement,
} from '../lib/import-floor-xlsx';
import { bindObToLayout, pickObForLayout, type ObBinding } from '../lib/bind-ob-to-layout';

/**
 * Resources page — the garment operation bulletins.
 *
 * This used to carry three more tabs: an Operators roster, a Machines
 * inventory and a Skill matrix. The roster was invented — thirty first
 * names cycled to a headcount typed elsewhere, with an efficiency and a
 * "SAM" made up from the row number — and the machine counts were a
 * constant that never looked at the floor. Nothing the simulation reads
 * came from either. The skill matrix did reach the engine, but only after
 * being averaged into one number per operation, which is a per-station
 * efficiency wearing a 131-row costume. That number now lives on the
 * station (and its line) in the Builder Inspector, next to the workers it
 * describes.
 *
 * What is left is the one input the model genuinely needs from here: each
 * garment's operations, their SMVs and the machine each one runs on.
 */
export function ResourcesPage() {
  // ?garment=<id> lets other surfaces deep-link straight to the operations
  // editor for a specific garment, and `&new=1` opens the new-garment dialog
  // on arrival — the Builder links in with both, because "edit this
  // garment's bulletin" and "add a garment" are asked from there and this
  // page is the only place either can be done. (`?tab=operations` from older
  // links is accepted and ignored: there is only one tab now.)
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialGarment = searchParams.get('garment') ?? undefined;
  const openNewGarment = searchParams.get('new') === '1';
  const garments = useGarments();

  return (
    <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', background: SW_COLORS.paperDeep }}>
      {/* Title bar — the same back button + view title the Factory Builder
          uses, so moving between the two reads as one app. */}
      <div style={{ display:'flex', alignItems:'center', gap: 12, padding:'10px 16px', background: SW_COLORS.paper, borderBottom: `1px solid ${SW_COLORS.line}` }}>
        <button
          onClick={() => navigate('/line')}
          title="Back to Builder"
          aria-label="Back to Builder"
          style={{
            width: 30,
            height: 30,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: SW_COLORS.paper,
            border: `1px solid ${SW_COLORS.line}`,
            borderRadius: 6,
            color: SW_COLORS.muted,
            cursor: 'pointer',
          }}
        >
          <Icon name="back" />
        </button>
        <ViewTitle title="Resources" />
      </div>

      <div style={{ flex:1, overflow:'auto', padding:'24px' }}>
        <OperationsPanel garments={garments} initialGarmentId={initialGarment} openNewGarment={openNewGarment}/>
      </div>
    </div>
  );
}

// ── Operations editor ───────────────────────────────────────────────────────

interface OperationsPanelProps {
  garments: EffectiveGarments;
  /** Optional deep-link target — when set, the panel opens with this garment
   *  pre-selected (e.g. from the Builder inspector's ?garment=<id>). */
  initialGarmentId?: string;
  /** Open the new-garment dialog on mount — the landing state for a
   *  "+ New garment" link arriving from another surface. */
  openNewGarment?: boolean;
}

/**
 * Operation library editor — pick a garment, edit / add / reorder / delete
 * its operations. Edits are stored in `project.garmentEdits` (built-in or
 * custom) and flow through `useGarments()` so every read site (LiveSim,
 * Line Balance, Twin run-line, etc.) picks them up immediately.
 */
function OperationsPanel({ garments, initialGarmentId, openNewGarment }: OperationsPanelProps) {
  const project = useProject();
  const confirm = useConfirm();
  const [garmentId, setGarmentId] = useState<string>(
    initialGarmentId && garments.byId[initialGarmentId]
      ? initialGarmentId
      : garments.all[0]?.id ?? '',
  );
  // Excel import state — `importBatch` is a queue of parsed previews (one
  // per selected file). Each entry is tagged with its `kind`: garment OBs
  // commit into the project library; floor layouts commit a new SewingLine
  // + Workstations into the canonical Twin. The preview modal
  // pages through the batch one entry at a time.
  type ImportEntry =
    | { kind: 'garment'; preview: ImportedGarment }
    | { kind: 'layout'; preview: ImportedFloor; placement: LayoutPlacement };
  const [importBatch, setImportBatch] = useState<ImportEntry[]>([]);
  const [importBatchIndex, setImportBatchIndex] = useState(0);
  const [importFailures, setImportFailures] = useState<{ file: string; reason: string }[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [newGarmentOpen, setNewGarmentOpen] = useState(!!openNewGarment);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const handleImportPick = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImporting(true);
    setImportError(null);
    setImportSummary(null);
    const fileList = Array.from(files);
    const reads = fileList.map(
      (file) =>
        new Promise<{ ok: true; entry: ImportEntry | ImportEntry[] } | { ok: false; file: string; reason: string }>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const buf = reader.result as ArrayBuffer;
            // Run BOTH parsers on every workbook. One file often carries the
            // bulletin on one sheet and the machine layout on another; the
            // old "OB first, layout only as a fallback" order took the
            // bulletin and silently dropped the layout beside it.
            const entries: ImportEntry[] = [];
            let obError = '';
            let layoutError = '';
            try {
              entries.push({ kind: 'garment', preview: parseGarmentXlsx(buf, file.name) });
            } catch (e) {
              obError = e instanceof Error ? e.message : String(e);
            }
            try {
              // Every layout sheet in the workbook (some files genuinely hold
              // more than one) becomes its own batch entry.
              for (const floor of parseFloorXlsx(buf, file.name)) {
                entries.push({ kind: 'layout', preview: floor, placement: placeLayoutStations(floor) });
              }
            } catch (e) {
              layoutError = e instanceof Error ? e.message : String(e);
            }
            if (entries.length > 0) return resolve({ ok: true, entry: entries });
            return resolve({
              ok: false,
              file: file.name,
              reason: `Not an OB (${obError}) and not a Machine Layout (${layoutError}).`,
            });
          };
          reader.onerror = () => resolve({ ok: false, file: file.name, reason: 'Could not read the file.' });
          reader.readAsArrayBuffer(file);
        }),
    );
    Promise.all(reads).then((results) => {
      const successes: ImportEntry[] = [];
      const failures: { file: string; reason: string }[] = [];
      for (const r of results) {
        if (r.ok) {
          if (Array.isArray(r.entry)) successes.push(...r.entry);
          else successes.push(r.entry);
        } else failures.push({ file: r.file, reason: r.reason });
      }
      // Garments first, then layouts — feels natural in the preview flow:
      // user reviews data first, then physical line placements.
      successes.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'garment' ? -1 : 1));
      setImportBatch(successes);
      setImportBatchIndex(0);
      setImportFailures(failures);
      if (successes.length === 0 && failures.length > 0) {
        setImportError(`${failures.length} file${failures.length === 1 ? '' : 's'} failed to parse — see details below.`);
      }
      setImporting(false);
    });
  };

  const importPreview = importBatch[importBatchIndex] ?? null;

  /** The bulletin that times a layout's stations, if one is on hand: one read
   *  in this same batch, or one already saved in the project. Undefined when
   *  none fits or none of its operations are on the layout. */
  const bindingFor = (entry: Extract<ImportEntry, { kind: 'layout' }>): ObBinding | undefined => {
    const inBatch = importBatch.flatMap((e) =>
      e.kind === 'garment' ? [{ garment: e.preview.garment, fileName: e.preview.source.fileName }] : [],
    );
    const seen = new Set(inBatch.map((c) => c.garment.id));
    const saved = Object.values(project.garmentEdits)
      .filter((g) => !seen.has(g.id))
      .map((garment) => ({ garment }));
    const ob = pickObForLayout(
      { fileName: entry.preview.source.fileName, style: entry.preview.source.style },
      [...inBatch, ...saved],
    );
    if (!ob) return undefined;
    const lineLabel = entry.preview.source.lineNo != null
      ? `Line ${entry.preview.source.lineNo}`
      : entry.placement.lineName;
    const binding = bindObToLayout(entry.placement.stations, ob, lineLabel);
    return binding.matched > 0 ? binding : undefined;
  };
  const previewBinding = importPreview?.kind === 'layout' ? bindingFor(importPreview) : undefined;

  const commitEntry = (entry: ImportEntry): string => {
    if (entry.kind === 'garment') {
      const g = entry.preview.garment;
      project.setGarmentEdit(g.id, g);
      setGarmentId(g.id);
      return `${g.name} (${g.operations.length} ops)`;
    }
    const binding = bindingFor(entry);
    // The stations point at this bulletin by id, so it has to be in the
    // library before the line that references it.
    if (binding) project.setGarmentEdit(binding.garment.id, binding.garment);
    const result = commitFloorImport(useTwin.getState(), entry.preview, entry.placement, { binding });
    const timing = binding
      ? `${binding.matched} timed from ${binding.source.name}`
      : 'no bulletin matched';
    return `${entry.placement.lineName} (${result.workstationCount} stations, ${timing})`;
  };

  const commitImport = () => {
    if (!importPreview) return;
    commitEntry(importPreview);
    if (importBatchIndex + 1 < importBatch.length) {
      setImportBatchIndex(importBatchIndex + 1);
    } else {
      setImportBatch([]);
      setImportBatchIndex(0);
    }
  };

  const commitAllImports = () => {
    if (importBatch.length === 0) return;
    const labels: string[] = [];
    for (const item of importBatch) {
      labels.push(commitEntry(item));
    }
    setImportBatch([]);
    setImportBatchIndex(0);
    setImportSummary(`Imported ${labels.length} item${labels.length === 1 ? '' : 's'}: ${labels.join('; ')}.`);
  };

  const skipImport = () => {
    if (importBatchIndex + 1 < importBatch.length) {
      setImportBatchIndex(importBatchIndex + 1);
    } else {
      setImportBatch([]);
      setImportBatchIndex(0);
    }
  };

  const cancelImport = () => {
    setImportBatch([]);
    setImportBatchIndex(0);
  };
  const garment = garments.byId[garmentId] ?? garments.all[0];
  const builtIn = GARMENT_TEMPLATES[garmentId];
  const isEdited = project.garmentEdits[garmentId] !== undefined;
  const isBuiltIn = !!builtIn;
  const hiddenIds = garments.hidden;

  function patch(p: Partial<Omit<GarmentTemplate, 'operations'>>) {
    project.patchGarment(garmentId, builtIn, p);
  }

  function addOp() {
    const newOp: Operation = {
      id: `${garmentId}-${Date.now().toString(36)}`,
      code: `OP-${(garment.operations.length + 1).toString().padStart(2, '0')}`,
      name: 'New operation',
      smv: 0.30,
      machineCode: 'SNL',
    };
    project.addOperation(garmentId, builtIn, newOp);
  }

  /** Persist a garment authored in the new-template dialog and select it.
   *
   *  This replaced a `prompt()` that produced a garment with zero operations —
   *  a template you then had to build row by row before it could be run. The
   *  dialog parses a whole bulletin at once, so a new garment arrives usable.
   */
  function createGarment(g: GarmentTemplate) {
    project.setGarmentEdit(g.id, g);
    setGarmentId(g.id);
    setNewGarmentOpen(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Garment picker + meta */}
      <Card padding={16}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '0.5px' }}>GARMENT</span>
          <HudSelect
            value={garmentId}
            onChange={setGarmentId}
            variant="light"
            width={280}
            options={garments.all.map((g) => ({
              value: g.id,
              label: g.name.replace(/\s*\(.*\)/, '') + (project.garmentEdits[g.id] ? ' ●' : ''),
              meta: `${g.operations.length} ops`,
            }))}
          />
          <div style={{ flex: 1 }}/>
          <Button variant="secondary" size="sm" icon="+" title="New garment" onClick={() => setNewGarmentOpen(true)}>New</Button>
          {/* Import from Excel — feeds an industry operation-breakdown sheet
              (any standard ERP-exported bulletin) through
              `parseGarmentXlsx` and previews the result in a confirm modal.
              Hidden <input> + button click forwards via ref. */}
          <input
            ref={importInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            style={{ display: 'none' }}
            onChange={(e) => {
              handleImportPick(e.target.files);
              e.target.value = '';
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            icon="⇣"
            title="Import garments from Excel"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? 'Reading…' : 'Import'}
          </Button>
          {/* Built-in edited rows expose a Reset that drops the override but
              keeps the garment in the picker — separate from the delete
              action, which removes it from the library entirely. */}
          {isBuiltIn && isEdited && (
            <Button
              variant="secondary"
              size="sm"
              title="Reset to built-in"
              onClick={async () => {
                if (await confirm({ title: 'Reset garment', message: `Reset ${garment.name} back to its built-in defaults? Your edits will be discarded.`, confirmLabel: 'Reset' })) {
                  project.resetGarment(garmentId);
                }
              }}
            >
              Reset
            </Button>
          )}
          {/* Delete works for every garment — built-ins are hidden from the
              picker (and their edits dropped) while customs are removed. */}
          <Button
            variant="danger"
            size="sm"
            title="Delete garment"
            onClick={async () => {
              if (!(await confirm({ title: 'Delete garment', message: `Delete ${garment.name}?`, confirmLabel: 'Delete', variant: 'danger' }))) return;
              const remaining = garments.all.filter((g) => g.id !== garmentId);
              const nextId = remaining[0]?.id ?? 'tshirt';
              if (isBuiltIn) {
                project.hideGarment(garmentId);
              } else {
                project.resetGarment(garmentId);
              }
              setGarmentId(nextId);
            }}
          >
            Delete
          </Button>
        </div>
        {hiddenIds.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
            margin: '0 0 10px', padding: '6px 10px',
            background: SW_COLORS.paperEdge, borderRadius: SW_RADIUS.md,
            fontSize: 11, color: SW_COLORS.muted,
          }}>
            <span style={{ fontFamily: SW_FONTS.mono, fontWeight: 700, letterSpacing: '0.5px' }}>HIDDEN</span>
            <span>· {hiddenIds.length} built-in{hiddenIds.length === 1 ? '' : 's'} removed from the picker:</span>
            {hiddenIds.map((id) => {
              const def = GARMENT_TEMPLATES[id];
              const label = def?.name ?? id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    project.unhideGarment(id);
                    setGarmentId(id);
                  }}
                  style={{
                    background: SW_COLORS.paper, border: `1px solid ${SW_COLORS.line}`,
                    borderRadius: SW_RADIUS.sm, padding: '2px 8px', cursor: 'pointer',
                    fontSize: 11, color: SW_COLORS.ink, fontFamily: SW_FONTS.body,
                  }}
                  title={`Restore ${label} to the garment picker`}
                >
                  ↺ {label}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>
          {/* Left column — Name and Description as peer text fields. They sit
              at the same visual level (same label style, same input style,
              stacked) so neither one feels more important than the other. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: SW_COLORS.muted, marginBottom: 4 }}>Name</div>
              <input value={garment.name} onChange={(e) => patch({ name: e.target.value })}
                aria-label="Garment name"
                style={headerField}/>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: SW_COLORS.muted, marginBottom: 4 }}>Description</div>
              <input value={garment.description} onChange={(e) => patch({ description: e.target.value })}
                aria-label="Garment description"
                placeholder="What is this garment?"
                style={headerField}/>
            </div>
          </div>
          {/* Total SAM — the one derived figure in the header. */}
          <div style={{
            border: `1px solid ${SW_COLORS.line}`,
            borderRadius: SW_RADIUS.sm,
            background: SW_COLORS.paperDeep,
            overflow: 'hidden',
          }}>
            <div style={{ padding: '6px 10px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: SW_COLORS.muted, marginBottom: 4 }}>Total SAM</div>
              {/* Ink, not brand — this one is summed from the operations table,
                  so it is the derived half of the pair. */}
              <div style={{ fontFamily: SW_FONTS.mono, fontSize: 14, fontWeight: 700, color: SW_COLORS.ink }}>
                {garment.totalSmv.toFixed(3)} min
                <span style={{ color: SW_COLORS.muted, fontWeight: 600, marginLeft: 6, fontSize: 11 }}>· {garment.operations.length} ops</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Operations table */}
      <Card padding={0} style={{ overflow: 'auto', maxHeight: 'calc(100vh - 380px)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SW_FONTS.body, fontSize: 12 }}>
          <thead>
            <tr style={{ background: SW_COLORS.paperDeep, borderBottom: `1px solid ${SW_COLORS.line}` }}>
              {['#', 'Order', 'Code', 'Name', 'SMV (min)', 'Machine', ''].map((h) => (
                <th key={h} style={{ padding: '10px 10px', textAlign: 'left', fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '0.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {garment.operations.map((op, i) => (
              <tr key={op.id} style={{ borderBottom: `1px solid ${SW_COLORS.line}` }}>
                <td style={{ padding: '6px 10px', fontFamily: SW_FONTS.mono, fontWeight: 700, color: SW_COLORS.muted, width: 28 }}>{i + 1}</td>
                <td style={{ padding: '6px 6px', whiteSpace: 'nowrap' }}>
                  <button onClick={() => project.moveOperation(garmentId, builtIn, op.id, -1)} disabled={i === 0}
                    style={miniBtn(i === 0)}>↑</button>
                  <button onClick={() => project.moveOperation(garmentId, builtIn, op.id, 1)} disabled={i === garment.operations.length - 1}
                    style={miniBtn(i === garment.operations.length - 1)}>↓</button>
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <input value={op.code ?? ''}
                    onChange={(e) => project.updateOperation(garmentId, builtIn, op.id, { code: e.target.value })}
                    style={cellInput(60)}
                  />
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <input value={op.name}
                    onChange={(e) => project.updateOperation(garmentId, builtIn, op.id, { name: e.target.value })}
                    style={cellInput(220)}
                  />
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <NumberInput value={op.smv} step={0.01} min={0.001}
                    aria-label={`SMV for ${op.name}`}
                    onChange={(v) => { if (v !== undefined) project.updateOperation(garmentId, builtIn, op.id, { smv: v }); }}
                    style={{ ...cellInput(72), fontFamily: SW_FONTS.mono, fontWeight: 700 }}
                  />
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <HudSelect
                    value={op.machineCode}
                    onChange={(v) => project.updateOperation(garmentId, builtIn, op.id, { machineCode: v as MachineCode })}
                    variant="light"
                    size="sm"
                    mono
                    width="100%"
                    options={ALL_MACHINES.map((m) => ({ value: m.code, label: `${m.code} · ${m.shortName}` }))}
                  />
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                  <button onClick={async () => {
                    if (await confirm({ title: 'Delete operation', message: `Delete ${op.code ?? op.name}?`, confirmLabel: 'Delete', variant: 'danger' })) project.removeOperation(garmentId, builtIn, op.id);
                  }} style={{ ...miniBtn(false), background: 'transparent', color: SW_COLORS.alarm, fontSize: 13 }}>×</button>
                </td>
              </tr>
            ))}
            {garment.operations.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 12 }}>
                  <EmptyState
                    size="sm"
                    icon="🪡"
                    title="No operations yet"
                    body={<>Click <strong style={{ color: SW_COLORS.ink }}>+ Add operation</strong> below to build this bulletin.</>}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paperDeep }}>
          <Button variant="primary" size="sm" icon="+" onClick={addOp}>Add operation</Button>
        </div>
      </Card>


      {importError && (
        <div
          style={{
            padding: 12,
            background: SW_COLORS.paper,
            border: `1px solid ${SW_COLORS.alarm}`,
            borderRadius: SW_RADIUS.sm,
            fontSize: 12,
            color: SW_COLORS.alarm,
            display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between',
          }}
        >
          <span><strong>Excel import failed:</strong> {importError}</span>
          <Button variant="ghost" size="sm" onClick={() => setImportError(null)}>Dismiss</Button>
        </div>
      )}

      {importFailures.length > 0 && (
        <div
          style={{
            padding: 12,
            background: SW_COLORS.paper,
            border: `1px solid ${SW_COLORS.warn}`,
            borderRadius: SW_RADIUS.sm,
            fontSize: 12,
            color: SW_COLORS.ink,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong style={{ color: SW_COLORS.warn }}>
              {importFailures.length} file{importFailures.length === 1 ? '' : 's'} skipped during import
            </strong>
            <Button variant="ghost" size="sm" onClick={() => setImportFailures([])}>Dismiss</Button>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: SW_COLORS.muted, fontSize: 11, lineHeight: 1.6 }}>
            {importFailures.map((f) => (
              <li key={f.file}><strong style={{ color: SW_COLORS.ink }}>{f.file}</strong> — {f.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {importSummary && (
        <div
          style={{
            padding: 12,
            background: SW_COLORS.paper,
            border: `1px solid ${SW_COLORS.ok}`,
            borderRadius: SW_RADIUS.sm,
            fontSize: 12,
            color: SW_COLORS.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}
        >
          <span><strong style={{ color: SW_COLORS.ok }}>✓ Import complete</strong> — {importSummary}</span>
          <Button variant="ghost" size="sm" onClick={() => setImportSummary(null)}>Dismiss</Button>
        </div>
      )}

      {importPreview?.kind === 'garment' && (
        <ImportPreviewModal
          preview={importPreview.preview}
          batchIndex={importBatchIndex}
          batchTotal={importBatch.length}
          onCancel={cancelImport}
          onConfirm={commitImport}
          onSkip={skipImport}
          onConfirmAll={importBatch.length > 1 ? commitAllImports : undefined}
        />
      )}
      {importPreview?.kind === 'layout' && (
        <LayoutPreviewModal
          preview={importPreview.preview}
          placement={importPreview.placement}
          binding={previewBinding}
          batchIndex={importBatchIndex}
          batchTotal={importBatch.length}
          onCancel={cancelImport}
          onConfirm={commitImport}
          onSkip={skipImport}
          onConfirmAll={importBatch.length > 1 ? commitAllImports : undefined}
        />
      )}
      {newGarmentOpen && (
        <NewGarmentTemplateDialog
          onCancel={() => setNewGarmentOpen(false)}
          onCreate={createGarment}
        />
      )}
    </div>
  );
}

// ── Excel import preview modal ───────────────────────────────────────────
/**
 * Confirm-before-commit modal for the Excel importer. Lists every parsed
 * operation with its mapped MachineCode + skill so the user can spot bad
 * machine inferences before the garment lands in the library.
 */
function ImportPreviewModal({
  preview,
  onCancel,
  onConfirm,
  onSkip,
  onConfirmAll,
  batchIndex,
  batchTotal,
}: {
  preview: ImportedGarment;
  onCancel: () => void;
  onConfirm: () => void;
  onSkip?: () => void;
  onConfirmAll?: () => void;
  batchIndex: number;
  batchTotal: number;
}) {
  const g = preview.garment;
  const totalCount = g.operations.length;
  const machineBreakdown = useMemo(() => {
    const byCode = new Map<string, number>();
    for (const op of g.operations) byCode.set(op.machineCode, (byCode.get(op.machineCode) ?? 0) + 1);
    return Array.from(byCode.entries()).sort((a, b) => b[1] - a[1]);
  }, [g.operations]);

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: alpha(SW_COLORS.ink, 0.55),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(960px, 96vw)',
          maxHeight: '88vh',
          background: SW_COLORS.paper,
          border: `1px solid ${SW_COLORS.line}`,
          borderRadius: SW_RADIUS.md,
          boxShadow: '0 24px 60px rgba(15,20,25,0.35)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${SW_COLORS.line}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: SW_COLORS.muted }}>
              Import preview
              {batchTotal > 1 && (
                <span style={{ marginLeft: 8, color: SW_COLORS.brand }}>
                  · {batchIndex + 1} of {batchTotal}
                </span>
              )}
            </div>
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 20, fontWeight: 800, color: SW_COLORS.ink, marginTop: 2 }}>{g.name}</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            style={{ border: 'none', background: 'transparent', fontSize: 22, color: SW_COLORS.muted, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paperDeep, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <Stat label="Operations" value={totalCount.toString()} />
          <Stat label="Total SAM" value={`${g.totalSmv.toFixed(3)} min`} />
          <Stat label="Target / hr @100%" value={`${g.hourlyTarget100}`} />
        </div>

        <div style={{ padding: '8px 18px', display: 'flex', flexWrap: 'wrap', gap: 6, borderBottom: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paper }}>
          {preview.source.style && <Tag>{`Style: ${preview.source.style}`}</Tag>}
          {preview.source.customer && <Tag>{`Customer: ${preview.source.customer}`}</Tag>}
          {preview.source.declaredSmv !== undefined && (
            <Tag>{`Declared SMV: ${preview.source.declaredSmv}`}</Tag>
          )}
          {preview.source.declaredManpower !== undefined && (
            <Tag>{`Declared manpower: ${preview.source.declaredManpower.toFixed(1)}`}</Tag>
          )}
          <Tag>{`File: ${preview.source.fileName}`}</Tag>
        </div>

        {machineBreakdown.length > 0 && (
          <div style={{ padding: '8px 18px', display: 'flex', flexWrap: 'wrap', gap: 6, borderBottom: `1px solid ${SW_COLORS.line}` }}>
            <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, marginRight: 6, alignSelf: 'center', letterSpacing: '0.5px' }}>MIX</span>
            {machineBreakdown.map(([code, n]) => (
              <Tag key={code}>{`${code} · ${n}`}</Tag>
            ))}
          </div>
        )}

        {preview.warnings.length > 0 && (
          <div style={{ padding: '8px 18px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {preview.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: SW_COLORS.warn }}>⚠ {w}</div>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: '12px 18px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SW_FONTS.body, fontSize: 12 }}>
            <thead>
              <tr style={{ background: SW_COLORS.paperDeep }}>
                {['#', 'Code', 'Name', 'SMV', 'Machine', 'Skill', 'Category', 'Notes'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '6px 8px', textAlign: 'left',
                      fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700,
                      color: SW_COLORS.muted, letterSpacing: '0.5px',
                      borderBottom: `1px solid ${SW_COLORS.line}`,
                      position: 'sticky', top: 0, background: SW_COLORS.paperDeep,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.operations.map((op, i) => (
                <tr key={op.id} style={{ borderBottom: `1px solid ${SW_COLORS.line}` }}>
                  <td style={{ padding: '4px 8px', fontFamily: SW_FONTS.mono, color: SW_COLORS.muted, width: 28 }}>{i + 1}</td>
                  <td style={{ padding: '4px 8px', fontFamily: SW_FONTS.mono, fontSize: 11 }}>{op.code ?? ''}</td>
                  <td style={{ padding: '4px 8px' }}>{op.name}</td>
                  <td style={{ padding: '4px 8px', fontFamily: SW_FONTS.mono, fontSize: 11, textAlign: 'right' }}>{op.smv.toFixed(3)}</td>
                  <td style={{ padding: '4px 8px', fontFamily: SW_FONTS.mono, fontSize: 11 }}>{op.machineCode}</td>
                  <td style={{ padding: '4px 8px', fontSize: 11, color: SW_COLORS.muted, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={op.notes ?? ''}>{op.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px 18px', borderTop: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paperDeep, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 11, color: SW_COLORS.muted, maxWidth: 380 }}>
            Confirming creates a new custom garment in your library. You can edit operations, SMVs, and machine codes afterward.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
            {onSkip && batchTotal > 1 && (
              <Button variant="ghost" size="sm" onClick={onSkip}>Skip this one</Button>
            )}
            {onConfirmAll && (
              <Button variant="secondary" size="sm" onClick={onConfirmAll}>
                Add all ({batchTotal})
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={onConfirm}>
              {batchTotal > 1 ? `Add & next` : `Add to garment library`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Machine-Layout preview modal ────────────────────────────────────────
/**
 * Sibling of `ImportPreviewModal` that handles Modelama-style Machine
 * Layout files. The body summarises the line (station count, machine
 * mix, source meta) and shows a simple top-down schematic of the two
 * facing rows so the user can sanity-check placement before the new
 * SewingLine + Workstations are dropped into the Twin.
 */
function LayoutPreviewModal({
  preview,
  placement,
  binding,
  onCancel,
  onConfirm,
  onSkip,
  onConfirmAll,
  batchIndex,
  batchTotal,
}: {
  preview: ImportedFloor;
  placement: LayoutPlacement;
  /** The bulletin timing this layout's stations, when one was found. */
  binding?: ObBinding;
  onCancel: () => void;
  onConfirm: () => void;
  onSkip?: () => void;
  onConfirmAll?: () => void;
  batchIndex: number;
  batchTotal: number;
}) {
  const counts = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const s of placement.stations) byCat.set(s.catalogId, (byCat.get(s.catalogId) ?? 0) + 1);
    return Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]);
  }, [placement.stations]);
  // SMV each station will run at, parallel to `placement.stations`.
  const stationSmv = useMemo(() => {
    if (!binding) return null;
    const smvById = new Map(binding.garment.operations.map((o) => [o.id, o.smv]));
    return binding.opIdByStation.map((id) => (id ? smvById.get(id) ?? null : null));
  }, [binding]);

  // Schematic dimensions
  const cellPx = 18;
  const padPx = 12;
  const schematicW = placement.widthCells * cellPx + padPx * 2;
  const schematicH = placement.depthCells * cellPx + padPx * 2;

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: alpha(SW_COLORS.ink, 0.55),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(960px, 96vw)',
          maxHeight: '88vh',
          background: SW_COLORS.paper,
          border: `1px solid ${SW_COLORS.line}`,
          borderRadius: SW_RADIUS.md,
          boxShadow: '0 24px 60px rgba(15,20,25,0.35)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${SW_COLORS.line}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontFamily: SW_FONTS.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: SW_COLORS.muted }}>
              Layout preview
              {batchTotal > 1 && (
                <span style={{ marginLeft: 8, color: SW_COLORS.brand }}>
                  · {batchIndex + 1} of {batchTotal}
                </span>
              )}
            </div>
            <div style={{ fontFamily: SW_FONTS.display, fontSize: 20, fontWeight: 800, color: SW_COLORS.ink, marginTop: 2 }}>
              {placement.lineName}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            style={{ border: 'none', background: 'transparent', fontSize: 22, color: SW_COLORS.muted, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paperDeep, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <Stat label="Stations" value={placement.stations.length.toString()} />
          <Stat label="Declared M/C" value={(preview.source.machineCount ?? '—').toString()} />
          <Stat label="Declared W/S" value={(preview.source.workstationCount ?? '—').toString()} />
          <Stat label="Machine SMV" value={preview.source.machineSmv != null ? `${preview.source.machineSmv} min` : '—'} />
        </div>

        <div style={{ padding: '8px 18px', display: 'flex', flexWrap: 'wrap', gap: 6, borderBottom: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paper }}>
          {preview.source.style && <Tag>{`Style: ${preview.source.style}`}</Tag>}
          {preview.source.buyer && <Tag>{`Buyer: ${preview.source.buyer}`}</Tag>}
          {preview.source.description && <Tag>{preview.source.description}</Tag>}
          {preview.source.lineNo != null && <Tag>{`Line ${preview.source.lineNo}`}</Tag>}
          {preview.source.target != null && <Tag>{`Target ${Math.round(preview.source.target)}/8h`}</Tag>}
          <Tag>{`File: ${preview.source.fileName}`}</Tag>
        </div>

        <div style={{ padding: '8px 18px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', borderBottom: `1px solid ${SW_COLORS.line}` }}>
          <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, marginRight: 6, letterSpacing: '0.5px' }}>TIMES</span>
          {binding ? (
            <>
              <Tag>{`From: ${binding.source.name}`}</Tag>
              <Tag>{`${binding.matched} of ${placement.stations.length} stations matched`}</Tag>
              <Tag>{`${binding.unplacedOps.length} bulletin operations with no station`}</Tag>
            </>
          ) : (
            <span style={{ fontSize: 11, color: SW_COLORS.warn }}>
              No operation bulletin matched. Stations will run at catalogue default cycles.
            </span>
          )}
        </div>

        {counts.length > 0 && (
          <div style={{ padding: '8px 18px', display: 'flex', flexWrap: 'wrap', gap: 6, borderBottom: `1px solid ${SW_COLORS.line}` }}>
            <span style={{ fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, marginRight: 6, alignSelf: 'center', letterSpacing: '0.5px' }}>MIX</span>
            {counts.map(([id, n]) => (
              <Tag key={id}>{`${id.replace(/^a_/, '')} · ${n}`}</Tag>
            ))}
          </div>
        )}

        {preview.warnings.length > 0 && (
          <div style={{ padding: '8px 18px 0', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 80, overflow: 'auto' }}>
            {preview.warnings.slice(0, 6).map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: SW_COLORS.warn }}>⚠ {w}</div>
            ))}
            {preview.warnings.length > 6 && (
              <div style={{ fontSize: 11, color: SW_COLORS.muted }}>… and {preview.warnings.length - 6} more</div>
            )}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: '12px 18px' }}>
          {/* Top-down schematic of the two facing rows */}
          <div style={{ marginBottom: 12, fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700, color: SW_COLORS.muted, letterSpacing: '0.5px' }}>
            SCHEMATIC · {placement.widthCells}×{placement.depthCells} cells
          </div>
          <div style={{
            background: SW_COLORS.paperDeep,
            border: `1px solid ${SW_COLORS.line}`,
            borderRadius: SW_RADIUS.sm,
            overflow: 'auto',
            marginBottom: 16,
          }}>
            <svg width={schematicW} height={schematicH} style={{ display: 'block' }}>
              {/* aisle band */}
              <rect
                x={padPx} y={padPx + cellPx * 2}
                width={placement.widthCells * cellPx} height={cellPx * 2}
                fill={SW_COLORS.paper} opacity={0.6}
              />
              {placement.stations.map((s, i) => (
                <g key={i} transform={`translate(${padPx + s.x * cellPx}, ${padPx + s.y * cellPx})`}>
                  <rect
                    width={cellPx * 2 - 2} height={cellPx * 2 - 2}
                    rx={2}
                    fill={catalogColor(s.catalogId)}
                    stroke={SW_COLORS.line}
                    strokeWidth={0.5}
                  />
                  <text
                    x={cellPx} y={cellPx + 3}
                    textAnchor="middle"
                    fontSize={9}
                    fontFamily={SW_FONTS.mono}
                    fontWeight={700}
                    fill={SW_COLORS.paper}
                  >
                    {s.catalogId.replace(/^a_/, '').slice(0, 4).toUpperCase()}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          {/* Station list as a table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SW_FONTS.body, fontSize: 12 }}>
            <thead>
              <tr style={{ background: SW_COLORS.paperDeep }}>
                {['Seq', 'Code', 'Name', ...(stationSmv ? ['SMV'] : []), 'Raw M/C', 'Mapped', 'Side'].map((h) => (
                  <th key={h} style={{
                    padding: '6px 8px', textAlign: 'left',
                    fontFamily: SW_FONTS.mono, fontSize: 10, fontWeight: 700,
                    color: SW_COLORS.muted, letterSpacing: '0.5px',
                    borderBottom: `1px solid ${SW_COLORS.line}`,
                    position: 'sticky', top: 0, background: SW_COLORS.paperDeep,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {placement.stations.map((s, i) => (
                <tr key={s.seq} style={{ borderBottom: `1px solid ${SW_COLORS.line}` }}>
                  <td style={{ padding: '4px 8px', fontFamily: SW_FONTS.mono, color: SW_COLORS.muted, width: 32 }}>{s.seq + 1}</td>
                  <td style={{ padding: '4px 8px', fontFamily: SW_FONTS.mono, fontSize: 11 }}>{s.codeNo ?? ''}</td>
                  <td style={{ padding: '4px 8px' }}>{s.name}</td>
                  {stationSmv && (
                    <td style={{ padding: '4px 8px', fontFamily: SW_FONTS.mono, fontSize: 11, color: stationSmv[i] == null ? SW_COLORS.warn : SW_COLORS.ink }}>
                      {stationSmv[i] == null ? 'no match' : stationSmv[i]!.toFixed(3)}
                    </td>
                  )}
                  <td style={{ padding: '4px 8px', fontFamily: SW_FONTS.mono, fontSize: 11, color: SW_COLORS.muted }}>{s.rawMachine}</td>
                  <td style={{ padding: '4px 8px', fontFamily: SW_FONTS.mono, fontSize: 11 }}>{s.catalogId}</td>
                  <td style={{ padding: '4px 8px', fontFamily: SW_FONTS.mono, fontSize: 11, color: SW_COLORS.muted }}>{s.side}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px 18px', borderTop: `1px solid ${SW_COLORS.line}`, background: SW_COLORS.paperDeep, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 11, color: SW_COLORS.muted, maxWidth: 420 }}>
            Adds the line and its {placement.stations.length} stations with a Source, Sink and operator pool, ready to run.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
            {onSkip && batchTotal > 1 && (
              <Button variant="ghost" size="sm" onClick={onSkip}>Skip this one</Button>
            )}
            {onConfirmAll && (
              <Button variant="secondary" size="sm" onClick={onConfirmAll}>
                Add all ({batchTotal})
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={onConfirm}>
              {batchTotal > 1 ? 'Add & next' : 'Add line to Twin'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pick a category-flavoured tint for the layout schematic blocks. The
 *  Builder uses richer SVG, but for the preview a flat colour per
 *  fixture-family reads clearly at small sizes. */
function catalogColor(catalogId: string): string {
  if (catalogId.startsWith('a_5ol') || catalogId.startsWith('a_4ol')) return SW_COLORS.bobbin;
  if (catalogId.startsWith('a_iron') || catalogId.includes('press')) return SW_COLORS.press;
  if (catalogId.startsWith('a_inspect') || catalogId.includes('table')) return SW_COLORS.muted;
  if (catalogId.startsWith('a_op')) return SW_COLORS.thread;
  if (catalogId.startsWith('a_bart') || catalogId.startsWith('a_button')) return SW_COLORS.alarm;
  if (catalogId.startsWith('a_kn') || catalogId.startsWith('a_cnc') || catalogId.startsWith('a_spread')) return SW_COLORS.steel;
  return SW_COLORS.brand;
}

function miniBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 22, height: 22, marginRight: 2,
    background: disabled ? SW_COLORS.paperEdge : SW_COLORS.paper,
    color: disabled ? SW_COLORS.faint : SW_COLORS.ink,
    border: `1px solid ${SW_COLORS.line}`,
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 11,
    fontWeight: 800,
    fontFamily: SW_FONTS.mono,
  };
}

function cellInput(width: number): React.CSSProperties {
  return {
    width,
    padding: '5px 7px',
    border: `1px solid ${SW_COLORS.line}`,
    borderRadius: 4,
    fontFamily: SW_FONTS.body,
    fontSize: 12,
    fontWeight: 600,
    background: SW_COLORS.paper,
    color: SW_COLORS.ink,
  };
}

/**
 * The garment header's three editable fields — Name, Description, Default
 * bundle size.
 *
 * These were the last inputs in the app still carrying hand-rolled styles, and
 * all three were unreadable for the same reason: an `<input>` left without a
 * `background` falls back to the UA's light `field` ground, and left without a
 * `color` to the UA's dark `fieldtext`. Name got UA-on-UA (legible, but a white
 * hole punched in a dark panel); Description set `color: ink` and kept the
 * white ground, so near-white text sat on near-white; bundle size set
 * `background: transparent` over the `paperDeep` well and kept UA text, so
 * near-black sat on near-black. Two of the three were invisible.
 *
 * `colorScheme: 'dark'` is what actually fixes the class of bug rather than
 * these three instances: it moves the UA's own `field`/`fieldtext`/caret
 * defaults to their dark variants, so the fallbacks are dark-correct even
 * where a style is later overridden.
 *
 * The typed value reads in `brand`, not `ink`: everything in this header is
 * authored by the user, and the header sits directly above an operations table
 * whose numbers are computed from it (Total SAM, the SMV column). Orange for
 * "you typed this", ink for "the app derived this" — 6.8:1 on `paper` and
 * 6.2:1 on `paperDeep`, so both clear AA.
 */
const HEADER_FIELD_TEXT = SW_COLORS.brand;

const headerField: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: SW_RADIUS.sm,
  border: `1px solid ${SW_COLORS.line}`,
  background: SW_COLORS.paper,
  color: HEADER_FIELD_TEXT,
  colorScheme: 'dark',
  fontFamily: SW_FONTS.body,
  fontSize: 13,
  fontWeight: 700,
  outline: 'none',
};
