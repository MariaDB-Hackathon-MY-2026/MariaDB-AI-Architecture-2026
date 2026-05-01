import { useEffect, useMemo, useState } from 'react';
import {
  FileClock, RefreshCw, Trash2, ChevronDown, ChevronUp, Search, X,
} from 'lucide-react';
import { jsonFetch, AuditEntry, AuditResponse } from '../lib/api';
import StatusBanner from '../components/StatusBanner';
import { SkeletonTableRows } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';

const ALL_KINDS = ['executed', 'generated', 'saved', 'cleared', 'error'] as const;

export default function Audit() {
  const [entries, setEntries]           = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading]       = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [errorText, setErrorText]       = useState<string | null>(null);
  const [statusText, setStatusText]     = useState<string | null>(null);

  const [search, setSearch]             = useState('');
  const [kindFilter, setKindFilter]     = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setErrorText(null); setIsLoading(true);
    try {
      const data = await jsonFetch<AuditResponse>('/audit', { method: 'GET' });
      setEntries(data.entries ?? []);
      setExpandedRows(new Set());
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
      setInitialLoading(false);
    }
  }

  async function clear() {
    setConfirmClear(false);
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const data = await jsonFetch<AuditResponse>('/audit/clear', { method: 'POST' });
      setEntries(data.entries ?? []);
      setStatusText('Audit log cleared.');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  function toggleExpand(idx: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e => {
      if (kindFilter !== 'all' && e.kind !== kindFilter) return false;
      if (q && !e.statement.toLowerCase().includes(q) && !e.kind.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, search, kindFilter]);

  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    return counts;
  }, [entries]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileClock className="w-6 h-6 text-primary-400" /> Audit Log
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            All generated and executed statements, newest first.
            {entries.length > 0 && (
              <span className="ml-2 text-slate-500">({entries.length} total)</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800/40 disabled:opacity-50 transition-colors"
            disabled={isLoading}
            onClick={() => void load()}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {!confirmClear ? (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-700/50 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
              disabled={isLoading || entries.length === 0}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">Sure?</span>
              <button
                className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition-colors"
                onClick={() => void clear()}
              >
                Yes, clear
              </button>
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800/40 transition-colors"
                onClick={() => setConfirmClear(false)}
              >
                <X className="w-3 h-3" /> Cancel
              </button>
            </div>
          )}
        </div>
      </header>

      <StatusBanner error={errorText} status={statusText} />

      {/* ── Filters ────────────────────────────────────────────────────── */}
      {!initialLoading && entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Kind toggles */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setKindFilter('all')}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                kindFilter === 'all'
                  ? 'bg-slate-700 border-slate-500 text-white'
                  : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
              }`}
            >
              All ({entries.length})
            </button>
            {ALL_KINDS.filter(k => kindCounts[k]).map(k => (
              <button
                key={k}
                onClick={() => setKindFilter(kindFilter === k ? 'all' : k)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  kindFilter === k
                    ? kindBadgeActive(k)
                    : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                }`}
              >
                {k} ({kindCounts[k]})
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-950/40 pl-8 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-primary-500"
              placeholder="Filter by statement or kind…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                onClick={() => setSearch('')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {filtered.length !== entries.length && (
            <span className="text-xs text-slate-500">{filtered.length} shown</span>
          )}
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────── */}
      {!initialLoading && entries.length === 0 ? (
        <EmptyState
          icon={FileClock}
          title="No audit entries yet"
          description="Every SQL statement generated or executed by the app is recorded here."
          action={{ label: 'Go to Schema Generator', to: '/schema' }}
        />
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="max-h-[640px] overflow-auto rounded-xl border border-slate-800 bg-black/20">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-900 z-10">
                <tr>
                  <th className="border-b border-slate-800 px-3 py-2 text-left text-slate-300 font-medium w-36">When</th>
                  <th className="border-b border-slate-800 px-3 py-2 text-left text-slate-300 font-medium w-28">Kind</th>
                  <th className="border-b border-slate-800 px-3 py-2 text-left text-slate-300 font-medium">Statement</th>
                </tr>
              </thead>
              <tbody>
                {initialLoading && <SkeletonTableRows cols={3} rows={8} />}
                {filtered.length === 0 && !initialLoading && (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-xs text-slate-500">
                      No entries match your filter.
                    </td>
                  </tr>
                )}
                {filtered.map((e, i) => {
                  const expanded = expandedRows.has(i);
                  const isLong = e.statement.length > 200;
                  return (
                    <tr key={i} className="odd:bg-white/5 align-top">
                      <td className="border-b border-slate-900 px-3 py-2 whitespace-nowrap text-slate-400">
                        {fmtAt(e.at)}
                      </td>
                      <td className="border-b border-slate-900 px-3 py-2 whitespace-nowrap">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${kindBadge(e.kind)}`}>
                          {e.kind}
                        </span>
                      </td>
                      <td className="border-b border-slate-900 px-3 py-2 text-slate-200 max-w-3xl">
                        <pre className={`font-mono text-[11px] whitespace-pre-wrap break-words ${!expanded && isLong ? 'line-clamp-4' : ''}`}>
                          {e.statement}
                        </pre>
                        {isLong && (
                          <button
                            className="mt-1 flex items-center gap-1 text-[10px] text-primary-400 hover:text-primary-300 transition-colors"
                            onClick={() => toggleExpand(i)}
                          >
                            {expanded
                              ? <><ChevronUp className="w-3 h-3" /> Collapse</>
                              : <><ChevronDown className="w-3 h-3" /> Expand</>
                            }
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtAt(at: string): string {
  return at.replace('T', ' ').slice(0, 19);
}

function kindBadge(kind: string): string {
  switch (kind) {
    case 'executed':  return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
    case 'generated': return 'bg-primary-500/15 text-primary-300 border border-primary-500/30';
    case 'saved':     return 'bg-accent-500/15 text-accent-300 border border-accent-500/30';
    case 'cleared':   return 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
    case 'error':     return 'bg-red-500/15 text-red-300 border border-red-500/30';
    default:          return 'bg-slate-700/40 text-slate-300 border border-slate-600/40';
  }
}

function kindBadgeActive(kind: string): string {
  switch (kind) {
    case 'executed':  return 'bg-emerald-500/25 border-emerald-500/50 text-emerald-300';
    case 'generated': return 'bg-primary-500/25 border-primary-500/50 text-primary-300';
    case 'saved':     return 'bg-accent-500/25 border-accent-500/50 text-accent-300';
    case 'cleared':   return 'bg-amber-500/25 border-amber-500/50 text-amber-300';
    case 'error':     return 'bg-red-500/25 border-red-500/50 text-red-300';
    default:          return 'bg-slate-700/60 border-slate-500 text-slate-300';
  }
}
