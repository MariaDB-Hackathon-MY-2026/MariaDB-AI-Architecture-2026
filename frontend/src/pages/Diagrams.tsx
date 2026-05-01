import { useEffect, useState, useMemo } from 'react';
import {
  GitBranch, ExternalLink, Image as ImageIcon, Sparkles,
  ArrowRight, ArrowLeft, Network, X,
} from 'lucide-react';
import {
  jsonFetch,
  type MetadataResponse, type DiagramResponse, type MermaidLinksResponse,
  type SchemaEdge, type SchemaEdgesResponse,
} from '../lib/api';
import StatusBanner from '../components/StatusBanner';
import MermaidView from '../components/MermaidView';
import { SkeletonBlock } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';

type DiagramKind = 'erd';

export default function Diagrams() {
  const [tables, setTables]               = useState<string[]>([]);
  const [edges, setEdges]                 = useState<SchemaEdge[]>([]);
  const kind: DiagramKind                 = 'erd';
  const depth: 1 | 2                      = 2;
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [focusTables, setFocusTables]     = useState<string[]>([]);
  const [code, setCode]                   = useState('');
  const [links, setLinks]                 = useState<MermaidLinksResponse | null>(null);

  const [isLoading, setIsLoading]         = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [errorText, setErrorText]         = useState<string | null>(null);
  const [statusText, setStatusText]       = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [meta, edgesData] = await Promise.all([
          jsonFetch<MetadataResponse>('/metadata'),
          jsonFetch<SchemaEdgesResponse>('/schema/edges').catch(() => ({ edges: [] as SchemaEdge[] })),
        ]);
        setTables(meta.tables ?? []);
        setEdges(edgesData.edges ?? []);
      } catch (err) {
        setErrorText(err instanceof Error ? err.message : String(err));
      } finally {
        setInitialLoading(false);
      }
    })();
  }, []);

  /* Bidirectional adjacency: table → set of all connected tables */
  const adjacencyMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!map.has(edge.source)) map.set(edge.source, new Set());
      if (!map.has(edge.target)) map.set(edge.target, new Set());
      map.get(edge.source)!.add(edge.target);
      map.get(edge.target)!.add(edge.source);
    }
    return map;
  }, [edges]);

  const outboundEdges = useMemo(
    () => (selectedTable ? edges.filter(e => e.source === selectedTable) : []),
    [selectedTable, edges],
  );
  const inboundEdges = useMemo(
    () => (selectedTable ? edges.filter(e => e.target === selectedTable) : []),
    [selectedTable, edges],
  );
  const neighborSet = useMemo(
    () => (selectedTable ? (adjacencyMap.get(selectedTable) ?? new Set<string>()) : new Set<string>()),
    [selectedTable, adjacencyMap],
  );

  /* ── diagram generation ──────────────────────────────────────────────── */
  async function generateWithFocus(k: DiagramKind, d: 1 | 2, focus: string[]) {
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const data = await jsonFetch<DiagramResponse>('/diagram', {
        method: 'POST',
        body: JSON.stringify({ kind: k, depth: d, focus_tables: focus }),
      });
      setCode(data.code);
      setLinks(null);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  /* ── chip click ──────────────────────────────────────────────────────── */
  function handleTableClick(table: string) {
    if (selectedTable === table) {
      /* deselect → show full schema */
      setSelectedTable(null);
      setFocusTables([]);
      void generateWithFocus(kind, depth, []);
    } else {
      const neighbors = adjacencyMap.get(table) ?? new Set<string>();
      const focus = [table, ...neighbors];
      setSelectedTable(table);
      setFocusTables(focus);
      void generateWithFocus(kind, depth, focus);
    }
  }

  function handleShowAll() {
    setSelectedTable(null);
    setFocusTables([]);
    void generateWithFocus(kind, depth, []);
  }

  /* explicit "generate" button re-runs with current state */
  function handleGenerate() {
    void generateWithFocus(kind, depth, focusTables);
    setStatusText('Diagram generated.');
  }

  /* export links */
  async function genLinks() {
    const trimmed = (code || '').trim();
    if (!trimmed) return;
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const out = await jsonFetch<MermaidLinksResponse>('/diagram/links', {
        method: 'POST', body: JSON.stringify({ code: trimmed, theme: 'dark' }),
      });
      setLinks(out);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  /* ── empty state ─────────────────────────────────────────────────────── */
  if (!initialLoading && tables.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-white">ER Diagrams</h1>
          <p className="text-sm text-slate-400 mt-1">Visualize your schema as ERD, structural, or operational flowcharts.</p>
        </header>
        <StatusBanner error={errorText} status={null} />
        <EmptyState
          icon={GitBranch}
          title="No tables to visualize"
          description="Your database has no tables yet. Generate a schema to see its entity-relationship diagram here."
          action={{ label: 'Go to Schema Generator', to: '/schema' }}
        />
      </div>
    );
  }

  /* ── page ────────────────────────────────────────────────────────────── */
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">ER Diagrams</h1>
        <p className="text-sm text-slate-400 mt-1">
          Visualize your schema via Mermaid. Click any table chip to instantly explore its relationships.
        </p>
      </header>

      <StatusBanner error={errorText} status={statusText} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* ─── Left panel: controls + explorer ─────────────────────────── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-1 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <GitBranch className="w-4 h-4 text-primary-400" /> Builder
          </div>


          {/* Table Explorer */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Network className="w-3.5 h-3.5 text-accent-400" />
                Table Explorer
              </div>
              {selectedTable && (
                <button
                  onClick={handleShowAll}
                  className="flex items-center gap-0.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X className="w-3 h-3" /> clear
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mb-2.5">
              Click a table — its FK neighbours highlight automatically
            </p>

            {initialLoading ? (
              <SkeletonBlock className="h-20 w-full" />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tables.map(t => {
                  const isSelected = selectedTable === t;
                  const isNeighbor = !isSelected && neighborSet.has(t);
                  const connCount  = adjacencyMap.get(t)?.size ?? 0;
                  return (
                    <button
                      key={t}
                      onClick={() => handleTableClick(t)}
                      title={
                        connCount === 0
                          ? 'No FK connections'
                          : `${connCount} connection${connCount > 1 ? 's' : ''}`
                      }
                      className={[
                        'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                        isSelected
                          ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                          : isNeighbor
                            ? 'bg-accent-500/20 text-accent-300 border border-accent-500/35 hover:bg-accent-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-200',
                      ].join(' ')}
                    >
                      {t}
                      {connCount > 0 && (
                        <span className={`text-[10px] px-1 rounded-full leading-none py-0.5 ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-400'
                        }`}>
                          {connCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Relationship info panel */}
          {selectedTable && (outboundEdges.length > 0 || inboundEdges.length > 0) && (
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 space-y-2.5 text-xs">
              <div className="font-semibold text-white">{selectedTable}</div>

              {outboundEdges.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">References →</div>
                  {outboundEdges.map(e => (
                    <button
                      key={e.target}
                      onClick={() => handleTableClick(e.target)}
                      className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors w-full text-left"
                    >
                      <ArrowRight className="w-3 h-3 flex-shrink-0" />
                      {e.target}
                    </button>
                  ))}
                </div>
              )}

              {inboundEdges.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Referenced by ←</div>
                  {inboundEdges.map(e => (
                    <button
                      key={e.source}
                      onClick={() => handleTableClick(e.source)}
                      className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 transition-colors w-full text-left"
                    >
                      <ArrowLeft className="w-3 h-3 flex-shrink-0" />
                      {e.source}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedTable && outboundEdges.length === 0 && inboundEdges.length === 0 && (
            <p className="text-xs text-slate-500 italic">No FK connections on {selectedTable}.</p>
          )}

          <button
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
            onClick={handleGenerate}
            disabled={isLoading}
          >
            <Sparkles className="w-4 h-4" />
            {selectedTable ? `Diagram: ${selectedTable}` : 'Generate full diagram'}
          </button>
        </div>

        {/* ─── Right panel: preview ─────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-2 space-y-4">

          {/* Header row */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-medium text-white mb-0.5">Preview</div>
              {selectedTable ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-500">Showing:</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-300">
                    {selectedTable}
                  </span>
                  {[...neighborSet].map(t => (
                    <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                      {t}
                    </span>
                  ))}
                  <button
                    onClick={handleShowAll}
                    className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    (show all)
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">Full schema</div>
              )}
            </div>

            {/* Export */}
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800/40 disabled:opacity-50 transition-colors"
                onClick={() => void genLinks()}
                disabled={isLoading || !code.trim()}
              >
                <ImageIcon className="w-3.5 h-3.5" /> Export links
              </button>
              {links && (
                <>
                  <a
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800/40 transition-colors"
                    href={links.mermaid_live_edit_url} target="_blank" rel="noreferrer"
                  >
                    <ExternalLink className="w-3 h-3" /> Live
                  </a>
                  <a
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800/40 transition-colors"
                    href={links.svg_url} target="_blank" rel="noreferrer"
                  >
                    <ExternalLink className="w-3 h-3" /> SVG
                  </a>
                  <a
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800/40 transition-colors"
                    href={links.png_url} target="_blank" rel="noreferrer"
                  >
                    <ExternalLink className="w-3 h-3" /> PNG
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Diagram */}
          <MermaidView code={code} theme="dark" />

          {/* Collapsible Mermaid source */}
          <details>
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 select-none transition-colors">
              Mermaid source
            </summary>
            <pre className="mt-2 max-h-52 overflow-auto rounded-xl border border-slate-800 bg-black/40 p-3 text-xs text-slate-200 leading-relaxed">
              {code || 'No diagram yet. Choose a type and generate.'}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
