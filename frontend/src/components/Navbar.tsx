import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Database, Menu, X, LogOut, User, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV_LINKS = [
  { label: 'Features',     href: '/#features'      },
  { label: 'How It Works', href: '/#how-it-works'  },
  { label: 'Demo',         href: '/#demo'           },
];

export default function Navbar() {
  const [scrolled,    setScrolled]    = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  function handleLogout() {
    logout();
    navigate('/');
    setMobileOpen(false);
  }

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-slate-900/95 backdrop-blur-md border-b border-white/5 shadow-xl shadow-black/30'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-primary-500/20 border border-primary-500/40 flex items-center justify-center group-hover:bg-primary-500/30 transition-colors">
              <Database className="w-4 h-4 text-primary-400" />
            </div>
            <span className="font-bold text-white text-sm">
              MariaDB&nbsp;<span className="gradient-text-primary">AI</span>
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(l => (
              <a
                key={l.label}
                href={l.href}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-all"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Desktop right */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-white/5 transition-all"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-500/10 border border-primary-500/20">
                  <div className="w-6 h-6 rounded-full bg-primary-500/30 flex items-center justify-center">
                    <User className="w-3 h-3 text-primary-300" />
                  </div>
                  <span className="text-sm text-slate-300">{user.email?.split('@')[0]}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-all"
                  title="Log out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
                >
                  Log In
                </Link>
                <Link
                  to="/login"
                  className="px-5 py-2 text-sm font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-xl transition-all hover:shadow-lg hover:shadow-primary-500/25 hover:-translate-y-0.5"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
            onClick={() => setMobileOpen(v => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-slate-800 py-3 pb-4 space-y-1">
            {NAV_LINKS.map(l => (
              <a
                key={l.label}
                href={l.href}
                className="block px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <div className="pt-2 border-t border-slate-800 mt-2">
              {user ? (
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  Log Out
                </button>
              ) : (
                <Link
                  to="/login"
                  className="block px-4 py-2.5 text-sm font-semibold text-white bg-primary-500 rounded-xl text-center"
                  onClick={() => setMobileOpen(false)}
                >
                  Get Started
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
