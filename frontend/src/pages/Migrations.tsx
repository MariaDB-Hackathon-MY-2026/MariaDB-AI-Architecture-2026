import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layers, Play, Sparkles, AlertTriangle, ArrowRight, Wrench, Trash2, ChevronDown } from 'lucide-react';
import {
  jsonFetch, MetadataResponse, MigrationPreviewResponse, AiMigrationResponse,
  SqlExecuteResponse, TableMetaResponse, RelatedTablesResponse,
} from '../lib/api';
import StatusBanner from '../components/StatusBanner';
import { SkeletonSelect } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';

interface DiffState {
  title: string;
  tableName: string;
  before: string[];
  after: string[];
  added: string[];
  removed: string[];
}

export default function Migrations() {
  const [tables, setTables] = useState<string[]>([]);
  const [migrationSql, setMigrationSql] = useState(
    "ALTER TABLE `students` ADD COLUMN `email` VARCHAR(255) NULL;\nCREATE UNIQUE INDEX `ux_students_email` ON `students` (`email`);\n",
  );
  const [warnings, setWarnings] = useState<string[]>([]);
  const [columnDiff, setColumnDiff] = useState<DiffState | null>(null);

  const [addTable, setAddTable] = useState('');
  const [addColName, setAddColName] = useState('');
  const [addColType, setAddColType] = useState('VARCHAR(255)');
  const [addColNullable, setAddColNullable] = useState(true);
  const [addColDefault, setAddColDefault] = useState('');

  const [renColTable, setRenColTable] = useState('');
  const [renColOld, setRenColOld] = useState('');
  const [renColNew, setRenColNew] = useState('');
  const [renColType, setRenColType] = useState('VARCHAR(255)');
  const [renColNullable, setRenColNullable] = useState(true);

  const [dropTable, setDropTable] = useState('');
  const [dropColumn, setDropColumn] = useState('');
  const [renameOld, setRenameOld] = useState('');
  const [renameNew, setRenameNew] = useState('');
  const [idxTable, setIdxTable] = useState('');
  const [idxName, setIdxName] = useState('');
  const [idxUnique, setIdxUnique] = useState(false);
  const [idxColumns, setIdxColumns] = useState<string[]>([]);
  const [idxTableMeta, setIdxTableMeta] = useState<TableMetaResponse | null>(null);
  const [idxTableMetaLoading, setIdxTableMetaLoading] = useState(false);
  const [dropIdxTable, setDropIdxTable] = useState('');
  const [dropIdxName, setDropIdxName] = useState('');
  const [dropIdxTableMeta, setDropIdxTableMeta] = useState<TableMetaResponse | null>(null);
  const [dropIdxTableMetaLoading, setDropIdxTableMetaLoading] = useState(false);

  const [dropTblMain, setDropTblMain] = useState('');
  const [dropTblRelated, setDropTblRelated] = useState<string[]>([]);
  const [dropTblChecked, setDropTblChecked] = useState<Set<string>>(new Set());
  const [dropTblLoadingRelated, setDropTblLoadingRelated] = useState(false);

  const [aiRequest, setAiRequest] = useState('Add an email column to students and make it unique.');

  const [activeTab, setActiveTab] = useState<'ai' | 'manual'>('ai');

  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await jsonFetch<MetadataResponse>('/metadata', { method: 'GET' });
        setTables(data.tables ?? []);
      } catch (err) {
        setErrorText(err instanceof Error ? err.message : String(err));
      } finally {
        setInitialLoading(false);
      }
    })();
  }, []);

  async function loadPreview(path: string, body: unknown) {
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const out = await jsonFetch<MigrationPreviewResponse>(path, { method: 'POST', body: JSON.stringify(body) });
      setMigrationSql(out.sql);
      setWarnings(out.warnings ?? []);
      setStatusText('Preview loaded. Review the diff below, then execute.');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function fetchMeta(table: string): Promise<TableMetaResponse | null> {
    try {
      return await jsonFetch<TableMetaResponse>(`/tables/${encodeURIComponent(table)}/meta`);
    } catch {
      return null;
    }
  }

  async function loadIdxMeta(table: string) {
    setIdxTableMeta(null); setIdxColumns([]); setIdxName('');
    if (!table) return;
    setIdxTableMetaLoading(true);
    setIdxTableMeta(await fetchMeta(table));
    setIdxTableMetaLoading(false);
  }

  async function loadDropIdxMeta(table: string) {
    setDropIdxTableMeta(null); setDropIdxName('');
    if (!table) return;
    setDropIdxTableMetaLoading(true);
    setDropIdxTableMeta(await fetchMeta(table));
    setDropIdxTableMetaLoading(false);
  }

  async function previewAddColumn() {
    if (!addTable || !addColName.trim() || !addColType.trim()) return;
    await loadPreview('/migrations/add-column/preview', {
      table: addTable,
      column_name: addColName.trim(),
      sql_type: addColType.trim(),
      is_nullable: addColNullable,
      default_value: addColDefault.trim() || null,
    });
    const meta = await fetchMeta(addTable);
    if (meta) {
      const cols = meta.columns.map(c => c.name);
      const newCol = addColName.trim();
      setColumnDiff({
        title: 'Add column',
        tableName: addTable,
        before: cols,
        after: [...cols, newCol],
        added: [newCol],
        removed: [],
      });
    }
  }

  async function previewRenameColumn() {
    if (!renColTable || !renColOld.trim() || !renColNew.trim() || !renColType.trim()) return;
    await loadPreview('/migrations/rename-column/preview', {
      table: renColTable,
      old_column: renColOld.trim(),
      new_column: renColNew.trim(),
      sql_type: renColType.trim(),
      is_nullable: renColNullable,
    });
    const meta = await fetchMeta(renColTable);
    if (meta) {
      const cols = meta.columns.map(c => c.name);
      const oldCol = renColOld.trim();
      const newCol = renColNew.trim();
      setColumnDiff({
        title: 'Rename column',
        tableName: renColTable,
        before: cols,
        after: cols.map(c => (c === oldCol ? newCol : c)),
        added: [newCol],
        removed: [oldCol],
      });
    }
  }

  async function previewDropColumn() {
    if (!dropTable || !dropColumn.trim()) return;
    await loadPreview('/migrations/drop-column/preview', { table: dropTable, column: dropColumn.trim() });
    const meta = await fetchMeta(dropTable);
    if (meta) {
      const cols = meta.columns.map(c => c.name);
      const dropped = dropColumn.trim();
      setColumnDiff({
        title: 'Drop column',
        tableName: dropTable,
        before: cols,
        after: cols.filter(c => c !== dropped),
        added: [],
        removed: [dropped],
      });
    }
  }

  async function previewRenameTable() {
    if (!renameOld.trim() || !renameNew.trim()) return;
    await loadPreview('/migrations/rename-table/preview', { old_table: renameOld.trim(), new_table: renameNew.trim() });
    setColumnDiff({
      title: 'Rename table',
      tableName: renameOld.trim(),
      before: [`table: ${renameOld.trim()}`],
      after: [`table: ${renameNew.trim()}`],
      added: [`table: ${renameNew.trim()}`],
      removed: [`table: ${renameOld.trim()}`],
    });
  }

  async function previewCreateIndex() {
    if (!idxTable || !idxName.trim() || !idxColumns.length) return;
    await loadPreview('/migrations/index/create/preview', {
      table: idxTable, index_name: idxName.trim(), columns: idxColumns, is_unique: idxUnique,
    });
    const meta = await fetchMeta(idxTable);
    if (meta) {
      const idxList = (meta.indexes ?? []).map(
        i => `${i.is_unique ? 'UNIQUE ' : ''}${i.index_name} (${i.columns.join(', ')})`,
      );
      const newIdx = `${idxUnique ? 'UNIQUE ' : ''}${idxName.trim()} (${idxColumns.join(', ')})`;
      setColumnDiff({
        title: 'Create index',
        tableName: idxTable,
        before: idxList.length ? idxList : ['(no indexes)'],
        after: [...idxList, newIdx],
        added: [newIdx],
        removed: [],
      });
    }
  }

  async function loadDropTblRelated(table: string) {
    setDropTblRelated([]);
    setDropTblChecked(new Set());
    if (!table) return;
    setDropTblLoadingRelated(true);
    try {
      const data = await jsonFetch<RelatedTablesResponse>(
        `/migrations/drop-table/related-tables?table=${encodeURIComponent(table)}`,
      );
      setDropTblRelated(data.tables ?? []);
    } catch { /* non-fatal */ } finally {
      setDropTblLoadingRelated(false);
    }
  }

  async function previewDropTable() {
    if (!dropTblMain) return;
    await loadPreview('/migrations/drop-table/preview', {
      table: dropTblMain,
      also_drop: [...dropTblChecked],
    });
    const allDropped = [dropTblMain, ...dropTblChecked];
    setColumnDiff({
      title: 'Drop table',
      tableName: allDropped.join(', '),
      before: allDropped.map(t => `table: ${t}`),
      after: [],
      added: [],
      removed: allDropped.map(t => `table: ${t}`),
    });
  }

  async function previewDropIndex() {
    if (!dropIdxTable || !dropIdxName.trim()) return;
    await loadPreview('/migrations/index/drop/preview', { table: dropIdxTable, index_name: dropIdxName.trim() });
    const meta = await fetchMeta(dropIdxTable);
    if (meta) {
      const idxList = (meta.indexes ?? []).map(
        i => `${i.is_unique ? 'UNIQUE ' : ''}${i.index_name} (${i.columns.join(', ')})`,
      );
      const target = dropIdxName.trim();
      const removed = idxList.filter(i => i.includes(target));
      setColumnDiff({
        title: 'Drop index',
        tableName: dropIdxTable,
        before: idxList.length ? idxList : ['(no indexes)'],
        after: idxList.filter(i => !i.includes(target)),
        added: [],
        removed,
      });
    }
  }

  async function executeMigration() {
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const parts = migrationSql.split(';').map(s => s.trim()).filter(Boolean);
      const res = await jsonFetch<SqlExecuteResponse>('/sql/execute', {
        method: 'POST', body: JSON.stringify({ statements: parts }),
      });
      // Auto-snapshot after every migration so schema history stays in sync.
      await jsonFetch('/schema/versions/save', {
        method: 'POST', body: JSON.stringify({ label: `after migration (${res.executed} stmt${res.executed !== 1 ? 's' : ''})` }),
      }).catch(() => {});
      setStatusText(`Executed ${res.executed} statements — snapshot saved to Schema History.`);
      setColumnDiff(null);
      // Refresh table list in case tables were added/removed.
      const meta = await jsonFetch<MetadataResponse>('/metadata', { method: 'GET' });
      setTables(meta.tables ?? []);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function aiGenerate() {
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const out = await jsonFetch<AiMigrationResponse>('/migrations/ai/generate', {
        method: 'POST', body: JSON.stringify({ request: aiRequest.trim() }),
      });
      const sql = (out.statements ?? []).map(s => s.trim().replace(/;?$/, ';')).join('\n');
      setMigrationSql(sql); setWarnings([]); setColumnDiff(null);
      setStatusText('AI migration loaded into panel. Review then execute.');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  if (!initialLoading && tables.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-white">Migration Assistant</h1>
          <p className="text-sm text-slate-400 mt-1">Build safe schema changes.</p>
        </header>
        <StatusBanner error={errorText} status={null} />
        <EmptyState
          icon={Layers}
          title="No tables to migrate"
          description="There are no tables in your database yet. Create a schema first, then use migrations to evolve it."
          action={{ label: 'Go to Schema Generator', to: '/schema' }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Migration Assistant</h1>
        <p className="text-sm text-slate-400 mt-1">
          Evolve your schema safely — describe a change in plain English or use the manual builders.
        </p>
      </header>

      <StatusBanner error={errorText} status={statusText} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* ── Left: SQL panel ─────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Layers className="w-4 h-4 text-primary-400" /> Migration SQL
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Use the AI or a builder on the right to populate this, or type directly.
          </p>
          {warnings.length ? (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
              <div className="flex items-center gap-1.5 font-medium"><AlertTriangle className="w-3.5 h-3.5" /> Warnings</div>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">
                {warnings.map(w => <li key={w}>{w}</li>)}
              </ul>
            </div>
          ) : null}
          <textarea
            className="mt-3 h-64 w-full resize-none rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-primary-500"
            value={migrationSql}
            onChange={(e) => { setMigrationSql(e.target.value); setWarnings([]); setColumnDiff(null); }}
          />
          <div className="mt-3 flex gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              disabled={isLoading || !migrationSql.trim()}
              onClick={() => void executeMigration()}
            >
              <Play className="w-4 h-4" /> Execute migration
            </button>
            <button
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800/40"
              onClick={() => { setMigrationSql(''); setWarnings([]); setColumnDiff(null); }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* ── Right: Tabbed panel ──────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setActiveTab('ai')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'ai'
                  ? 'text-white border-b-2 border-primary-500 bg-primary-500/5'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              AI Assistant
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'manual'
                  ? 'text-white border-b-2 border-slate-400 bg-slate-800/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Wrench className="w-4 h-4" />
              Manual Tools
            </button>
          </div>

          {/* AI Assistant tab */}
          {activeTab === 'ai' && (
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold text-white">Describe a migration in plain English</p>
                <p className="text-xs text-slate-400 mt-1">
                  AI generates the SQL — review it in the panel on the left, then execute when ready.
                </p>
              </div>

              {/* Example prompts */}
              <div className="flex flex-wrap gap-2">
                {[
                  'Add an email column to students and make it unique',
                  'Add a created_at timestamp to orders',
                  'Rename column username to full_name in users',
                  'Add an index on orders.status',
                ].map(ex => (
                  <button
                    key={ex}
                    className="text-[11px] px-2 py-1 rounded-md border border-slate-700 text-slate-400 hover:border-primary-500/50 hover:text-slate-200 transition-colors"
                    onClick={() => setAiRequest(ex)}
                  >
                    {ex}
                  </button>
                ))}
              </div>

              <textarea
                className="h-32 w-full resize-none rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500 placeholder-slate-500"
                placeholder="e.g. Add a phone_number column to the customers table, nullable VARCHAR(20)…"
                value={aiRequest}
                onChange={(e) => setAiRequest(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void aiGenerate(); } }}
              />

              <button
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary-500 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
                disabled={isLoading || !aiRequest.trim()}
                onClick={() => void aiGenerate()}
              >
                <Sparkles className="w-4 h-4" />
                {isLoading ? 'Generating…' : 'Generate migration SQL'}
              </button>

              <p className="text-[11px] text-slate-500 text-center">
                The generated SQL will appear in the Migration SQL panel on the left.
              </p>
            </div>
          )}

          {/* Manual Tools tab */}
          {activeTab === 'manual' && (
            <div className="p-5 space-y-4 max-h-[560px] overflow-y-auto">
              <Builder title="Add column">
                <SelectField label="Table" value={addTable} onChange={setAddTable} options={tables} loading={initialLoading} />
                <TextField label="Column name" value={addColName} onChange={setAddColName} placeholder="new_column" />
                <SqlTypeField label="SQL type" value={addColType} onChange={setAddColType} />
                <TextField label="Default value (optional)" value={addColDefault} onChange={setAddColDefault} placeholder="e.g. 0 or 'active'" />
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={addColNullable} onChange={(e) => setAddColNullable(e.target.checked)} /> Nullable
                </label>
                <BuilderButton disabled={isLoading || !addTable || !addColName.trim() || !addColType.trim()} onClick={previewAddColumn}>
                  Preview add column
                </BuilderButton>
              </Builder>

              <Builder title="Rename column">
                <SelectField label="Table" value={renColTable} onChange={(v) => { setRenColTable(v); setRenColOld(''); }} options={tables} loading={initialLoading} />
                <TextField label="Current column name" value={renColOld} onChange={setRenColOld} placeholder="old_name" />
                <TextField label="New column name" value={renColNew} onChange={setRenColNew} placeholder="new_name" />
                <SqlTypeField label="SQL type (required by MariaDB CHANGE)" value={renColType} onChange={setRenColType} />
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={renColNullable} onChange={(e) => setRenColNullable(e.target.checked)} /> Nullable
                </label>
                <BuilderButton disabled={isLoading || !renColTable || !renColOld.trim() || !renColNew.trim() || !renColType.trim()} onClick={previewRenameColumn}>
                  Preview rename column
                </BuilderButton>
              </Builder>

              <Builder title="Drop column">
                <SelectField label="Table" value={dropTable} onChange={(v) => { setDropTable(v); setDropColumn(''); }} options={tables} loading={initialLoading} />
                <TextField label="Column" value={dropColumn} onChange={setDropColumn} placeholder="column_name" />
                <BuilderButton disabled={isLoading || !dropTable || !dropColumn.trim()} onClick={previewDropColumn}>
                  Preview drop column
                </BuilderButton>
              </Builder>

              <Builder title="Rename table">
                <TextField label="Old name" value={renameOld} onChange={setRenameOld} placeholder="old_table" />
                <TextField label="New name" value={renameNew} onChange={setRenameNew} placeholder="new_table" />
                <BuilderButton disabled={isLoading || !renameOld.trim() || !renameNew.trim()} onClick={previewRenameTable}>
                  Preview rename table
                </BuilderButton>
              </Builder>

              <Builder title="Create index">
                <SelectField
                  label="Table"
                  value={idxTable}
                  onChange={(v) => { setIdxTable(v); void loadIdxMeta(v); }}
                  options={tables}
                  loading={initialLoading}
                />

                {/* Existing indexes on this table */}
                {idxTableMetaLoading && (
                  <div className="text-[11px] text-slate-500 animate-pulse">Loading indexes…</div>
                )}
                {idxTableMeta && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      Existing indexes
                    </div>
                    {(idxTableMeta.indexes ?? []).length === 0 ? (
                      <div className="text-[11px] text-slate-500 italic">No indexes yet on this table</div>
                    ) : (
                      <div className="rounded-lg border border-slate-700/50 overflow-hidden">
                        {(idxTableMeta.indexes ?? []).map(ix => (
                          <div key={ix.index_name} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] border-b border-slate-700/30 last:border-0 bg-black/20">
                            <span className="font-mono text-slate-300 flex-shrink-0">{ix.index_name}</span>
                            <span className="text-slate-500 truncate">({ix.columns.join(', ')})</span>
                            {ix.is_unique && (
                              <span className="ml-auto flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20">UNIQUE</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <TextField label="Index name" value={idxName} onChange={setIdxName} placeholder="idx_name" />
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={idxUnique} onChange={(e) => setIdxUnique(e.target.checked)} /> Unique
                </label>

                {/* Column chip selector */}
                <div className="text-xs text-slate-300">
                  <span>Columns</span>
                  <span className="ml-1 text-[10px] text-slate-500">— click to add/remove, order matters</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 min-h-[28px]">
                    {idxTableMetaLoading && <span className="text-[11px] text-slate-500">Loading…</span>}
                    {!idxTableMeta && !idxTableMetaLoading && (
                      <span className="text-[11px] text-slate-500 italic">Select a table first</span>
                    )}
                    {(idxTableMeta?.columns ?? []).map(c => {
                      const pos = idxColumns.indexOf(c.name);
                      const selected = pos !== -1;
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => setIdxColumns(prev =>
                            selected ? prev.filter(x => x !== c.name) : [...prev, c.name]
                          )}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] border transition-colors ${
                            selected
                              ? 'bg-primary-500/20 border-primary-500/40 text-primary-300'
                              : 'bg-slate-800/60 border-slate-700/40 text-slate-400 hover:border-primary-500/30 hover:text-slate-200'
                          }`}
                        >
                          {selected && <span className="text-[9px] text-primary-400 font-bold">{pos + 1}</span>}
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                  {idxColumns.length > 0 && (
                    <div className="mt-1 text-[10px] text-slate-500">
                      Order: <span className="text-slate-300 font-mono">{idxColumns.join(', ')}</span>
                    </div>
                  )}
                </div>

                <BuilderButton disabled={isLoading || !idxTable || !idxName.trim() || !idxColumns.length} onClick={previewCreateIndex}>
                  Preview create index
                </BuilderButton>
              </Builder>

              <Builder title="Drop index">
                <SelectField
                  label="Table"
                  value={dropIdxTable}
                  onChange={(v) => { setDropIdxTable(v); void loadDropIdxMeta(v); }}
                  options={tables}
                  loading={initialLoading}
                />

                {/* Clickable list of existing indexes */}
                {dropIdxTableMetaLoading && (
                  <div className="text-[11px] text-slate-500 animate-pulse">Loading indexes…</div>
                )}
                {dropIdxTableMeta && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      Select index to drop
                    </div>
                    {(dropIdxTableMeta.indexes ?? []).filter(ix => ix.index_name !== 'PRIMARY').length === 0 ? (
                      <div className="text-[11px] text-slate-500 italic">No droppable indexes on this table</div>
                    ) : (
                      <div className="rounded-lg border border-slate-700/50 overflow-hidden">
                        {(dropIdxTableMeta.indexes ?? [])
                          .filter(ix => ix.index_name !== 'PRIMARY')
                          .map(ix => (
                            <button
                              key={ix.index_name}
                              type="button"
                              onClick={() => setDropIdxName(ix.index_name)}
                              className={`w-full text-left flex items-center gap-2 px-2.5 py-2 text-[11px] border-b border-slate-700/30 last:border-0 transition-colors ${
                                dropIdxName === ix.index_name
                                  ? 'bg-red-500/10 border-l-2 border-l-red-500/60'
                                  : 'bg-black/20 hover:bg-slate-800/60'
                              }`}
                            >
                              <span className="font-mono text-slate-200 flex-shrink-0">{ix.index_name}</span>
                              <span className="text-slate-500 truncate">({ix.columns.join(', ')})</span>
                              {ix.is_unique && (
                                <span className="ml-auto flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20">UNIQUE</span>
                              )}
                              {dropIdxName === ix.index_name && (
                                <span className="flex-shrink-0 text-[9px] text-red-400 font-medium">selected</span>
                              )}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
                {!dropIdxTableMeta && !dropIdxTableMetaLoading && !dropIdxTable && (
                  <div className="text-[11px] text-slate-500 italic">Select a table to see its indexes</div>
                )}

                <BuilderButton disabled={isLoading || !dropIdxTable || !dropIdxName.trim()} onClick={previewDropIndex}>
                  Preview drop index
                </BuilderButton>
              </Builder>

              <Builder title="Drop table">
                <SelectField
                  label="Table to drop"
                  value={dropTblMain}
                  onChange={(v) => { setDropTblMain(v); void loadDropTblRelated(v); }}
                  options={tables}
                  loading={initialLoading}
                />
                {dropTblMain && (
                  <div className="mt-1">
                    <div className="text-xs text-slate-400 mb-1">
                      {dropTblLoadingRelated
                        ? 'Loading related tables…'
                        : dropTblRelated.length > 0
                          ? 'Also drop related tables (have FK → this table):'
                          : 'No tables reference this table via FK.'}
                    </div>
                    {dropTblRelated.map(t => (
                      <label key={t} className="flex items-center gap-2 text-xs text-slate-300 py-0.5">
                        <input
                          type="checkbox"
                          checked={dropTblChecked.has(t)}
                          onChange={(e) => {
                            setDropTblChecked(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(t); else next.delete(t);
                              return next;
                            });
                          }}
                        />
                        <code className="text-primary-300">{t}</code>
                        <span className="text-slate-500">→ {dropTblMain}</span>
                      </label>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-400">
                  <Trash2 className="w-3 h-3" /> Destructive — data cannot be recovered.
                </div>
                <BuilderButton disabled={isLoading || !dropTblMain} onClick={previewDropTable}>
                  Preview drop table
                </BuilderButton>
              </Builder>
            </div>
          )}
        </div>
      </div>

      {/* Before / After diff */}
      {columnDiff && <MigrationDiffView diff={columnDiff} />}
    </div>
  );
}

/* ─── Diff view ──────────────────────────────────────────────────────────── */
function MigrationDiffView({ diff }: { diff: DiffState }) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-semibold text-white">{diff.title}</span>
        <ArrowRight className="w-4 h-4 text-slate-500" />
        <code className="text-xs text-primary-300 bg-primary-500/10 px-2 py-0.5 rounded">{diff.tableName}</code>
        <span className="ml-auto text-xs text-slate-500">Preview only — not yet executed</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Before */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
            Before
          </div>
          <div className="space-y-1">
            {diff.before.map(item => (
              <div
                key={item}
                className={`rounded px-2.5 py-1.5 text-xs font-mono ${
                  diff.removed.includes(item)
                    ? 'bg-red-500/15 text-red-300 border border-red-500/25 line-through opacity-70'
                    : 'bg-slate-800/60 text-slate-300 border border-slate-700/40'
                }`}
              >
                {item}
              </div>
            ))}
            {diff.before.length === 0 && (
              <div className="text-xs text-slate-500 italic px-2">(empty)</div>
            )}
          </div>
        </div>

        {/* After */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-400 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            After
          </div>
          <div className="space-y-1">
            {diff.after.map(item => (
              <div
                key={item}
                className={`rounded px-2.5 py-1.5 text-xs font-mono ${
                  diff.added.includes(item)
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                    : 'bg-slate-800/60 text-slate-300 border border-slate-700/40'
                }`}
              >
                {diff.added.includes(item) ? '+ ' : '  '}{item}
              </div>
            ))}
            {diff.after.length === 0 && (
              <div className="text-xs text-slate-500 italic px-2">(empty after migration)</div>
            )}
          </div>
        </div>
      </div>

      {(diff.removed.length > 0 || diff.added.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          {diff.removed.length > 0 && (
            <span className="inline-flex items-center gap-1 text-red-300">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
              {diff.removed.length} removed
            </span>
          )}
          {diff.added.length > 0 && (
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              {diff.added.length} added
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */
function Builder({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-black/20 p-3 space-y-2">
      <div className="text-xs font-medium text-slate-200">{title}</div>
      {children}
    </div>
  );
}

function SelectField({ label, value, onChange, options, loading }: { label: string; value: string; onChange: (v: string) => void; options: string[]; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
        setSearch('');
      }
    }
    if (open) document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onScroll(e: Event) {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setSearch('');
    }
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [open]);

  function openDropdown() {
    if (containerRef.current) setAnchorRect(containerRef.current.getBoundingClientRect());
    setOpen(true);
    setSearch('');
  }

  function select(v: string) {
    onChange(v);
    setOpen(false);
    setSearch('');
  }

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={containerRef} className="block text-xs text-slate-300">
      <span>{label}</span>
      <div className="mt-1">
        {loading ? (
          <SkeletonSelect className="w-full" />
        ) : (
          <div className={`flex items-center rounded-lg border bg-slate-950/40 ${open ? 'border-primary-500' : 'border-slate-700'}`}>
            <input
              className="flex-1 bg-transparent px-2 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none cursor-pointer"
              value={open ? search : value}
              placeholder={open ? 'Search…' : 'Select…'}
              spellCheck={false}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => openDropdown()}
            />
            <button
              type="button"
              className="px-2 text-slate-400 hover:text-slate-200 transition-colors"
              onMouseDown={e => { e.preventDefault(); if (open) { setOpen(false); setSearch(''); } else openDropdown(); }}
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {open && anchorRect && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: anchorRect.bottom + 4, left: anchorRect.left, width: anchorRect.width, zIndex: 9999 }}
          className="max-h-60 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 shadow-2xl"
        >
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-mono text-slate-500 hover:bg-slate-800/60 border-b border-slate-800/60"
            onMouseDown={() => select('')}
          >
            Select…
          </button>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500 italic">No matches.</div>
          ) : (
            filtered.map(o => (
              <button
                key={o}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors border-b border-slate-800/60 last:border-0
                  ${value === o ? 'bg-primary-500/15 text-primary-300' : 'text-slate-200 hover:bg-slate-800/60'}`}
                onMouseDown={() => select(o)}
              >
                {o}
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-xs text-slate-300">
      {label}
      <input
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-2 text-sm text-slate-100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

const SQL_TYPE_GROUPS: { group: string; types: string[] }[] = [
  { group: 'String', types: ['VARCHAR(255)', 'VARCHAR(100)', 'VARCHAR(50)', 'VARCHAR(20)', 'CHAR(36)', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT'] },
  { group: 'Integer', types: ['INT', 'INT(11)', 'BIGINT', 'SMALLINT', 'TINYINT', 'TINYINT(1)'] },
  { group: 'Decimal', types: ['DECIMAL(10,2)', 'DECIMAL(15,4)', 'FLOAT', 'DOUBLE'] },
  { group: 'Date / Time', types: ['DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR'] },
  { group: 'Other', types: ['BOOLEAN', 'JSON', "ENUM('value1','value2')", 'BLOB'] },
];

const SQL_ALL_TYPES = SQL_TYPE_GROUPS.flatMap(g => g.types);

function SqlTypeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
        setSearch('');
      }
    }
    if (open) document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onScroll(e: Event) {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setSearch('');
    }
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [open]);

  function openDropdown() {
    if (containerRef.current) setAnchorRect(containerRef.current.getBoundingClientRect());
    setOpen(true);
    setSearch('');
  }

  const q = search.toLowerCase();
  const filteredGroups = SQL_TYPE_GROUPS.map(g => ({
    ...g,
    types: g.types.filter(t => t.toLowerCase().includes(q)),
  })).filter(g => g.types.length > 0);

  function select(t: string) {
    onChange(t);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={containerRef} className="block text-xs text-slate-300">
      <span>{label}</span>
      <div className="mt-1">
        {/* Input row */}
        <div className={`flex items-center rounded-lg border bg-slate-950/40 ${open ? 'border-primary-500' : 'border-slate-700'}`}>
          <input
            className="flex-1 bg-transparent px-2 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            value={open ? search : value}
            placeholder={open ? 'Search or type a custom type…' : 'e.g. VARCHAR(255)'}
            spellCheck={false}
            onChange={e => { setSearch(e.target.value); onChange(e.target.value); }}
            onFocus={() => openDropdown()}
          />
          <button
            type="button"
            className="px-2 text-slate-400 hover:text-slate-200 transition-colors"
            onMouseDown={e => { e.preventDefault(); if (open) { setOpen(false); setSearch(''); } else openDropdown(); }}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      <p className="mt-0.5 text-[10px] text-slate-500">Choose from the list or type any valid SQL type</p>

      {/* Dropdown rendered into document.body via portal to escape overflow clipping */}
      {open && anchorRect && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: anchorRect.bottom + 4, left: anchorRect.left, width: anchorRect.width, zIndex: 9999 }}
          className="max-h-60 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 shadow-2xl"
        >
          {filteredGroups.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500 italic">
              No matching type — your custom value will be used as-is.
            </div>
          ) : (
            filteredGroups.map(g => (
              <div key={g.group}>
                <div className="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {g.group}
                </div>
                {g.types.map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors border-b border-slate-800/60 last:border-0
                      ${value === t ? 'bg-primary-500/15 text-primary-300' : 'text-slate-200 hover:bg-slate-800/60'}`}
                    onMouseDown={() => select(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function BuilderButton({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void | Promise<void>; children: React.ReactNode }) {
  return (
    <button
      className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
      disabled={disabled}
      onClick={() => void onClick()}
    >
      {children}
    </button>
  );
}
