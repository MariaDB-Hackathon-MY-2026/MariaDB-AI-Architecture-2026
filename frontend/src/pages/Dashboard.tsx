import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare, Sparkles, GitBranch, Layers, Table2,
  Search, Play, CheckCircle, Circle, BarChart3,
  Zap, Shield, Database, List, Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { jsonFetch, type StatsResponse, type OllamaHealthResponse } from '../lib/api';

/* ─── Data ───────────────────────────────────────────────────────────────── */
const MODULES = [
  {
    to: '/schema',
    icon: MessageSquare, title: 'Schema Generator',
    desc: 'Type any system description and the AI builds a full relational schema instantly.',
    tag: 'AI', tagC: 'bg-primary-500/20 text-primary-300',
    grad: 'from-primary-500/20 to-primary-600/5', iconC: 'text-primary-400',
    border: 'border-primary-500/20 hover:border-primary-500/45',
  },
  {
    to: '/diagrams',
    icon: GitBranch, title: 'ER Diagram Builder',
    desc: 'Visual entity-relationship diagrams via Mermaid. Export as SVG or PNG.',
    tag: 'Visual', tagC: 'bg-accent-500/20 text-accent-300',
    grad: 'from-accent-500/20 to-accent-600/5', iconC: 'text-accent-400',
    border: 'border-accent-500/20 hover:border-accent-500/45',
  },
  {
    to: '/migrations',
    icon: Layers, title: 'Migration Assistant',
    desc: 'Add, rename, drop columns. Modify FK rules — guided UI or AI-powered SQL.',
    tag: 'AI', tagC: 'bg-purple-500/20 text-purple-300',
    grad: 'from-purple-500/20 to-purple-600/5', iconC: 'text-purple-400',
    border: 'border-purple-500/20 hover:border-purple-500/45',
  },
  {
    to: '/data',
    icon: Table2, title: 'Data Manager',
    desc: 'Full CRUD for every table. CSV import/export with smart column mapping.',
    tag: 'CRUD', tagC: 'bg-emerald-500/20 text-emerald-300',
    grad: 'from-emerald-500/20 to-emerald-600/5', iconC: 'text-emerald-400',
    border: 'border-emerald-500/20 hover:border-emerald-500/45',
  },
  {
    to: '/query',
    icon: Search, title: 'Query Assistant',
    desc: 'Ask data questions in plain English. AI generates safe read-only SELECT queries.',
    tag: 'AI', tagC: 'bg-pink-500/20 text-pink-300',
    grad: 'from-pink-500/20 to-pink-600/5', iconC: 'text-pink-400',
    border: 'border-pink-500/20 hover:border-pink-500/45',
  },
  {
    to: '/demo',
    icon: Play, title: 'Demo Mode',
    desc: 'Load the OpenFlights dataset (airports, airlines, routes) with one click.',
    tag: 'Demo', tagC: 'bg-orange-500/20 text-orange-300',
    grad: 'from-orange-500/20 to-orange-600/5', iconC: 'text-orange-400',
    border: 'border-orange-500/20 hover:border-orange-500/45',
  },
];


const HOW_TO_USE = [
  { n: '1', title: 'Schema Generator', desc: 'Type what database you want — e.g. "Create a library management system".' },
  { n: '2', title: 'ER Diagrams',      desc: 'Inspect the visual entity-relationship diagram, then export as SVG or PNG.' },
  { n: '3', title: 'Migrations',       desc: 'Drop columns, rename tables, manage indexes, or use AI-generated SQL.' },
  { n: '4', title: 'Data & Query',     desc: 'Manage records via the Data Manager and query in natural language.' },
];

/* ─── Stat card ──────────────────────────────────────────────────────────── */
function StatCard({
  icon: Icon, label, value, loading, c, bg, b,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  loading: boolean;
  c: string; bg: string; b: string;
}) {
  return (
    <div className={`glass-card rounded-2xl p-5 border ${b}`}>
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${bg} border ${b} mb-3`}>
        <Icon className={`w-5 h-5 ${c}`} />
      </div>
      {loading ? (
        <div className="h-9 w-16 rounded-lg bg-slate-700/60 animate-pulse mb-0.5" />
      ) : (
        <div className={`text-3xl font-black ${c} mb-0.5`}>{value}</div>
      )}
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { user } = useAuth();
  const displayName = user?.email?.split('@')[0] ?? 'User';

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [ollamaHealth, setOllamaHealth] = useState<OllamaHealthResponse | null>(null);
  const [ollamaLoading, setOllamaLoading] = useState(true);

  useEffect(() => {
    jsonFetch<StatsResponse>('/stats')
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
    jsonFetch<OllamaHealthResponse>('/health/ollama')
      .then(setOllamaHealth)
      .catch(() => setOllamaHealth({ ok: false, message: 'Could not reach Ollama.' }))
      .finally(() => setOllamaLoading(false));
  }, []);

  const CHECKLIST = [
    { id: 1, text: 'Install MariaDB and create the database',                    done: true,                                  loading: false },
    { id: 2, text: 'Configure your MariaDB credentials in Settings',             done: !!user?.has_settings,                  loading: false },
    { id: 3, text: 'Install Ollama and pull a model (e.g. qwen2.5-coder:1.5b)', done: ollamaHealth?.ok === true,             loading: ollamaLoading },
    { id: 4, text: 'Run: uvicorn backend.main:app  +  npm run dev',              done: true,                                  loading: false },
    { id: 5, text: 'Save settings and test connections',                         done: !!user?.has_settings,                  loading: false },
    { id: 6, text: 'Describe your first database in Schema Generator',           done: (stats?.table_count ?? 0) > 0,         loading: statsLoading },
  ];

  const LIVE_STATS = [
    {
      icon: Database,
      label: 'Tables',
      value: stats?.table_count ?? 0,
      c: 'text-primary-400', bg: 'bg-primary-500/10', b: 'border-primary-500/20',
    },
    {
      icon: BarChart3,
      label: 'Total Rows',
      value: stats ? stats.total_rows.toLocaleString() : 0,
      c: 'text-emerald-400', bg: 'bg-emerald-500/10', b: 'border-emerald-500/20',
    },
    {
      icon: GitBranch,
      label: 'Snapshots',
      value: stats?.snapshot_count ?? 0,
      c: 'text-accent-400', bg: 'bg-accent-500/10', b: 'border-accent-500/20',
    },
    {
      icon: List,
      label: 'Audit Entries',
      value: stats?.audit_count ?? 0,
      c: 'text-orange-400', bg: 'bg-orange-500/10', b: 'border-orange-500/20',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">

      {/* Welcome banner */}
      <section id="overview">
        <div className="relative glass rounded-3xl p-8 border border-primary-500/15 overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 70% 90% at 0% 50%, rgba(99,102,241,0.12) 0%, transparent 65%)' }}
          />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse block" />
                Logged In
              </span>
              <h1 className="text-3xl font-bold text-white mb-1">
                Welcome back, <span className="gradient-text">{displayName}</span>
              </h1>
              <p className="text-slate-400 text-sm">
                Your AI-powered MariaDB workspace. Pick a module from the sidebar or cards below.
              </p>
            </div>
            <Link
              to="/schema"
              className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-xl transition-all hover:shadow-lg hover:shadow-primary-500/25 hover:-translate-y-0.5"
            >
              <Sparkles className="w-4 h-4" />
              Start Building
            </Link>
          </div>
        </div>
      </section>

      {/* Live Stats */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Live Database Stats</h2>
          {!statsLoading && (
            <button
              onClick={() => {
                setStatsLoading(true);
                jsonFetch<StatsResponse>('/stats')
                  .then(setStats)
                  .catch(() => setStats(null))
                  .finally(() => setStatsLoading(false));
              }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Refresh
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {LIVE_STATS.map(s => (
            <StatCard key={s.label} {...s} loading={statsLoading} />
          ))}
        </div>
      </section>

      {/* Modules grid */}
      <section id="modules">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">Application Modules</h2>
            <p className="text-xs text-slate-400 mt-0.5">Click any card to open the module</p>
          </div>
          <span className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
            6 modules
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.map(m => (
            <Link
              key={m.title}
              to={m.to}
              className={`glass-card rounded-2xl p-6 border ${m.border} block`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br ${m.grad}`}>
                  <m.icon className={`w-5 h-5 ${m.iconC}`} />
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.tagC}`}>{m.tag}</span>
              </div>
              <h3 className="font-semibold text-white mb-1.5 text-sm">{m.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{m.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Checklist + How to use */}
      <section id="quick-start" className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Checklist */}
        <div className="glass rounded-2xl p-6 border border-slate-700/50">
          <h3 className="font-semibold text-white mb-5 flex items-center gap-2 text-sm">
            <Zap className="w-4 h-4 text-primary-400" />
            Getting Started Checklist
          </h3>
          <div className="space-y-3.5">
            {CHECKLIST.map(item => (
              <div key={item.id} className="flex items-start gap-3">
                {item.loading
                  ? <Loader2 className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5 animate-spin" />
                  : item.done
                    ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    : <Circle      className="w-4 h-4 text-slate-600    flex-shrink-0 mt-0.5" />
                }
                <span className={`text-sm ${item.loading ? 'text-slate-500' : item.done ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* How to use */}
        <div className="glass rounded-2xl p-6 border border-slate-700/50">
          <h3 className="font-semibold text-white mb-5 flex items-center gap-2 text-sm">
            <Shield className="w-4 h-4 text-accent-400" />
            How to Use the App
          </h3>
          <div className="space-y-4">
            {HOW_TO_USE.map(item => (
              <div key={item.n} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-accent-500/15 border border-accent-500/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-accent-400">{item.n}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="pb-6">
        <div className="glass rounded-3xl p-10 border border-primary-500/15 text-center">
          <Sparkles className="w-10 h-10 text-primary-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Ready to Build?</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-sm mx-auto">
            Describe your system in the Schema Generator — the AI handles the rest.
          </p>
          <Link
            to="/schema"
            className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-xl transition-all hover:shadow-xl hover:shadow-primary-500/30 hover:-translate-y-0.5"
          >
            <Sparkles className="w-5 h-5" />
            Open Schema Generator
          </Link>
        </div>
      </section>

    </div>
  );
}
