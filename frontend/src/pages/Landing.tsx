import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare, Sparkles, GitBranch, Layers,
  Table2, Search, ArrowRight, Play, Check,
  ChevronRight, Cpu, Zap, Globe, Database,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

/* ─── Scroll reveal ──────────────────────────────────────────────────────── */
function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' },
    );
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ─── Animated terminal ──────────────────────────────────────────────────── */
type StepRole = 'user' | 'thinking' | 'success' | 'code';
interface Step { role: StepRole; text: string }

const DEMO_STEPS: Step[] = [
  { role: 'user',     text: 'Create a hospital management system' },
  { role: 'thinking', text: 'Designing schema…' },
  { role: 'success',  text: '✓ 5 tables: patients, doctors, appointments, departments, prescriptions' },
  { role: 'success',  text: '✓ 6 foreign key relationships configured' },
  { role: 'success',  text: '✓ 4 unique indexes auto-generated' },
  { role: 'code',     text: 'CREATE TABLE patients (\n  id   INT AUTO_INCREMENT PRIMARY KEY,\n  name VARCHAR(255) NOT NULL,\n  dob  DATE,\n  doctor_id INT,\n  FOREIGN KEY (doctor_id) REFERENCES doctors(id)\n);' },
];

function TerminalDemo() {
  const [visible, setVisible] = useState<number[]>([0]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (current >= DEMO_STEPS.length - 1) {
      // reset after pause
      const t = setTimeout(() => { setVisible([0]); setCurrent(0); }, 4000);
      return () => clearTimeout(t);
    }
    const delay = current === 1 ? 1400 : 750;
    const t = setTimeout(() => {
      const next = current + 1;
      setCurrent(next);
      setVisible(v => [...v, next]);
    }, delay);
    return () => clearTimeout(t);
  }, [current]);

  const roleStyle: Record<StepRole, string> = {
    user:     'text-white',
    thinking: 'text-yellow-400',
    success:  'text-emerald-400',
    code:     'text-cyan-300',
  };

  return (
    <div className="terminal animate-glow-pulse shadow-2xl shadow-primary-900/30">
      {/* Window bar */}
      <div className="terminal-bar">
        <span className="w-3 h-3 rounded-full bg-red-500/70 block" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/70 block" />
        <span className="w-3 h-3 rounded-full bg-green-500/70 block" />
        <span className="ml-3 text-xs text-slate-500">MariaDB AI Architect</span>
      </div>

      {/* Content */}
      <div className="p-5 space-y-3 min-h-72">
        {DEMO_STEPS.map((s, i) =>
          visible.includes(i) ? (
            <div
              key={i}
              className={`text-xs leading-relaxed animate-fade-in font-mono ${roleStyle[s.role]}`}
            >
              {s.role === 'user'     && <span className="text-primary-400 mr-2">›</span>}
              {s.role === 'thinking' && <span className="text-yellow-400/60 mr-2 text-[10px]">AI</span>}
              {s.role === 'code' ? (
                <pre className="whitespace-pre-wrap bg-white/5 rounded-lg p-3 mt-1 text-cyan-300">{s.text}</pre>
              ) : (
                s.text
              )}
            </div>
          ) : null
        )}
        {current < DEMO_STEPS.length - 1 && (
          <span className="inline-block w-2 h-[14px] bg-primary-400 animate-blink" />
        )}
      </div>
    </div>
  );
}

/* ─── Data ───────────────────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: MessageSquare, title: 'Natural Language Input',
    desc: 'Describe your system in plain English. No SQL knowledge needed — the AI handles every technical detail.',
    grad: 'from-primary-500/20 to-primary-600/5', icon_c: 'text-primary-400',
  },
  {
    icon: Sparkles, title: 'AI Schema Generator',
    desc: 'Instantly creates tables, columns, foreign keys, indexes, and data types — all optimized for MariaDB InnoDB.',
    grad: 'from-accent-500/20 to-accent-600/5', icon_c: 'text-accent-400',
  },
  {
    icon: GitBranch, title: 'Visual ER Diagrams',
    desc: 'Auto-generates Mermaid entity-relationship diagrams. Export as SVG or PNG, or edit live.',
    grad: 'from-purple-500/20 to-purple-600/5', icon_c: 'text-purple-400',
  },
  {
    icon: Layers, title: 'Smart Migrations',
    desc: 'Add, rename, or drop columns. Modify foreign key cascade rules — guided UI or AI-generated SQL.',
    grad: 'from-orange-500/20 to-orange-600/5', icon_c: 'text-orange-400',
  },
  {
    icon: Table2, title: 'Data Management',
    desc: 'Full CRUD for every table. Import/export CSV with smart column mapping and bulk operations.',
    grad: 'from-emerald-500/20 to-emerald-600/5', icon_c: 'text-emerald-400',
  },
  {
    icon: Search, title: 'Query Assistant',
    desc: 'Ask questions about your data in English. AI generates safe, read-only SELECT queries.',
    grad: 'from-pink-500/20 to-pink-600/5', icon_c: 'text-pink-400',
  },
];

const STEPS = [
  {
    n: '01', icon: MessageSquare, title: 'Describe Your System',
    desc: 'Type what you need — "Create a student enrollment system" or "Build inventory tracking". The AI understands context and intent.',
    c: 'text-primary-400', bg: 'bg-primary-500/10', border: 'border-primary-500/25',
  },
  {
    n: '02', icon: Sparkles, title: 'AI Designs the Schema',
    desc: 'Within seconds, the AI creates a full relational schema: tables, columns, foreign keys, and indexes — shown as JSON + SQL.',
    c: 'text-accent-400', bg: 'bg-accent-500/10', border: 'border-accent-500/25',
  },
  {
    n: '03', icon: Database, title: 'Execute to MariaDB',
    desc: 'Review the SQL, refine if needed, then click Execute. Your live MariaDB database is ready — start entering data immediately.',
    c: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25',
  },
];

const STATS = [
  { value: '6+',      label: 'AI-Powered Modules' },
  { value: '0',       label: 'SQL Knowledge Required' },
  { value: '<10s',    label: 'Demo Load Time' },
  { value: '1-click', label: 'Live MariaDB Sync' },
];

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function Landing() {
  useReveal();

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center grid-bg overflow-hidden">
        {/* Radial hero glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 55% at 50% -5%, rgba(99,102,241,0.20) 0%, transparent 65%)' }}
        />
        <div className="absolute top-1/3 -left-32 w-96 h-96 rounded-full bg-primary-500/5 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-32 w-80 h-80 rounded-full bg-accent-500/5  blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">

            {/* Left */}
            <div className="space-y-8">
              {/* Badge */}
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/25 text-sm text-primary-300">
                <Sparkles className="w-3.5 h-3.5" />
                AI-Powered Database Architect
              </span>

              {/* Headline */}
              <h1 className="text-5xl sm:text-[3.6rem] font-black text-white leading-[1.07] tracking-tight">
                Talk to Your{' '}
                <span className="gradient-text">Database</span>{' '}
                Before It Even{' '}
                <span className="relative inline-block">
                  Exists
                  <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 240 8" fill="none">
                    <path d="M4 6 Q60 2 120 6 T236 6" stroke="url(#ug)" strokeWidth="2.5" strokeLinecap="round" />
                    <defs>
                      <linearGradient id="ug" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%"   stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#22d3ee" />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>
              </h1>

              <p className="text-lg text-slate-400 leading-relaxed max-w-lg">
                MariaDB AI Architect converts plain English into a complete relational database —
                tables, foreign keys, indexes, and live data forms.{' '}
                <strong className="text-slate-200">No SQL knowledge required.</strong>
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 px-7 py-3.5 text-base font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-xl transition-all hover:shadow-xl hover:shadow-primary-500/30 hover:-translate-y-0.5"
                >
                  Start Building Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center gap-2 px-6 py-3.5 text-base font-semibold text-slate-300 hover:text-white border border-slate-700 hover:border-primary-500/50 rounded-xl transition-all"
                >
                  <Play className="w-4 h-4" />
                  See How It Works
                </a>
              </div>

              {/* Trust row */}
              <div className="flex flex-wrap gap-5 pt-1">
                {['Zero SQL Required', 'Local AI via Ollama', 'Live MariaDB Sync'].map(t => (
                  <span key={t} className="flex items-center gap-1.5 text-sm text-slate-400">
                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: terminal */}
            <div className="relative lg:pl-6">
              <TerminalDemo />
              <div className="absolute -top-4 -right-3 glass px-3 py-2 rounded-xl text-xs font-medium text-primary-300 border border-primary-500/20 animate-float shadow-lg">
                <Sparkles className="w-3 h-3 inline mr-1" />AI-Generated
              </div>
              <div
                className="absolute -bottom-4 -left-3 glass px-3 py-2 rounded-xl text-xs font-medium text-emerald-300 border border-emerald-500/20 animate-float shadow-lg"
                style={{ animationDelay: '1.8s' }}
              >
                <Check className="w-3 h-3 inline mr-1" />Ready to Execute
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section id="features" className="py-28 bg-slate-950/60 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 reveal">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-500/10 border border-accent-500/20 text-sm text-accent-400 mb-5">
              <Cpu className="w-3.5 h-3.5" />Core Capabilities
            </span>
            <h2 className="text-4xl font-bold text-white mb-4">
              Everything to Build{' '}
              <span className="gradient-text">Smarter Databases</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-xl mx-auto">
              Six AI-powered modules that take you from an idea to a live relational database in minutes.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="glass-card rounded-2xl p-6 reveal cursor-default"
                style={{ transitionDelay: `${i * 70}ms` }}
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${f.grad} mb-5`}>
                  <f.icon className={`w-6 h-6 ${f.icon_c}`} />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-28 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 reveal">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20 text-sm text-primary-400 mb-5">
              <Zap className="w-3.5 h-3.5" />3-Step Process
            </span>
            <h2 className="text-4xl font-bold text-white mb-4">
              From Idea to Database in{' '}
              <span className="gradient-text">Seconds</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-xl mx-auto">
              No SQL wizards. No long tutorials. Just describe what you need.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector */}
            <div className="hidden md:block absolute top-16 left-[33%] right-[33%] h-px bg-gradient-to-r from-primary-500/40 via-accent-500/40 to-primary-500/40" />

            {STEPS.map((s, i) => (
              <div key={s.n} className="reveal" style={{ transitionDelay: `${i * 130}ms` }}>
                <div className={`relative glass rounded-2xl p-8 text-center border ${s.border} hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}>
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${s.bg} border ${s.border} mb-6`}>
                    <s.icon className={`w-7 h-7 ${s.c}`} />
                  </div>
                  <div className={`absolute top-5 right-6 text-5xl font-black font-mono ${s.c} opacity-15 select-none`}>{s.n}</div>
                  <h3 className="text-xl font-semibold text-white mb-3">{s.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      <section className="py-16 bg-gradient-to-r from-primary-600/15 via-primary-500/8 to-accent-500/15 border-y border-primary-500/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {STATS.map(s => (
              <div key={s.label} className="reveal">
                <div className="text-4xl font-black gradient-text mb-1">{s.value}</div>
                <div className="text-sm text-slate-400">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo showcase ────────────────────────────────────────────────── */}
      <section id="demo" className="py-28 relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(34,211,238,0.04) 0%, transparent 70%)' }}
        />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="reveal">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 mb-6">
              <Play className="w-3.5 h-3.5" />Instant Demo Mode
            </span>
            <h2 className="text-4xl font-bold text-white mb-4">
              See It Live on <span className="gradient-text">Real Data</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-12">
              Load the complete OpenFlights dataset — airports, airlines, and global routes —
              directly into MariaDB in one click. Explore joins, filters, and AI queries instantly.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto mb-12">
              {[['7,698', 'Airports'], ['6,162', 'Airlines'], ['67,663', 'Routes']].map(([n, l]) => (
                <div key={l} className="glass-card rounded-2xl py-7 text-center">
                  <div className="text-3xl font-black gradient-text">{n}</div>
                  <div className="text-sm text-slate-400 mt-1">{l}</div>
                </div>
              ))}
            </div>

            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-xl transition-all hover:shadow-xl hover:shadow-primary-500/30 hover:-translate-y-0.5"
            >
              <Play className="w-5 h-5" />
              Launch the App
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900/25 via-slate-900 to-slate-900 pointer-events-none" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center reveal">
          <div className="glass rounded-3xl p-12 border border-primary-500/20 glow-primary">
            <Globe className="w-12 h-12 text-primary-400 mx-auto mb-6" />
            <h2 className="text-4xl font-black text-white mb-4 leading-tight">
              Ready to Build Your First<br />
              <span className="gradient-text">AI-Powered Database?</span>
            </h2>
            <p className="text-lg text-slate-400 mb-8 max-w-md mx-auto">
              No setup wizards. No credit card. No SQL textbook.<br />
              Just type and build.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-xl transition-all hover:shadow-xl hover:shadow-primary-500/30 hover:-translate-y-0.5"
              >
                Get Started Now <ArrowRight className="w-4 h-4" />
              </Link>
              <a href="#features" className="inline-flex items-center gap-2 px-6 py-4 text-base font-semibold text-slate-300 hover:text-white border border-slate-700 hover:border-primary-500/50 rounded-xl transition-all">
                Learn More <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
