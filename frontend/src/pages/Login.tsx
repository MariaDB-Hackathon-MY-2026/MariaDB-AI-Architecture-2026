import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Database, Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, Sparkles, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type Mode = 'signin' | 'register';

export default function Login() {
  const [mode, setMode]                 = useState<Mode>('signin');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState('');
  const [info, setInfo]                 = useState('');
  const [expired, setExpired]           = useState(false);
  const [loading, setLoading]           = useState(false);
  const { login, register, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (sessionStorage.getItem('session_expired')) {
      setExpired(true);
      sessionStorage.removeItem('session_expired');
    }
  }, []);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    if (mode === 'signin') {
      const result = await login(email.trim(), password);
      setLoading(false);
      if (result.ok) {
        navigate(result.me?.has_settings ? '/dashboard' : '/settings', { replace: true });
      } else {
        setError(result.error ?? 'Login failed.');
      }
    } else {
      const result = await register(email.trim(), password);
      setLoading(false);
      if (result.ok) {
        setInfo('Account created. You can now sign in.');
        setMode('signin');
      } else {
        setError(result.error ?? 'Registration failed.');
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 grid-bg flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary-500/6 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-accent-500/5  blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8">
          ← Back to home
        </Link>

        <div className="glass rounded-3xl p-8 border border-slate-700/50 shadow-2xl shadow-black/40">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-500/15 border border-primary-500/30 mb-4 glow-primary">
              <Database className="w-8 h-8 text-primary-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              {mode === 'signin' ? 'Welcome Back' : 'Create your account'}
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              {mode === 'signin' ? 'Sign in to MariaDB AI Architect' : 'Register a new account to get started'}
            </p>
          </div>

          {expired && (
            <div className="mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-center">
              <AlertCircle className="w-3.5 h-3.5 inline text-amber-400 mr-1.5" />
              <span className="text-xs text-amber-300">Your session expired — please sign in again.</span>
            </div>
          )}

          <div className="mb-6 px-4 py-3 bg-primary-500/8 border border-primary-500/20 rounded-xl text-center">
            <Sparkles className="w-3.5 h-3.5 inline text-primary-400 mr-1.5" />
            <span className="text-xs text-primary-300">
              Local accounts — accounts persist in your MariaDB instance.
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="email">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full bg-slate-800/60 border border-slate-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 text-sm outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="password">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'min. 6 characters' : '••••••'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className="w-full bg-slate-800/60 border border-slate-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 rounded-xl pl-10 pr-10 py-3 text-white placeholder-slate-500 text-sm outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
            {info && !error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <p className="text-sm text-emerald-300">{info}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 text-base font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-xl transition-all hover:shadow-lg hover:shadow-primary-500/25 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 hover:-translate-y-0.5"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  {mode === 'signin' ? 'Signing in…' : 'Creating account…'}
                </>
              ) : mode === 'signin' ? (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              ) : (
                <>Create account <UserPlus className="w-4 h-4" /></>
              )}
            </button>

            <button
              type="button"
              onClick={() => { setMode(m => m === 'signin' ? 'register' : 'signin'); setError(''); setInfo(''); }}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              {mode === 'signin' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          MariaDB AI Architect — Tournament Edition
        </p>
      </div>
    </div>
  );
}
