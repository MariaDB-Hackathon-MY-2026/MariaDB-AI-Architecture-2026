import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Database, Cpu, Save, Plug, CheckCircle2, DatabaseZap, Lock, Eye, EyeOff } from 'lucide-react';
import { jsonFetch, UserSettingsModel } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import StatusBanner from '../components/StatusBanner';

const DEFAULTS: UserSettingsModel = {
  mariadb_host: '127.0.0.1',
  mariadb_port: 3306,
  mariadb_user: 'root',
  mariadb_password: '',
  mariadb_database: 'mariadb_ai_architect',
  ollama_base_url: 'http://127.0.0.1:11434',
  ollama_model: 'qwen2.5-coder:7b',
};

export default function SettingsPage() {
  const { refresh, user } = useAuth();
  const [draft, setDraft] = useState<UserSettingsModel | null>(null);
  const [testDb, setTestDb] = useState<string | null>(null);
  const [testOllama, setTestOllama] = useState<string | null>(null);
  const [ensureMsg, setEnsureMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await jsonFetch<UserSettingsModel>('/settings', { method: 'GET' });
        setDraft(s);
      } catch (err) {
        setErrorText(err instanceof Error ? err.message : String(err));
        setDraft(DEFAULTS);
      }
    })();
  }, []);

  async function testMariaDb() {
    if (!draft) return;
    setErrorText(null); setStatusText(null); setTestDb(null); setIsLoading(true);
    try {
      const out = await jsonFetch<{ ok: boolean; message: string }>('/settings/test-db', {
        method: 'POST', body: JSON.stringify(draft),
      });
      setTestDb(out.message || 'OK');
      setStatusText('MariaDB connection OK.');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function testOllamaConn() {
    if (!draft) return;
    setErrorText(null); setStatusText(null); setTestOllama(null); setIsLoading(true);
    try {
      await jsonFetch('/settings/test-ollama', { method: 'POST', body: JSON.stringify(draft) });
      setTestOllama('OK');
      setStatusText('Ollama OK.');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function ensureDb() {
    setErrorText(null); setStatusText(null); setEnsureMsg(null); setIsLoading(true);
    try {
      const out = await jsonFetch<{ ok: boolean; message: string }>('/db/ensure', { method: 'POST', body: '{}' });
      setEnsureMsg(out.message || 'Database ready.');
      setStatusText('Database ensured successfully.');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  async function changePassword() {
    setPwError(null); setPwSuccess(false);
    if (!currentPw) { setPwError('Enter your current password.'); return; }
    if (newPw.length < 6) { setPwError('New password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('New passwords do not match.'); return; }
    setPwLoading(true);
    try {
      await jsonFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      setPwSuccess(true);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : String(err));
    } finally { setPwLoading(false); }
  }

  async function save() {
    if (!draft) return;
    setErrorText(null); setStatusText(null); setIsLoading(true);
    try {
      await jsonFetch('/settings', { method: 'POST', body: JSON.stringify(draft) });
      setStatusText('Settings saved.');
      setTestDb(null); setTestOllama(null);
      await refresh();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally { setIsLoading(false); }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-primary-400" /> Settings
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Per-user MariaDB connection and Ollama model. Saved to your account.
        </p>
      </header>

      <StatusBanner error={errorText} status={statusText} />

      {!draft ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-300">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Database className="w-4 h-4 text-primary-400" /> MariaDB connection
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Host" value={draft.mariadb_host} onChange={(v) => setDraft({ ...draft, mariadb_host: v })} />
              <Field label="Port" type="number" value={String(draft.mariadb_port)} onChange={(v) => setDraft({ ...draft, mariadb_port: Number(v || '3306') })} />
              <Field label="User" value={draft.mariadb_user} onChange={(v) => setDraft({ ...draft, mariadb_user: v })} />
              <Field label="Database" value={draft.mariadb_database} onChange={(v) => setDraft({ ...draft, mariadb_database: v })} />
              <Field label="Password" type="password" className="sm:col-span-2" value={draft.mariadb_password} onChange={(v) => setDraft({ ...draft, mariadb_password: v })} />
            </div>
            {testDb ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-2 text-xs text-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> {testDb}
              </div>
            ) : null}
            {ensureMsg ? (
              <div className="flex items-center gap-2 rounded-lg border border-primary-500/30 bg-primary-950/30 p-2 text-xs text-primary-200">
                <DatabaseZap className="w-3.5 h-3.5" /> {ensureMsg}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void testMariaDb()}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                disabled={isLoading}
              >
                <Plug className="w-4 h-4" /> Test MariaDB
              </button>
              <button
                onClick={() => void ensureDb()}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                disabled={isLoading || !user?.has_settings}
                title={!user?.has_settings ? 'Save settings first, then use this to create the database if it does not exist.' : 'Create the configured database if it does not exist yet.'}
              >
                <DatabaseZap className="w-4 h-4" /> Create database
              </button>
            </div>
            {!user?.has_settings && (
              <p className="text-xs text-slate-500">Save settings first to enable "Create database".</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Cpu className="w-4 h-4 text-accent-400" /> Ollama
            </div>
            <div className="grid grid-cols-1 gap-3">
              <Field label="Base URL" value={draft.ollama_base_url} onChange={(v) => setDraft({ ...draft, ollama_base_url: v })} />
              <Field label="Model" value={draft.ollama_model} onChange={(v) => setDraft({ ...draft, ollama_model: v })} />
            </div>
            {testOllama ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-2 text-xs text-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> Ollama reachable.
              </div>
            ) : null}
            <button
              onClick={() => void testOllamaConn()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              disabled={isLoading}
            >
              <Plug className="w-4 h-4" /> Test Ollama
            </button>
          </div>

          <div className="lg:col-span-2 flex justify-end">
            <button
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              disabled={isLoading}
            >
              <Save className="w-4 h-4" /> Save settings
            </button>
          </div>

          {/* Security */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Lock className="w-4 h-4 text-rose-400" /> Change password
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <PwField label="Current password" value={currentPw} onChange={setCurrentPw} show={showPw} />
              <PwField label="New password"     value={newPw}     onChange={setNewPw}     show={showPw} />
              <PwField label="Confirm new"      value={confirmPw} onChange={setConfirmPw} show={showPw} />
            </div>

            {pwError && (
              <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Password changed successfully.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => void changePassword()}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                disabled={pwLoading || !currentPw || !newPw || !confirmPw}
              >
                <Lock className="w-4 h-4" /> {pwLoading ? 'Changing…' : 'Change password'}
              </button>
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                {showPw ? <><EyeOff className="w-3.5 h-3.5 inline mr-1" />Hide</> : <><Eye className="w-3.5 h-3.5 inline mr-1" />Show passwords</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, type, className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'password' | 'number';
  className?: string;
}) {
  return (
    <label className={`text-xs text-slate-300 ${className ?? ''}`}>
      {label}
      <input
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500"
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function PwField({ label, value, onChange, show }: {
  label: string; value: string; onChange: (v: string) => void; show: boolean;
}) {
  return (
    <label className="text-xs text-slate-300">
      {label}
      <input
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
      />
    </label>
  );
}
