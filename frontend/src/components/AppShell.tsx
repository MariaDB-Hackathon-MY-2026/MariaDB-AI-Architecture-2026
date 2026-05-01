import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Database, LogOut, MessageSquare, Search, Layers, Table2, GitBranch,
  Play, Settings as SettingsIcon, FileClock, LayoutDashboard, User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/dashboard',  label: 'Dashboard',        icon: LayoutDashboard },
  { to: '/schema',     label: 'Schema Generator', icon: MessageSquare  },
  { to: '/diagrams',   label: 'ER Diagrams',      icon: GitBranch      },
  { to: '/migrations', label: 'Migrations',       icon: Layers         },
  { to: '/data',       label: 'Data Manager',     icon: Table2         },
  { to: '/query',      label: 'Query Assistant',  icon: Search         },
  { to: '/demo',       label: 'Demo Mode',        icon: Play           },
  { to: '/audit',      label: 'Audit Log',        icon: FileClock      },
  { to: '/settings',   label: 'Settings',         icon: SettingsIcon   },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.email?.split('@')[0] ?? 'User';

  async function handleLogout() {
    await logout();
    navigate('/', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex">
      <aside className="hidden md:flex md:w-64 flex-col border-r border-slate-800 bg-slate-950/60 backdrop-blur-md">
        <Link to="/dashboard" className="flex items-center gap-2 px-5 h-16 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-primary-500/20 border border-primary-500/30 flex items-center justify-center">
            <Database className="w-4 h-4 text-primary-400" />
          </div>
          <span className="font-bold text-white text-sm">
            MariaDB&nbsp;<span className="gradient-text-primary">AI</span>
          </span>
        </Link>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-primary-500/15 text-primary-300 border border-primary-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-800 space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40">
            <div className="w-7 h-7 rounded-full bg-primary-500/30 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-primary-300" />
            </div>
            <span className="text-sm text-slate-200 truncate">{displayName}</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800">
          <div className="flex h-14 items-center justify-between px-4">
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary-500/20 border border-primary-500/30 flex items-center justify-center">
                <Database className="w-4 h-4 text-primary-400" />
              </div>
              <span className="font-bold text-white text-sm">MariaDB AI</span>
            </Link>
            <button
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/10"
            >
              Log out
            </button>
          </div>
          <nav className="flex gap-1 px-2 pb-2 overflow-x-auto">
            {NAV.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/dashboard'}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all ${
                    isActive ? 'bg-primary-500/20 text-primary-300' : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`
                }
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
