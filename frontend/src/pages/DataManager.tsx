import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Table2, RefreshCw, Plus, Pencil, Trash2, Upload, Download, Wand2, CheckCircle2, XCircle, DatabaseBackup, ChevronDown } from 'lucide-react';
import {
  jsonFetch, rawFetch, API_BASE_URL,
  MetadataResponse, TableMetaResponse, BrowseResponse, FkOption, MutationResponse, FkOptionsResponse,
  QueryExportResponse, WritePreviewResponse, WriteExecuteResponse, DatabaseExportResponse,
} from '../lib/api';
import StatusBanner from '../components/StatusBanner';
import { SkeletonSelect, SkeletonTableRows } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';

export default function DataManager() {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [meta, setMeta] = useState<TableMetaResponse | null>(null);
  const [browse, setBrowse] = useState<BrowseResponse | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [orderBy, setOrderBy] = useState('');
  const [orderDir, setOrderDir] = useState<'ASC' | 'DESC'>('DESC');
  const [filterColumn, setFilterColumn] = useState('');
  const [filterValue, setFilterValue] = useState('');

  const [insertValues, setInsertValues] = useState<Record<string, string>>({});
  const [updateValues, setUpdateValues] = useState<Record<string, string>>({});
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);


  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvDelimiter, setCsvDelimiter] = useState(',');
  const [csvHeader, setCsvHeader] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<string[][]>([]);
  const [csvTotalRows, setCsvTotalRows] = useState<number>(0);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  useEffect(() => { void refreshMetadata(); }, []);

  async function refreshMetadata() {
    setErrorText(null); setIsLoading(true);
    try {
      const data = await jsonFetch<MetadataResponse>('/metadata', { method: 'GET' });
      setTables(data.tables ?? []);
      if (!selectedTable && data.tables?.length) {
        setSelectedTable(data.tables[0]);
        await loadMeta(data.tables[0]);
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
      setInitialLoading(false);
    }
  }

  async function loadMeta(table: string) {
    if (!table) return;
    setErrorText(null); setIsLoading(true);
    try {
      const m = await jsonFetch<TableMetaResponse>(`/tables/${encodeURIComponent(table)}/meta`, { method: 'GET' });
      setMeta(m);
      const cols = m.columns.filter(c => !c.is_auto_increment).map(c => c.name);
      setInsertValues(Object.fromEntries(cols.map(c => [c, ''])));
      setUpdateValues(Object.fromEntries(cols.map(c => [c, ''])));
      setSelectedRow(null);
      setOrderBy(m.columns[0]?.name ?? '');
      setFilterColumn(''); setFilterValue('');
      setPage(1); setBrowse(null);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function loadBrowse() {
    if (!selectedTable) return;
    setErrorText(null); setIsLoading(true);
    try {
      const data = await jsonFetch<BrowseResponse>(`/tables/${encodeURIComponent(selectedTable)}/browse`, {
        method: 'POST',
        body: JSON.stringify({
          page, page_size: pageSize,
          order_by: orderBy || null, order_dir: orderDir,
          filter_column: filterColumn || null, filter_value: filterValue || null,
        }),
      });
      setBrowse(data);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function doInsert() {
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const values = normalizeForApi(insertValues, meta?.columns ?? []);
      const res = await jsonFetch<MutationResponse>(`/tables/${encodeURIComponent(selectedTable)}/insert`, {
        method: 'POST', body: JSON.stringify({ values }),
      });
      setStatusText(`Inserted (${res.affected_rows} row).`);
      await loadBrowse();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function doUpdate() {
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const pkCols = meta?.primary_key ?? [];
      if (!pkCols.length) throw new Error('No primary key detected for this table.');
      const pk: Record<string, unknown> = {};
      for (const c of pkCols) pk[c] = selectedRow?.[c];
      const values = normalizeForApi(updateValues, meta?.columns ?? []);
      const res = await jsonFetch<MutationResponse>(`/tables/${encodeURIComponent(selectedTable)}/update`, {
        method: 'POST', body: JSON.stringify({ pk, values }),
      });
      setStatusText(`Updated (${res.affected_rows} row).`);
      await loadBrowse();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function doDelete() {
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const pkCols = meta?.primary_key ?? [];
      if (!pkCols.length) throw new Error('No primary key detected for this table.');
      const pk: Record<string, unknown> = {};
      for (const c of pkCols) pk[c] = selectedRow?.[c];
      const res = await jsonFetch<MutationResponse>(`/tables/${encodeURIComponent(selectedTable)}/delete`, {
        method: 'POST', body: JSON.stringify({ pk }),
      });
      setStatusText(`Deleted (${res.affected_rows} row).`);
      setSelectedRow(null);
      await loadBrowse();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function analyzeCsv() {
    if (!csvFile) return;
    setErrorText(null); setStatusText(null);
    const text = await csvFile.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const firstLine = lines[0] ?? '';
    const header = firstLine.split(csvDelimiter).map(s => s.trim()).filter(Boolean);
    const dataLines = lines.slice(1);
    const preview = dataLines.slice(0, 3).map(l => l.split(csvDelimiter).map(s => s.trim()));
    setCsvHeader(header);
    setCsvPreviewRows(preview);
    setCsvTotalRows(dataLines.length);
    const tableCols = (meta?.columns ?? []).map(c => c.name);
    const mapping: Record<string, string> = {};
    for (const t of tableCols) if (header.includes(t)) mapping[t] = t;
    setCsvMapping(mapping);
    setStatusText('CSV analyzed. Review the preview, adjust the mapping, then import.');
  }

  async function importCsv() {
    if (!csvFile || !selectedTable) return;
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const mapping: Record<string, string> = {};
      for (const [k, v] of Object.entries(csvMapping)) if (v) mapping[k] = v;
      const form = new FormData();
      form.append('file', csvFile);
      form.append('delimiter', csvDelimiter);
      form.append('max_rows', String(50000));
      form.append('mapping_json', JSON.stringify(mapping));
      const res = await rawFetch(`/tables/${encodeURIComponent(selectedTable)}/import-csv-mapped`, {
        method: 'POST', body: form,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error((body && body.detail) || res.statusText);
      setStatusText(`Imported ${body.inserted_rows} rows.`);
      await loadBrowse();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function downloadCsv() {
    if (!selectedTable) return;
    setErrorText(null); setIsLoading(true);
    try {
      const data = await jsonFetch<QueryExportResponse>(
        `/tables/${encodeURIComponent(selectedTable)}/export-csv`,
        {
          method: 'POST',
          body: JSON.stringify({
            order_by: orderBy || null,
            order_dir: orderDir,
            filter_column: filterColumn || null,
            filter_value: filterValue || null,
          }),
        },
      );
      const bytes = Uint8Array.from(atob(data.data_base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: data.mime || 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = data.filename || `${selectedTable}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function exportDatabase() {
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

  const editableCols = (meta?.columns ?? []).filter(c => !c.is_auto_increment).slice(0, 12);

  if (!initialLoading && tables.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-white">Data Manager</h1>
          <p className="text-sm text-slate-400 mt-1">Browse, insert, update, delete rows on any table.</p>
        </header>
        <StatusBanner error={errorText} status={null} />
        <EmptyState
          icon={Table2}
          title="No tables yet"
          description="Your database has no tables. Generate a schema first, then come back to manage your data."
          action={{ label: 'Go to Schema Generator', to: '/schema' }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Data Manager</h1>
          <p className="text-sm text-slate-400 mt-1">
            Browse, insert, update, delete rows on any table. Import CSVs with column mapping.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-xl border border-primary-500/30 bg-primary-500/10 px-4 py-2 text-sm font-medium text-primary-300 hover:bg-primary-500/20 disabled:opacity-50 transition-colors flex-shrink-0"
          onClick={() => void exportDatabase()}
          disabled={isLoading || tables.length === 0}
          title="Export all tables (DDL + data) as a .sql file"
        >
          <DatabaseBackup className="w-4 h-4" />
          Export Database
        </button>
      </header>

      <StatusBanner error={errorText} status={statusText} />

      {/* ── Natural Language Write ──────────────────────────────────── */}
      <NlWritePanel onExecuted={() => void loadBrowse()} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Table2 className="w-4 h-4 text-primary-400" /> Table
            </div>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800/40 disabled:opacity-50"
              onClick={() => void refreshMetadata()}
              disabled={isLoading}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
          {initialLoading ? (
            <SkeletonSelect className="mt-3 w-full" />
          ) : (
            <PortalSelect
              className="mt-3"
              value={selectedTable}
              onChange={(v) => { setSelectedTable(v); void loadMeta(v); }}
              options={tables.map(t => ({ value: t }))}
            />
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="text-sm font-medium text-white">Browse filters</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <label className="text-slate-300">
              Page
              <input className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-2 text-sm text-slate-100"
                type="number" value={page} min={1} onChange={(e) => setPage(Number(e.target.value) || 1)} />
            </label>
            <label className="text-slate-300">
              Page size
              <input className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-2 text-sm text-slate-100"
                type="number" value={pageSize} min={10} max={500} onChange={(e) => setPageSize(Number(e.target.value) || 50)} />
            </label>
            <div className="text-slate-300">
              Sort by
              <PortalSelect
                className="mt-1"
                value={orderBy}
                onChange={setOrderBy}
                options={(meta?.columns ?? []).map(c => ({ value: c.name }))}
              />
            </div>
            <div className="text-slate-300">
              Direction
              <PortalSelect
                className="mt-1"
                value={orderDir}
                onChange={(v) => setOrderDir(v as 'ASC' | 'DESC')}
                options={[{ value: 'DESC' }, { value: 'ASC' }]}
              />
            </div>
            <div className="text-slate-300">
              Filter column
              <PortalSelect
                className="mt-1"
                value={filterColumn}
                onChange={setFilterColumn}
                placeholder="(none)"
                options={[{ value: '', label: '(none)' }, ...(meta?.columns ?? []).map(c => ({ value: c.name }))]}
              />
            </div>
            <label className="text-slate-300">
              Contains
              <input className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-2 text-sm text-slate-100"
                value={filterValue} onChange={(e) => setFilterValue(e.target.value)} />
            </label>
          </div>
          <button
            className="mt-3 w-full rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            onClick={() => void loadBrowse()}
            disabled={isLoading || !selectedTable}
          >
            Load page
          </button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-white">Rows</div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Total: {browse?.total_rows ?? '—'}</span>
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800/40 disabled:opacity-50"
                onClick={() => void downloadCsv()}
                disabled={isLoading || !selectedTable}
                title="Download current table as CSV (up to 100k rows, respects active filter)"
              >
                <Download className="w-3.5 h-3.5" /> Download CSV
              </button>
            </div>
          </div>
          <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-slate-800 bg-black/20">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-900">
                <tr>
                  {(browse?.columns ?? []).map(c => (
                    <th key={c} className="border-b border-slate-800 px-2 py-2 text-left text-slate-200">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {initialLoading && <SkeletonTableRows cols={(browse?.columns ?? meta?.columns ?? [{ name: '' }, { name: '' }, { name: '' }]).length} rows={6} />}
                {(browse?.rows ?? []).map((r, i) => (
                  <tr
                    key={i}
                    className="cursor-pointer odd:bg-white/5 hover:bg-primary-900/20"
                    onClick={() => {
                      const rowObj: Record<string, unknown> = {};
                      (browse?.columns ?? []).forEach((c, idx) => { rowObj[c] = r[idx]; });
                      setSelectedRow(rowObj);
                      const next: Record<string, string> = {};
                      (meta?.columns ?? []).filter(c => !c.is_auto_increment).forEach(c => {
                        const v = rowObj[c.name];
                        const raw = v === null || v === undefined ? '' : String(v);
                        next[c.name] = toFormValue(getInputType(c.sql_type), raw);
                      });
                      setUpdateValues(next);
                    }}
                  >
                    {r.map((cell, j) => (
                      <td key={j} className="border-b border-slate-900 px-2 py-2 text-slate-200">
                        {cell === null || cell === undefined ? '' : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Selected row: {selectedRow ? (
              <span className="text-slate-200">
                {JSON.stringify(Object.fromEntries((meta?.primary_key ?? []).map(k => [k, selectedRow[k]])))}
              </span>
            ) : '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-2">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Plus className="w-4 h-4 text-emerald-400" /> Insert row
          </div>
          <FieldGrid
            columns={editableCols}
            values={insertValues}
            setValues={setInsertValues}
            meta={meta}
            mode="ins"
            disabled={!selectedTable}
          />
          <button
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={isLoading || !selectedTable}
            onClick={() => void doInsert()}
          >
            <Plus className="w-4 h-4" /> Insert row
          </button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-2">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Pencil className="w-4 h-4 text-amber-400" /> Update / Delete
          </div>
          <p className="mt-1 text-xs text-slate-400">Click a row above to select it (uses table's primary key).</p>
          <FieldGrid
            columns={editableCols}
            values={updateValues}
            setValues={setUpdateValues}
            meta={meta}
            mode="upd"
            disabled={!selectedRow}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
              disabled={isLoading || !selectedTable || !selectedRow || (meta?.primary_key?.length ?? 0) < 1}
              onClick={() => void doUpdate()}
            >
              <Pencil className="w-4 h-4" /> Update selected
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              disabled={isLoading || !selectedTable || !selectedRow || (meta?.primary_key?.length ?? 0) < 1}
              onClick={() => void doDelete()}
            >
              <Trash2 className="w-4 h-4" /> Delete selected
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-2">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Upload className="w-4 h-4 text-primary-400" /> CSV Import (column mapping)
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <label className="text-xs text-slate-300">
              File
              <input className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-2 text-sm text-slate-100"
                type="file" accept=".csv,text/csv" onChange={(e) => {
                  setCsvFile(e.target.files?.[0] ?? null);
                  setCsvHeader([]); setCsvPreviewRows([]); setCsvTotalRows(0); setCsvMapping({});
                }} />
            </label>
            <label className="text-xs text-slate-300">
              Delimiter
              <input className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-2 text-sm text-slate-100"
                value={csvDelimiter} onChange={(e) => setCsvDelimiter(e.target.value || ',')} />
            </label>
            <div className="flex items-end">
              <button
                className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                disabled={!csvFile || !meta}
                onClick={() => void analyzeCsv()}
              >
                Analyze CSV
              </button>
            </div>
          </div>

          {csvHeader.length ? (
            <div className="mt-4 space-y-4">
              {/* Data preview */}
              <div>
                <div className="text-xs font-medium text-slate-300 mb-1">
                  CSV preview — {csvHeader.length} columns, {csvTotalRows} data rows
                </div>
                <div className="overflow-auto rounded-xl border border-slate-800 bg-black/20">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-slate-900">
                      <tr>
                        {csvHeader.map(h => (
                          <th key={h} className="border-b border-slate-800 px-2 py-1.5 text-left text-slate-300 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreviewRows.map((row, i) => (
                        <tr key={i} className="odd:bg-white/5">
                          {csvHeader.map((_, j) => (
                            <td key={j} className="border-b border-slate-900 px-2 py-1.5 text-slate-400 whitespace-nowrap max-w-[180px] truncate">
                              {row[j] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvTotalRows > 3 && (
                  <p className="mt-1 text-[11px] text-slate-500">Showing 3 of {csvTotalRows} rows.</p>
                )}
              </div>

              {/* Column mapping */}
              <div>
                <div className="text-xs font-medium text-slate-300 mb-2">
                  Column mapping — table column ← CSV column
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  {editableCols.map(c => (
                    <div key={c.name} className="text-xs text-slate-300">
                      <span className={csvMapping[c.name] ? 'text-emerald-400' : 'text-slate-400'}>{c.name}</span>
                      {' '}←
                      <PortalSelect
                        className="mt-1"
                        value={csvMapping[c.name] ?? ''}
                        onChange={(v) => setCsvMapping(m => ({ ...m, [c.name]: v }))}
                        placeholder="(skip)"
                        options={[{ value: '', label: '(skip)' }, ...csvHeader.map(h => ({ value: h }))]}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary + import */}
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-400">
                  {Object.values(csvMapping).filter(Boolean).length} of {editableCols.length} columns mapped
                  {csvTotalRows > 0 && ` · ${csvTotalRows.toLocaleString()} rows to import`}
                </span>
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  disabled={isLoading || !csvFile || !selectedTable || Object.values(csvMapping).filter(Boolean).length === 0}
                  onClick={() => void importCsv()}
                >
                  <Upload className="w-4 h-4" /> Import {csvTotalRows > 0 ? `${csvTotalRows.toLocaleString()} rows` : ''}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-3 text-[11px] text-slate-500">
            API: <code>{API_BASE_URL}</code>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FieldGridProps {
  columns: { name: string; sql_type: string; is_nullable: boolean; is_auto_increment: boolean }[];
  values: Record<string, string>;
  setValues: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  meta: TableMetaResponse | null;
  mode: 'ins' | 'upd';
  disabled?: boolean;
}

/* ── SQL type → HTML input type ─────────────────────────────────────────── */
function getInputType(sqlType: string): 'date' | 'datetime-local' | 'time' | 'number' | 'text' {
  const t = sqlType.toUpperCase().split('(')[0].trim();
  if (t === 'DATE') return 'date';
  if (t === 'DATETIME' || t === 'TIMESTAMP') return 'datetime-local';
  if (t === 'TIME') return 'time';
  if (['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'NUMERIC'].includes(t)) return 'number';
  return 'text';
}

/* DB value → form input value (e.g. '2026-04-29 10:30:00' → '2026-04-29T10:30') */
function toFormValue(inputType: string, dbValue: string): string {
  if (!dbValue || inputType !== 'datetime-local') return dbValue;
  return dbValue.replace(' ', 'T').slice(0, 16);
}

/* form input value → DB value (e.g. '2026-04-29T10:30' → '2026-04-29 10:30:00') */
function toDbValue(inputType: string, formValue: string): string {
  if (!formValue || inputType !== 'datetime-local') return formValue;
  return formValue.replace('T', ' ') + (formValue.length === 16 ? ':00' : '');
}

/* Build the values dict for the API, skipping blanks and normalising datetimes */
function normalizeForApi(
  values: Record<string, string>,
  columns: { name: string; sql_type: string }[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!v.trim()) continue;
    const col = columns.find(c => c.name === k);
    result[k] = col ? toDbValue(getInputType(col.sql_type), v) : v;
  }
  return result;
}

/* ── Natural Language Write Panel ───────────────────────────────────────── */
function NlWritePanel({ onExecuted }: { onExecuted: () => void }) {
  const [open, setOpen]             = useState(false);
  const [request, setRequest]       = useState('');
  const [isLoading, setIsLoading]   = useState(false);
  const [errorText, setErrorText]   = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [preview, setPreview]       = useState<WritePreviewResponse | null>(null);

  async function handlePreview() {
    if (!request.trim()) return;
    setErrorText(null); setStatusText(null); setPreview(null); setIsLoading(true);
    try {
      const data = await jsonFetch<WritePreviewResponse>('/query/write/preview', {
        method: 'POST', body: JSON.stringify({ request }),
      });
      setPreview(data);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function handleExecute() {
    if (!preview) return;
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const res = await jsonFetch<WriteExecuteResponse>('/query/write/execute', {
        method: 'POST', body: JSON.stringify({ write_sql: preview.write_sql, params: preview.params }),
      });
      setStatusText(`Done — ${res.affected_rows} row${res.affected_rows !== 1 ? 's' : ''} affected.`);
      setPreview(null);
      setRequest('');
      onExecuted();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  function handleCancel() {
    setPreview(null);
    setErrorText(null);
    setStatusText(null);
  }

  const opColor: Record<string, string> = {
    insert: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    update: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    delete: 'bg-red-500/15 text-red-300 border-red-500/30',
  };

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/40 overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800/40 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <Wand2 className="w-4 h-4 text-primary-400" />
        Smart Write
        <span className="text-xs font-normal text-slate-400">— describe a change in plain English</span>
        <span className="ml-auto text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-800 px-5 py-4 space-y-4">
          <p className="text-xs text-slate-400">
            Describe what you want to change — AI generates the SQL, you preview affected rows, then confirm.
          </p>

          {/* Examples */}
          <div className="flex flex-wrap gap-2">
            {[
              'Delete all orders placed before 2024',
              'Set status to inactive for users with 0 logins',
              'Update price to 99.99 for all electronics products',
            ].map(ex => (
              <button
                key={ex}
                className="text-[11px] px-2 py-1 rounded-md border border-slate-700 text-slate-400 hover:border-primary-500/50 hover:text-slate-200 transition-colors"
                onClick={() => setRequest(ex)}
              >
                {ex}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <textarea
              className="flex-1 h-20 resize-none rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500 placeholder-slate-500"
              placeholder="e.g. Delete all students enrolled before 2022…"
              value={request}
              onChange={e => setRequest(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handlePreview(); } }}
            />
            <button
              className="self-end inline-flex items-center gap-1.5 rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
              disabled={isLoading || !request.trim()}
              onClick={() => void handlePreview()}
            >
              <Wand2 className="w-4 h-4" />
              {isLoading ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {errorText && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">{errorText}</div>
          )}
          {statusText && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {statusText}
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              {/* Operation badge + title */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${opColor[preview.operation] ?? 'bg-slate-700/40 text-slate-300 border-slate-600/40'}`}>
                  {preview.operation}
                </span>
                <span className="text-sm font-medium text-slate-200">{preview.title}</span>
              </div>

              {/* Generated SQL */}
              <div>
                <div className="text-[11px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">Generated SQL</div>
                <pre className="rounded-lg border border-slate-700 bg-black/40 px-3 py-2 text-xs text-slate-200 overflow-x-auto font-mono">
                  {preview.write_sql}
                </pre>
              </div>

              {/* Affected rows preview */}
              <div>
                <div className="text-[11px] font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                  Affected rows preview
                  <span className="ml-2 text-slate-500 font-normal normal-case">({preview.preview_rows.length} row{preview.preview_rows.length !== 1 ? 's' : ''})</span>
                </div>
                {preview.preview_rows.length === 0 ? (
                  <div className={`rounded-lg border px-4 py-3 text-xs text-center italic ${
                    preview.operation === 'update'
                      ? 'border-amber-500/30 bg-amber-950/20 text-amber-300'
                      : 'border-dashed border-slate-700 text-slate-500'
                  }`}>
                    {preview.operation === 'update'
                      ? 'Preview returned 0 rows — the WHERE condition may not match current values. You can still execute; it will affect 0 rows safely.'
                      : 'No rows matched — nothing will be changed.'}
                  </div>
                ) : (
                  <div className="max-h-52 overflow-auto rounded-lg border border-slate-700 bg-black/20">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-slate-900">
                        <tr>
                          {preview.preview_columns.map(c => (
                            <th key={c} className="border-b border-slate-800 px-3 py-1.5 text-left text-slate-300">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.preview_rows.map((row, i) => (
                          <tr key={i} className="odd:bg-white/5">
                            {(row as unknown[]).map((cell, j) => (
                              <td key={j} className="border-b border-slate-900 px-3 py-1.5 text-slate-200 whitespace-nowrap">
                                {cell === null ? <span className="text-slate-500 italic">null</span> : String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Confirm / Cancel */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
                  disabled={isLoading || (preview.preview_rows.length === 0 && preview.operation !== 'update')}
                  onClick={() => void handleExecute()}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isLoading ? 'Executing…' : `Confirm & Execute`}
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                  onClick={handleCancel}
                >
                  <XCircle className="w-4 h-4" /> Cancel
                </button>
                <span className="text-xs text-slate-500">This action cannot be undone.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── FK combobox ─────────────────────────────────────────────────────────────
   Self-contained: auto-loads options on mount, shows id — label, filters live. */
function FkSelect({
  value, onChange, fk, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  fk: { referenced_table_name: string; referenced_column_name: string; referenced_label_column?: string | null };
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<FkOption[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  async function fetchOpts(q: string) {
    setBusy(true);
    try {
      const data = await jsonFetch<FkOptionsResponse>('/fk-options', {
        method: 'POST',
        body: JSON.stringify({
          table: fk.referenced_table_name,
          id_column: fk.referenced_column_name,
          label_column: fk.referenced_label_column ?? null,
          search: q,
          limit: 50,
        }),
      });
      setOptions(data.options ?? []);
    } catch { /* silent */ } finally { setBusy(false); }
  }

  useEffect(() => { void fetchOpts(''); }, [fk.referenced_table_name]);

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
    if (disabled) return;
    if (containerRef.current) setAnchorRect(containerRef.current.getBoundingClientRect());
    setOpen(true);
    setSearch('');
  }

  const selectedOpt = options.find(o => String(o.id) === value);
  const displayValue = value
    ? (selectedOpt?.label ? `${value} — ${String(selectedOpt.label)}` : value)
    : '';

  return (
    <div ref={containerRef} className="mt-1">
      <div className={`flex items-center rounded-lg border bg-slate-950/40 transition-colors ${open ? 'border-primary-500' : 'border-slate-700'} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <input
          className="flex-1 min-w-0 bg-transparent px-2 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          placeholder={`Search ${fk.referenced_table_name}…`}
          value={open ? search : displayValue}
          onChange={e => { setSearch(e.target.value); void fetchOpts(e.target.value); }}
          onFocus={() => openDropdown()}
          disabled={disabled}
        />
        <button
          type="button"
          className="flex-shrink-0 px-2 text-slate-400 hover:text-slate-200 transition-colors"
          onMouseDown={e => { e.preventDefault(); if (open) { setOpen(false); setSearch(''); } else openDropdown(); }}
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && anchorRect && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: anchorRect.bottom + 4, left: anchorRect.left, width: anchorRect.width, zIndex: 9999 }}
          className="max-h-44 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 shadow-2xl"
        >
          {busy && <div className="px-3 py-2 text-xs text-slate-500">Loading…</div>}
          {!busy && options.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">No results found</div>
          )}
          {options.map((o, idx) => (
            <button
              key={idx}
              type="button"
              className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs transition-colors border-b border-slate-800 last:border-0
                ${String(o.id) === value ? 'bg-primary-500/15 text-primary-300' : 'text-slate-200 hover:bg-primary-500/15'}`}
              onMouseDown={() => { onChange(String(o.id ?? '')); setOpen(false); setSearch(''); }}
            >
              <span className="font-mono text-slate-400 flex-shrink-0">{String(o.id)}</span>
              {Boolean(o.label) && <span className="truncate">{String(o.label)}</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ── Shared portal dropdown ──────────────────────────────────────────────── */
function PortalSelect({
  value, onChange, options, placeholder = 'Select…', className = '', disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label?: string }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
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
    if (disabled) return;
    if (containerRef.current) setAnchorRect(containerRef.current.getBoundingClientRect());
    setOpen(true);
    setSearch('');
  }

  function select(v: string) {
    onChange(v);
    setOpen(false);
    setSearch('');
  }

  const q = search.toLowerCase();
  const filtered = options.filter(o => (o.label ?? o.value).toLowerCase().includes(q));
  const selectedLabel = options.find(o => o.value === value)?.label ?? value;

  return (
    <div ref={containerRef} className={className}>
      <div className={`flex items-center rounded-lg border bg-slate-950/40 transition-colors ${open ? 'border-primary-500' : 'border-slate-700'} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <input
          className="flex-1 min-w-0 bg-transparent px-2 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          value={open ? search : selectedLabel}
          placeholder={placeholder}
          spellCheck={false}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => openDropdown()}
        />
        <button
          type="button"
          className="flex-shrink-0 px-2 text-slate-400 hover:text-slate-200 transition-colors"
          onMouseDown={e => { e.preventDefault(); if (open) { setOpen(false); setSearch(''); } else openDropdown(); }}
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && anchorRect && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: anchorRect.bottom + 4, left: anchorRect.left, width: anchorRect.width, zIndex: 9999 }}
          className="max-h-60 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 shadow-2xl"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500 italic">No matches.</div>
          ) : (
            filtered.map((o, i) => (
              <button
                key={o.value || String(i)}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors border-b border-slate-800/60 last:border-0
                  ${value === o.value ? 'bg-primary-500/15 text-primary-300' : 'text-slate-200 hover:bg-slate-800/60'}`}
                onMouseDown={() => select(o.value)}
              >
                {o.label ?? o.value}
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function FieldGrid({ columns, values, setValues, meta, mode, disabled }: FieldGridProps) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
      {columns.map(c => {
        const fk = meta?.outbound_foreign_keys?.find(x => x.column_name === c.name);
        if (fk) {
          return (
            <label key={c.name} className="text-xs text-slate-300">
              {c.name}
              <span className="ml-1 text-[10px] text-primary-400">→ {fk.referenced_table_name}</span>
              <FkSelect
                key={`${mode}:${c.name}:${fk.referenced_table_name}`}
                value={values[c.name] ?? ''}
                onChange={v => setValues(prev => ({ ...prev, [c.name]: v }))}
                fk={fk}
                disabled={disabled}
              />
            </label>
          );
        }
        const inputType = getInputType(c.sql_type);
        return (
          <label key={c.name} className="text-xs text-slate-300">
            {c.name}
            <input
              type={inputType}
              step={inputType === 'number' ? 'any' : undefined}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-2 text-sm text-slate-100"
              value={values[c.name] ?? ''}
              onChange={(e) => setValues(v => ({ ...v, [c.name]: e.target.value }))}
              disabled={disabled}
            />
          </label>
        );
      })}
    </div>
  );
}
