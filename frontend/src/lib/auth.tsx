import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { http, setToken, getToken, setStoredUser, getStoredUser } from './api';
import type { AuthUser, Permissions, PumpInfo, UserRole } from './types';

export const DEFAULT_PERMISSIONS: Permissions = {
  dashboard: true,
  sales: true,
  fuels: false,
  stock: false,
  shifts: true,
  customers: true,
  expenses: false,
  purchases: false,
  suppliers: false,
  reports: true,
  users: false,
  settings: false,
  manageAllShifts: false,
};

interface LoginOptions {
  remember?: boolean;
}

interface LoginPayload {
  token: string;
  user: { id: string; name: string; email: string; role: UserRole };
  pump: PumpInfo;
}

interface AuthState {
  user: AuthUser | null;
  pump: PumpInfo | null;
  permissions: Permissions;
  loading: boolean;
  initialised: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  can: (key: keyof Permissions) => boolean;
}

export interface RegisterPayload {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  password: string;
  confirmPassword: string;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser<AuthUser>());
  const [pump, setPump] = useState<PumpInfo | null>(() => null);
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(false);
  const [initialised, setInitialised] = useState(false);

  const clear = useCallback(() => {
    setToken(null);
    setStoredUser(null);
    setUser(null);
    setPump(null);
    setPermissions(DEFAULT_PERMISSIONS);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      clear();
      setInitialised(true);
      return;
    }
    try {
      const data = await http.get<{ user: AuthUser; pump: PumpInfo; permissions: Permissions }>('/auth/me');
      setUser(data.user);
      setPump(data.pump);
      setPermissions({ ...DEFAULT_PERMISSIONS, ...data.permissions });
      setStoredUser(data.user);
    } catch {
      clear();
    } finally {
      setInitialised(true);
    }
  }, [clear]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string, remember = true) => {
    setLoading(true);
    try {
      const data = await http.post<LoginPayload>('/auth/login', { email, password });
      setToken(data.token, remember);
      setUser({ ...data.user, role: data.user.role });
      setPump(data.pump);
      setStoredUser(data.user);
      // permissions come from the server on the next /auth/me call
      const me = await http.get<{ user: AuthUser; pump: PumpInfo; permissions: Permissions }>('/auth/me');
      setUser(me.user);
      setPump(me.pump);
      setPermissions({ ...DEFAULT_PERMISSIONS, ...me.permissions });
      setStoredUser(me.user);
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    setLoading(true);
    try {
      const data = await http.post<LoginPayload>('/auth/register', payload);
      setToken(data.token);
      setUser(data.user);
      setPump(data.pump);
      setStoredUser(data.user);
      const me = await http.get<{ user: AuthUser; pump: PumpInfo; permissions: Permissions }>('/auth/me');
      setUser(me.user);
      setPump(me.pump);
      setPermissions({ ...DEFAULT_PERMISSIONS, ...me.permissions });
      setStoredUser(me.user);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    // best effort notify the server, then always clear local state
    void fetch('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    }).catch(() => undefined);
    clear();
  }, [clear]);

  const can = useCallback((key: keyof Permissions) => Boolean(permissions[key]), [permissions]);

  const value = useMemo(
    () => ({ user, pump, permissions, loading, initialised, login, register, logout, refresh, can }),
    [user, pump, permissions, loading, initialised, login, register, logout, refresh, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
