import { useState } from 'react';
import { Sparkles, Play, Download, Search, Table2 } from 'lucide-react';
import { jsonFetch, QueryPlanResponse, QueryExecuteResponse, QueryExportResponse } from '../lib/api';
import StatusBanner from '../components/StatusBanner';

export default function QueryAssistant() {
  const [question, setQuestion] = useState('Show me the top 20 airports by number of routes.');
  const [plan, setPlan] = useState<QueryPlanResponse | null>(null);
  const [result, setResult] = useState<QueryExecuteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  async function generate() {
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const p = await jsonFetch<QueryPlanResponse>('/query/generate', {
        method: 'POST', body: JSON.stringify({ question }),
      });
      setPlan(p); setResult(null);
      setStatusText(p.title ?? 'Query generated.');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function run() {
    if (!plan) return;
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      const r = await jsonFetch<QueryExecuteResponse>('/query/execute', {
        method: 'POST', body: JSON.stringify({ sql: plan.sql, params: plan.params }),
      });
      setResult(r);
      setStatusText(`Returned ${r.rows.length} rows.`);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function downloadCsv() {
    if (!plan) return;
    setErrorText(null); setIsLoading(true);
    try {
      const data = await jsonFetch<QueryExportResponse>('/query/export', {
        method: 'POST', body: JSON.stringify({ sql: plan.sql, params: plan.params }),
      });
      const bytes = Uint8Array.from(atob(data.data_base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: data.mime || 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = data.filename || 'query-results.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Query Assistant</h1>
        <p className="text-sm text-slate-400 mt-1">
          Ask questions in plain English. The AI generates a safe, read-only SELECT — review before running.
        </p>
      </header>

      <StatusBanner error={errorText} status={statusText} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Search className="w-4 h-4 text-primary-400" /> Ask a question
          </div>
          <textarea
            className="mt-3 h-32 w-full resize-none rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              disabled={isLoading || !question.trim()}
              onClick={() => void generate()}
            >
              <Sparkles className="w-4 h-4" /> Generate SQL
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              disabled={isLoading || !plan}
              onClick={() => void run()}
            >
              <Play className="w-4 h-4" /> Run
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800/40 disabled:opacity-50"
              disabled={isLoading || !plan}
              onClick={() => void downloadCsv()}
            >
              <Download className="w-4 h-4" /> Download CSV
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="text-sm font-medium text-white">SQL + parameters</div>
          <pre className="mt-3 max-h-44 overflow-auto rounded-xl border border-slate-800 bg-black/40 p-3 text-xs text-slate-200">
            {plan ? plan.sql : 'No SQL yet.'}
          </pre>
          <pre className="mt-2 max-h-32 overflow-auto rounded-xl border border-slate-800 bg-black/40 p-3 text-xs text-slate-200">
            {plan ? JSON.stringify(plan.params, null, 2) : '[]'}
          </pre>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 lg:col-span-2">
          <div className="text-sm font-medium text-white">
            Results {result && <span className="ml-2 text-xs text-slate-400">({result.rows.length} rows)</span>}
          </div>
          {!result ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800/60 border border-slate-700/50 mb-3">
                <Search className="w-6 h-6 text-slate-500" />
              </div>
              <p className="text-sm text-slate-400">Type a question above, click <strong className="text-slate-300">Generate SQL</strong>, then <strong className="text-slate-300">Run</strong>.</p>
            </div>
          ) : result.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800/60 border border-slate-700/50 mb-3">
                <Table2 className="w-6 h-6 text-slate-500" />
              </div>
              <p className="text-sm text-slate-400">Query ran successfully but returned <strong className="text-slate-300">0 rows</strong>.</p>
              <p className="text-xs text-slate-500 mt-1">Try a different question or check that your tables have data.</p>
            </div>
          ) : (
            <div className="mt-3 max-h-[480px] overflow-auto rounded-xl border border-slate-800 bg-black/20">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-slate-900">
                  <tr>
                    {result.columns.map(c => (
                      <th key={c} className="border-b border-slate-800 px-3 py-2 text-left text-slate-200">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i} className="odd:bg-white/5">
                      {r.map((cell, j) => (
                        <td key={j} className="border-b border-slate-900 px-3 py-2 text-slate-200">
                          {cell === null || cell === undefined ? '' : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
