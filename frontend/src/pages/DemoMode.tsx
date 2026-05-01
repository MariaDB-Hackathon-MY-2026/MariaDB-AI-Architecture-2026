import { useEffect, useState } from 'react';
import { Play, Plane, RefreshCw, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { jsonFetch, JobStatusResponse, QueryExecuteResponse } from '../lib/api';
import StatusBanner from '../components/StatusBanner';

export default function DemoMode() {
  const [jobId, setJobId]     = useState<string | null>(null);
  const [job, setJob]         = useState<JobStatusResponse | null>(null);
  const [showcase, setShowcase]   = useState<QueryExecuteResponse | null>(null);
  const [showcasePage, setShowcasePage]   = useState(1);
  const [showcaseSearch, setShowcaseSearch] = useState('');

  /* Official loader controls */
  const [airportLimit,  setAirportLimit]  = useState(500);
  const [airlineLimit,  setAirlineLimit]  = useState(300);
  const [routeLimit,    setRouteLimit]    = useState(2000);

  const [isLoading, setIsLoading]   = useState(false);
  const [errorText, setErrorText]   = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  /* Poll active job */
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const j = await jsonFetch<JobStatusResponse>(`/jobs/${jobId}`, { method: 'GET' });
        if (cancelled) return;
        setJob(j);
        if (j.status === 'done')  setStatusText('Demo loaded — go to Data Manager to browse the data.');
        if (j.status === 'error') setErrorText(j.error || 'Demo job failed.');
      } catch (err) {
        if (cancelled) return;
        setErrorText(err instanceof Error ? err.message : String(err));
      }
    };
    void tick();
    const h = window.setInterval(() => void tick(), 1200);
    return () => { cancelled = true; window.clearInterval(h); };
  }, [jobId]);

  async function startSample() {
    setErrorText(null); setStatusText(null); setJob(null); setJobId(null); setIsLoading(true);
    try {
      const data = await jsonFetch<{ job_id: string }>('/demo/openflights/sample?reset_first=true', { method: 'POST' });
      setJobId(data.job_id);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function startOfficial() {
    setErrorText(null); setStatusText(null); setJob(null); setJobId(null); setIsLoading(true);
    try {
      const params = new URLSearchParams({
        reset_first: 'true',
        airport_limit: String(airportLimit),
        airline_limit: String(airlineLimit),
        route_limit:   String(routeLimit),
      });
      const data = await jsonFetch<{ job_id: string }>(`/demo/openflights/official?${params}`, { method: 'POST' });
      setJobId(data.job_id);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function loadShowcase() {
    setErrorText(null); setIsLoading(true);
    try {
      const data = await jsonFetch<QueryExecuteResponse>('/demo/openflights/showcase', {
        method: 'POST',
        body: JSON.stringify({ page: showcasePage, page_size: 50, search: showcaseSearch }),
      });
      setShowcase(data);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  const jobRunning = job && (job.status === 'queued' || job.status === 'running');
  const jobDone    = job?.status === 'done';
  const jobError   = job?.status === 'error';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Plane className="w-6 h-6 text-primary-400" /> Demo Mode
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Load the OpenFlights dataset (airports, airlines, routes) into your database to explore all features.
        </p>
      </header>

      <StatusBanner error={errorText} status={statusText} />

      {/* ── Job progress banner ──────────────────────────────────────────── */}
      {job && (
        <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
          jobDone  ? 'border-emerald-500/30 bg-emerald-500/10' :
          jobError ? 'border-red-500/30 bg-red-500/10' :
                     'border-primary-500/30 bg-primary-500/10'
        }`}>
          {jobRunning && <Loader2 className="w-5 h-5 text-primary-400 flex-shrink-0 animate-spin mt-0.5" />}
          {jobDone    && <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />}
          {jobError   && <AlertCircle  className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white">
              {jobRunning ? 'Loading data…' : jobDone ? 'Data loaded successfully!' : 'Job failed'}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{job.message}</div>
            {jobDone && !!job.result?.counts && (
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(job.result.counts as Record<string, number>).map(([k, v]) => (
                  <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {k}: {Number(v)}
                  </span>
                ))}
              </div>
            )}
            {jobDone && (
              <div className="mt-3">
                <Link
                  to="/data"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
                >
                  View in Data Manager <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* ── Quick Sample ─────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Play className="w-4 h-4 text-emerald-400" /> Quick Sample
              <span className="text-[11px] font-normal text-slate-500 ml-1">instant</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Loads a tiny hardcoded subset. Good for a quick connectivity test.
            </p>
          </div>

          <div className="flex gap-4 text-xs text-slate-400">
            <span className="px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700/50">5 airports</span>
            <span className="px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700/50">5 airlines</span>
            <span className="px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700/50">6 routes</span>
          </div>

          <button
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            onClick={() => void startSample()}
            disabled={isLoading || !!jobRunning}
          >
            <Play className="w-4 h-4" /> Run sample (fast)
          </button>

          <p className="text-[11px] text-slate-500">
            Note: This replaces any existing data in your database. Use the official loader below for meaningful amounts.
          </p>
        </div>

        {/* ── Official Subset ──────────────────────────────────────────── */}
        <div className="rounded-2xl border border-primary-500/20 bg-slate-900/40 p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Plane className="w-4 h-4 text-primary-400" /> Official Dataset
              <span className="text-[11px] font-normal text-slate-500 ml-1">recommended</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Loads real data from the OpenFlights GitHub repository. Choose how much to load.
            </p>
          </div>

          <div className="space-y-3">
            <LimitInput
              label="Airports"
              value={airportLimit}
              onChange={setAirportLimit}
              min={10} max={10000}
              hint="max 10 000"
            />
            <LimitInput
              label="Airlines"
              value={airlineLimit}
              onChange={setAirlineLimit}
              min={10} max={6000}
              hint="max 6 000"
            />
            <LimitInput
              label="Routes"
              value={routeLimit}
              onChange={setRouteLimit}
              min={10} max={67000}
              hint="max 67 000"
            />
          </div>

          <button
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
            onClick={() => void startOfficial()}
            disabled={isLoading || !!jobRunning}
          >
            {jobRunning
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
              : <><Play className="w-4 h-4" /> Load official subset</>
            }
          </button>

          <p className="text-[11px] text-slate-500">
            First run clones the OpenFlights repo (~30 s). Subsequent runs are faster. Replaces existing data.
          </p>
        </div>
      </div>

      {/* ── Showcase ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Showcase — routes joined with airlines &amp; airports</div>
            <p className="text-xs text-slate-400 mt-0.5">Preview the loaded data here, or browse individual tables in Data Manager.</p>
          </div>
          <Link
            to="/data"
            className="inline-flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors"
          >
            Open Data Manager <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-300">
            Page
            <input
              className="mt-1 w-20 rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-2 text-sm text-slate-100"
              type="number"
              value={showcasePage}
              onChange={(e) => setShowcasePage(Number(e.target.value || '1'))}
              min={1}
            />
          </label>
          <label className="text-xs text-slate-300 flex-1 min-w-48">
            Search
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-2 text-sm text-slate-100"
              value={showcaseSearch}
              onChange={(e) => setShowcaseSearch(e.target.value)}
              placeholder="airline / airport / IATA…"
            />
          </label>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
            onClick={() => void loadShowcase()}
            disabled={isLoading}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Load
          </button>
        </div>

        <div className="max-h-96 overflow-auto rounded-xl border border-slate-800 bg-black/20">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-950/80">
              <tr>
                {(showcase?.columns ?? []).map(c => (
                  <th key={c} className="border-b border-slate-800 px-3 py-2 font-medium text-slate-200">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(showcase?.rows ?? []).map((r, idx) => (
                <tr key={idx} className={idx % 2 ? 'bg-black/10' : ''}>
                  {(r as unknown[]).map((v, j) => (
                    <td key={j} className="border-b border-slate-900 px-3 py-2 text-slate-200 whitespace-nowrap">{String(v ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!showcase?.rows?.length && (
            <div className="p-6 text-xs text-slate-400 text-center">
              No data yet. Load a demo first, then click <strong className="text-slate-300">Load</strong>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Limit input ─────────────────────────────────────────────────────────── */
function LimitInput({
  label, value, onChange, min, max, hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-xs text-slate-300 flex-shrink-0">{label}</span>
      <input
        type="range"
        className="flex-1 accent-indigo-500"
        min={min}
        max={max}
        step={Math.floor(max / 100)}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <input
        type="number"
        className="w-24 rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-1 text-xs text-slate-100 text-right"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
      />
      <span className="text-[11px] text-slate-500 w-16 flex-shrink-0">{hint}</span>
    </div>
  );
}
