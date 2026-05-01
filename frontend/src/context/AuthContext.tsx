import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { jsonFetch, MeResponse, setUnauthorizedHandler } from '../lib/api';

interface AuthContextType {
  user: MeResponse | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string; me?: MeResponse }>;
  register: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await jsonFetch<MeResponse>('/auth/me', { method: 'GET' });
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      sessionStorage.setItem('session_expired', '1');
      setUser(null);
    });
    return () => setUnauthorizedHandler(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await jsonFetch<MeResponse>('/auth/me', { method: 'GET' });
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string) {
    try {
      const me = await jsonFetch<MeResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setUser(me);
      return { ok: true, me };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async function register(email: string, password: string) {
    try {
      await jsonFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async function logout() {
    try {
      await jsonFetch('/auth/logout', { method: 'POST', body: '{}' });
    } catch {
      // ignore — clearing local state is what matters
    }
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
