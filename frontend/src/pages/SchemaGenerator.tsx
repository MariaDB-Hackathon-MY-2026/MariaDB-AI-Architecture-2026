import { useEffect, useState } from 'react';
import {
  Sparkles, Play, RefreshCw, Save, Trash2, GitCompareArrows,
  History, ChevronDown, ChevronUp, Database, Plus, X, Code2, TableProperties, Download, DatabaseBackup,
} from 'lucide-react';
import {
  jsonFetch, type SchemaGenerateResponse, type SchemaSnapshotResponse,
  type ListSchemaSnapshotsResponse, type SchemaDiffResponse, type DatabaseExportResponse,
} from '../lib/api';
import StatusBanner from '../components/StatusBanner';
import { SkeletonSelect } from '../components/Skeleton';

/* ─── Draft types ────────────────────────────────────────────────────────── */
interface ColumnDraft {
  name: string;
  sql_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_auto_increment: boolean;
  default: string | null;
  references: string | null;
}
interface TableDraft {
  name: string;
  columns: ColumnDraft[];
  unique_indexes: string[][];
  indexes: string[][];
}
interface PlanDraft {
  database_name: string | null;
  tables: TableDraft[];
}

const COMMON_TYPES = [
  'INT','BIGINT','SMALLINT','TINYINT',
  'VARCHAR(255)','VARCHAR(100)','VARCHAR(50)',
  'TEXT','LONGTEXT','DATE','DATETIME','TIMESTAMP',
  'DECIMAL(10,2)','DECIMAL(15,4)','FLOAT','DOUBLE',
  'BOOLEAN','JSON',
];

function blankColumn(): ColumnDraft {
  return { name: '', sql_type: 'VARCHAR(255)', is_nullable: true, is_primary_key: false, is_auto_increment: false, default: null, references: null };
}
function blankTable(): TableDraft {
  return {
    name: 'new_table',
    columns: [{ name: 'id', sql_type: 'INT', is_nullable: false, is_primary_key: true, is_auto_increment: true, default: null, references: null }],
    unique_indexes: [], indexes: [],
  };
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function SchemaGenerator() {
  const [requestText, setRequestText] = useState(
    'Create a student enrollment system with students, courses, and enrollment (many-to-many).',
  );
  const [schema, setSchema]           = useState<SchemaGenerateResponse | null>(null);
  const [editedPlan, setEditedPlan]   = useState<PlanDraft | null>(null);
  const [isLoading, setIsLoading]     = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [errorText, setErrorText]     = useState<string | null>(null);
  const [statusText, setStatusText]   = useState<string | null>(null);
  const [sqlOpen, setSqlOpen]         = useState(false);

  const [versions, setVersions]       = useState<SchemaSnapshotResponse[]>([]);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [diffA, setDiffA]             = useState('');
  const [diffB, setDiffB]             = useState('');
  const [schemaDiff, setSchemaDiff]   = useState<SchemaDiffResponse | null>(null);

  useEffect(() => { void refreshVersions(); }, []);

  async function refreshVersions() {
    try {
      const data = await jsonFetch<ListSchemaSnapshotsResponse>('/schema/versions');
      const vs = data.versions ?? [];
      setVersions(vs);
      if (!diffA && vs.length)     setDiffA(vs[0].id);
      if (!diffB && vs.length > 1) setDiffB(vs[1].id);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setVersionsLoading(false); }
  }

  /* Build SQL from the current edited plan */
  async function buildFromPlan(plan: PlanDraft): Promise<SchemaGenerateResponse | null> {
    try {
      return await jsonFetch<SchemaGenerateResponse>('/schema/build', {
        method: 'POST', body: JSON.stringify({ plan }),
      });
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  async function handleGenerate() {
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const data = await jsonFetch<SchemaGenerateResponse>('/schema/generate', {
        method: 'POST', body: JSON.stringify({ request: requestText }),
      });
      setSchema(data);
      setEditedPlan(JSON.parse(JSON.stringify(data.plan)) as PlanDraft);
      setSqlOpen(false);
      setStatusText(`Generated ${data.statements.length} SQL statements — review and edit below.`);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function handlePreviewSql() {
    if (!editedPlan) return;
    setErrorText(null); setStatusText(null); setIsLoading(true);
    const built = await buildFromPlan(editedPlan);
    if (built) { setSchema(built); setSqlOpen(true); setStatusText(`${built.statements.length} statements ready to execute.`); }
    setIsLoading(false);
  }

  async function handleExecute() {
    if (!editedPlan) return;
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const built = await buildFromPlan(editedPlan);
      if (!built) { setIsLoading(false); return; }
      setSchema(built);
      await jsonFetch('/schema/execute', {
        method: 'POST', body: JSON.stringify({ statements: built.statements }),
      });
      await jsonFetch<SchemaSnapshotResponse>('/schema/versions/save', {
        method: 'POST', body: JSON.stringify({ label: requestText.trim().slice(0, 60) || null }),
      });
      setStatusText(`Executed ${built.statements.length} statement${built.statements.length !== 1 ? 's' : ''} — snapshot saved.`);
      await refreshVersions();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  function downloadSql(statements: string[], dbName: string) {
    const content = statements.join(';\n\n') + ';\n';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dbName}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownload() {
    if (!editedPlan) return;
    setErrorText(null); setIsLoading(true);
    const built = await buildFromPlan(editedPlan);
    if (built) {
      setSchema(built);
      downloadSql(built.statements, editedPlan.database_name ?? 'schema');
    }
    setIsLoading(false);
  }

  async function handleExportDatabase() {
    setErrorText(null); setIsLoading(true);
    try {
      const data = await jsonFetch<DatabaseExportResponse>('/export/database/sql');
      const blob = new Blob([data.sql], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
      setStatusText(`Exported ${data.table_count} table(s), ${data.row_count.toLocaleString()} row(s) → ${data.filename}`);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function saveSnapshot() {
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      await jsonFetch<SchemaSnapshotResponse>('/schema/versions/save', {
        method: 'POST', body: JSON.stringify({ label: snapshotLabel || null }),
      });
      setSnapshotLabel('');
      await refreshVersions();
      setStatusText('Snapshot saved.');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function clearSnapshots() {
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      await jsonFetch('/schema/versions/clear', { method: 'POST', body: '{}' });
      setVersions([]); setDiffA(''); setDiffB(''); setSchemaDiff(null);
      setStatusText('All snapshots cleared.');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function diff() {
    if (!diffA || !diffB) return;
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const out = await jsonFetch<SchemaDiffResponse>('/schema/versions/diff', {
        method: 'POST', body: JSON.stringify({ a_id: diffA, b_id: diffB }),
      });
      setSchemaDiff(out);
      setStatusText('Diff generated.');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Schema Generator</h1>
          <p className="text-sm text-slate-400 mt-1">
            Describe a system in plain English — AI builds the schema, then you refine it visually before executing.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-xl border border-primary-500/30 bg-primary-500/10 px-4 py-2 text-sm font-medium text-primary-300 hover:bg-primary-500/20 disabled:opacity-50 transition-colors flex-shrink-0"
          onClick={() => void handleExportDatabase()}
          disabled={isLoading}
          title="Export all tables (DDL + data) as a .sql file — includes every change made so far"
        >
          <DatabaseBackup className="w-4 h-4" />
          Export Database
        </button>
      </header>

      <StatusBanner error={errorText} status={statusText} />

      {/* ── Prompt ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-white mb-3">
          <Sparkles className="w-4 h-4 text-primary-400" /> Describe your system
        </div>
        <textarea
          className="h-28 w-full resize-none rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500"
          value={requestText}
          onChange={e => setRequestText(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            onClick={() => void handleGenerate()}
            disabled={isLoading || !requestText.trim()}
          >
            <Sparkles className="w-4 h-4" /> Generate schema
          </button>
          {editedPlan && (
            <>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                onClick={() => void handlePreviewSql()}
                disabled={isLoading}
              >
                <Code2 className="w-4 h-4" /> Preview SQL
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/60 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                onClick={() => void handleDownload()}
                disabled={isLoading}
                title="Build SQL from your current edits and download as a .sql file"
              >
                <Download className="w-4 h-4" /> Download SQL
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                onClick={() => void handleExecute()}
                disabled={isLoading}
              >
                <Play className="w-4 h-4" /> Execute & Snapshot
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Visual Schema Editor ────────────────────────────────────────── */}
      {editedPlan && (
        <SchemaEditorPanel
          plan={editedPlan}
          onChange={setEditedPlan}
          onPreview={() => void handlePreviewSql()}
          isLoading={isLoading}
        />
      )}

      {/* ── SQL preview (collapsible) ───────────────────────────────────── */}
      {schema && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="flex items-center">
            <button
              className="flex-1 flex items-center justify-between px-5 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800/40 transition-colors"
              onClick={() => setSqlOpen(v => !v)}
            >
              <span className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-slate-400" />
                SQL preview
                <span className="text-xs text-slate-500">({schema.statements.length} statements)</span>
              </span>
              {sqlOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>
            <button
              onClick={() => downloadSql(schema.statements, editedPlan?.database_name ?? 'schema')}
              title="Download as .sql file"
              className="flex items-center gap-1.5 px-4 py-3 text-xs font-medium text-slate-400 hover:text-emerald-400 hover:bg-slate-800/40 transition-colors border-l border-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
          </div>
          {sqlOpen && (
            <pre className="max-h-80 overflow-auto border-t border-slate-800 bg-black/40 p-4 text-xs text-slate-200 leading-relaxed">
              {schema.statements.join(';\n\n') + ';'}
            </pre>
          )}
        </div>
      )}

      {/* ── Schema History ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <History className="w-4 h-4 text-accent-400" /> Schema History
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Snapshots capture your live database structure at a point in time. Save before making changes, then diff to see what changed.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800/40 disabled:opacity-50"
              onClick={() => void refreshVersions()} disabled={isLoading}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
              onClick={() => void clearSnapshots()} disabled={isLoading || !versions.length}
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear all
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
          <div className="text-xs font-semibold text-slate-300 mb-2">Save current database state</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 placeholder-slate-500"
              value={snapshotLabel}
              onChange={e => setSnapshotLabel(e.target.value)}
              placeholder="Label (optional) — e.g. before adding payments table"
              onKeyDown={e => { if (e.key === 'Enter') void saveSnapshot(); }}
            />
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 flex-shrink-0"
              onClick={() => void saveSnapshot()} disabled={isLoading}
            >
              <Save className="w-4 h-4" /> Save snapshot
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Reads whatever tables currently exist in your live database — no need to generate anything first.
          </p>
        </div>

        {versionsLoading ? (
          <div className="h-12 rounded-xl bg-slate-800/40 animate-pulse" />
        ) : versions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center">
            <Database className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400 font-medium">No snapshots yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Save one before making changes, or use <strong className="text-slate-400">Execute &amp; Snapshot</strong> above.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-400">{versions.length} snapshot{versions.length !== 1 ? 's' : ''} saved</div>
            <div className="overflow-hidden rounded-xl border border-slate-700/50">
              <div className="max-h-72 overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-800 border-b border-slate-700/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 w-8">#</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Label</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tables</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Saved at</th>
                      <th className="px-3 py-2 w-14"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {versions.map((v, i) => <SnapshotRow key={v.id} snapshot={v} index={versions.length - i} />)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {versions.length >= 2 && (
          <div className="border-t border-slate-700/50 pt-5 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <GitCompareArrows className="w-4 h-4 text-primary-400" />
              Compare two snapshots
              <span className="text-slate-500 font-normal">— see what changed between them</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs text-slate-400">
                Before (A)
                {versionsLoading ? <SkeletonSelect className="mt-1 w-full" /> : (
                  <select className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-100" value={diffA} onChange={e => setDiffA(e.target.value)}>
                    <option value="">Select…</option>
                    {versions.map(v => <option key={v.id} value={v.id}>{v.label || 'auto-snapshot'} ({v.tables.length} tables) · {v.at.slice(0, 16)}</option>)}
                  </select>
                )}
              </label>
              <label className="text-xs text-slate-400">
                After (B)
                {versionsLoading ? <SkeletonSelect className="mt-1 w-full" /> : (
                  <select className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-100" value={diffB} onChange={e => setDiffB(e.target.value)}>
                    <option value="">Select…</option>
                    {versions.map(v => <option key={v.id} value={v.id}>{v.label || 'auto-snapshot'} ({v.tables.length} tables) · {v.at.slice(0, 16)}</option>)}
                  </select>
                )}
              </label>
              <button
                className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                onClick={() => void diff()} disabled={isLoading || !diffA || !diffB || diffA === diffB}
              >
                <GitCompareArrows className="w-4 h-4" /> Generate diff
              </button>
            </div>
            {schemaDiff && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <DiffPanel title="Tables"       added={schemaDiff.tables_added}  removed={schemaDiff.tables_removed} />
                <DiffPanel title="Columns"      added={schemaDiff.columns_added} removed={schemaDiff.columns_removed} />
                <DiffPanel title="Foreign keys" added={schemaDiff.fks_added}     removed={schemaDiff.fks_removed} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Visual Schema Editor ───────────────────────────────────────────────── */
function SchemaEditorPanel({
  plan, onChange, onPreview, isLoading,
}: {
  plan: PlanDraft;
  onChange: (p: PlanDraft) => void;
  onPreview: () => void;
  isLoading: boolean;
}) {
  function updateTable(i: number, t: TableDraft) {
    const tables = [...plan.tables];
    tables[i] = t;
    onChange({ ...plan, tables });
  }
  function deleteTable(i: number) {
    onChange({ ...plan, tables: plan.tables.filter((_, idx) => idx !== i) });
  }
  function addTable() {
    onChange({ ...plan, tables: [...plan.tables, blankTable()] });
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-5 space-y-4">
      <SqlTypesDatalist />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <TableProperties className="w-4 h-4 text-primary-400" />
          Visual Schema Editor
          <span className="text-xs font-normal text-slate-400">
            — edit tables and columns before executing
          </span>
        </div>
        <button
          onClick={addTable}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add table
        </button>
      </div>

      <div className="space-y-3">
        {plan.tables.map((t, i) => (
          <TableCard
            key={i}
            table={t}
            onChange={updated => updateTable(i, updated)}
            onDelete={() => deleteTable(i)}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50">
        <button
          onClick={onPreview}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          <Code2 className="w-4 h-4" /> Preview SQL
        </button>
        <span className="text-xs text-slate-500">Changes are applied when you click Execute &amp; Snapshot above.</span>
      </div>
    </div>
  );
}

/* ─── Table card ─────────────────────────────────────────────────────────── */
function TableCard({
  table, onChange, onDelete,
}: {
  table: TableDraft;
  onChange: (t: TableDraft) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(true);

  function updateColumn(j: number, c: ColumnDraft) {
    const columns = [...table.columns];
    columns[j] = c;
    onChange({ ...table, columns });
  }
  function deleteColumn(j: number) {
    onChange({ ...table, columns: table.columns.filter((_, idx) => idx !== j) });
  }
  function addColumn() {
    onChange({ ...table, columns: [...table.columns, blankColumn()] });
  }

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 overflow-hidden">
      {/* Table header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-b border-slate-700/50">
        <button onClick={() => setOpen(v => !v)} className="text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
        <input
          className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-white outline-none border-b border-transparent focus:border-primary-500 pb-0.5"
          value={table.name}
          onChange={e => onChange({ ...table, name: e.target.value })}
          placeholder="table_name"
        />
        <span className="text-[11px] text-slate-500 flex-shrink-0">{table.columns.length} col{table.columns.length !== 1 ? 's' : ''}</span>
        <button
          onClick={addColumn}
          className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors flex-shrink-0"
        >
          <Plus className="w-3 h-3" /> column
        </button>
        <button onClick={onDelete} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Columns */}
      {open && (
        <div className="divide-y divide-slate-700/30">
          {/* Column header row */}
          <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_auto_auto_1fr_auto] gap-2 px-4 py-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            <span>Name</span><span>Type</span><span>PK</span><span>AI</span><span>Null</span><span>References</span><span></span>
          </div>
          {table.columns.map((col, j) => (
            <ColumnRow
              key={j}
              col={col}
              onChange={c => updateColumn(j, c)}
              onDelete={() => deleteColumn(j)}
            />
          ))}
          {table.columns.length === 0 && (
            <div className="px-4 py-3 text-xs text-slate-500 italic text-center">No columns — add one above.</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Column row ─────────────────────────────────────────────────────────── */
function ColumnRow({ col, onChange, onDelete }: { col: ColumnDraft; onChange: (c: ColumnDraft) => void; onDelete: () => void }) {
  const inputCls = 'w-full bg-slate-900/60 border border-slate-700/50 rounded px-2 py-1 text-xs text-slate-100 outline-none focus:border-primary-500';
  const cbxCls   = 'w-3.5 h-3.5 accent-indigo-500 cursor-pointer';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto_auto_1fr_auto] gap-2 items-center px-4 py-2">
      {/* Name */}
      <input
        className={inputCls}
        value={col.name}
        onChange={e => onChange({ ...col, name: e.target.value })}
        placeholder="column_name"
      />
      {/* Type */}
      <div className="relative">
        <input
          className={inputCls}
          value={col.sql_type}
          list="sql-types"
          onChange={e => onChange({ ...col, sql_type: e.target.value })}
          placeholder="VARCHAR(255)"
        />
      </div>
      {/* PK */}
      <label className="flex flex-col items-center gap-0.5 cursor-pointer">
        <span className="text-[9px] text-slate-500 sm:hidden">PK</span>
        <input type="checkbox" className={cbxCls} checked={col.is_primary_key}
          onChange={e => onChange({ ...col, is_primary_key: e.target.checked, is_nullable: e.target.checked ? false : col.is_nullable })} />
      </label>
      {/* AI */}
      <label className="flex flex-col items-center gap-0.5 cursor-pointer">
        <span className="text-[9px] text-slate-500 sm:hidden">AI</span>
        <input type="checkbox" className={cbxCls} checked={col.is_auto_increment}
          onChange={e => onChange({ ...col, is_auto_increment: e.target.checked })} />
      </label>
      {/* Nullable */}
      <label className="flex flex-col items-center gap-0.5 cursor-pointer">
        <span className="text-[9px] text-slate-500 sm:hidden">Null</span>
        <input type="checkbox" className={cbxCls} checked={col.is_nullable} disabled={col.is_primary_key}
          onChange={e => onChange({ ...col, is_nullable: e.target.checked })} />
      </label>
      {/* References */}
      <input
        className={inputCls}
        value={col.references ?? ''}
        onChange={e => onChange({ ...col, references: e.target.value || null })}
        placeholder="table.column"
      />
      {/* Delete */}
      <button onClick={onDelete} className="text-slate-600 hover:text-red-400 transition-colors justify-self-end">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* Shared datalist for SQL types */
function SqlTypesDatalist() {
  return (
    <datalist id="sql-types">
      {COMMON_TYPES.map(t => <option key={t} value={t} />)}
    </datalist>
  );
}

/* ─── Snapshot row ───────────────────────────────────────────────────────── */
function SnapshotRow({ snapshot, index }: { snapshot: SchemaSnapshotResponse; index: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="odd:bg-white/[0.02] hover:bg-primary-500/5 transition-colors">
        <td className="px-3 py-2.5 text-slate-500 font-mono">#{index}</td>
        <td className="px-3 py-2.5 max-w-[220px]">
          {snapshot.label
            ? <span className="text-slate-200 truncate block">{snapshot.label}</span>
            : <span className="italic text-slate-500">auto-snapshot</span>}
        </td>
        <td className="px-3 py-2.5">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary-500/10 text-primary-400 border border-primary-500/20 whitespace-nowrap">
            {snapshot.tables.length} table{snapshot.tables.length !== 1 ? 's' : ''}
          </span>
        </td>
        <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{snapshot.at.slice(0, 19)}</td>
        <td className="px-3 py-2.5 text-right">
          {snapshot.tables.length > 0 && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              {expanded
                ? <><ChevronUp className="w-3 h-3" /> hide</>
                : <><ChevronDown className="w-3 h-3" /> show</>}
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-900/60">
          <td colSpan={5} className="px-4 py-2.5">
            <div className="flex flex-wrap gap-1.5">
              {snapshot.tables.map(t => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-md bg-slate-700/60 text-slate-300">{t}</span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Diff panel ─────────────────────────────────────────────────────────── */
function DiffPanel({ title, added, removed }: { title: string; added?: string[]; removed?: string[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-black/20 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-slate-200">{title}</div>
        {!(added?.length || removed?.length) && <span className="text-[10px] text-slate-500 italic">no changes</span>}
      </div>
      <div className="grid gap-2">
        <div>
          <div className="text-[11px] text-emerald-400 mb-1">+ Added</div>
          <pre className="max-h-32 overflow-auto rounded border border-slate-800 bg-black/30 p-2 text-[11px] text-slate-200">{(added ?? []).join('\n') || '—'}</pre>
        </div>
        <div>
          <div className="text-[11px] text-rose-400 mb-1">− Removed</div>
          <pre className="max-h-32 overflow-auto rounded border border-slate-800 bg-black/30 p-2 text-[11px] text-slate-200">{(removed ?? []).join('\n') || '—'}</pre>
        </div>
      </div>
    </div>
  );
}

/* Mount the shared datalist once at the bottom of the document tree */
export { SqlTypesDatalist };
