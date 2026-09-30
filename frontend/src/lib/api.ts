import axios, { AxiosError } from 'axios';

/**
 * Base URL for the API.
 * - VITE_API_URL env var takes priority (set in Vercel Dashboard)
 * - In production, falls back to the deployed backend on Vercel
 * - In development, the Vite dev server proxies /api to the Express backend
 */
const PROD_API = 'https://pms-q8s4.vercel.app/api/v1';
const isDev = import.meta.env.DEV;

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (isDev ? '/api/v1' : PROD_API),
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

const TOKEN_KEY = 'bk_petrol_token';
const USER_KEY = 'bk_petrol_user';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * "Remember me" keeps the token in localStorage (persists across browser
 * restarts); otherwise it goes to sessionStorage (cleared when the tab closes).
 */
export function setToken(token: string | null, remember = true): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (token) {
      if (remember) localStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.setItem(TOKEN_KEY, token);
    }
  } catch {
    /* storage unavailable */
  }
}

export function setRememberPreference(remember: boolean): void {
  try {
    const token = getToken();
    if (token) setToken(token, remember);
  } catch {
    /* ignore */
  }
}

export function getRememberPreference(): boolean {
  try {
    return localStorage.getItem(TOKEN_KEY) !== null;
  } catch {
    return true;
  }
}

export function getStoredUser<T>(): T | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: unknown): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface ApiErrorBody {
  message: string;
  code?: string;
  errors?: Array<{ field?: string; message: string }>;
}

/** Normalises any failure into a readable message (never leaks internals). */
export function toErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<ApiErrorBody>;
    if (!err.response) {
      if (err.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
      return 'Cannot reach the server. Check your connection and try again.';
    }
    const body = err.response.data;
    if (body?.errors?.length) return body.errors[0]?.message ?? body.message ?? fallback;
    return body?.message || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

/** Extracts field level validation errors keyed by field name. */
export function fieldErrors(error: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (axios.isAxiosError(error)) {
    const body = (error as AxiosError<ApiErrorBody>).response?.data;
    for (const e of body?.errors ?? []) {
      if (e.field) out[e.field] = e.message;
    }
  }
  return out;
}

export const http = {
  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const res = await api.get<{ success: true; data: T }>(url, { params });
    return res.data.data;
  },
  async post<T>(url: string, body?: unknown): Promise<T> {
    const res = await api.post<{ success: true; data: T }>(url, body);
    return res.data.data;
  },
  async patch<T>(url: string, body?: unknown): Promise<T> {
    const res = await api.patch<{ success: true; data: T }>(url, body);
    return res.data.data;
  },
  async del<T>(url: string): Promise<T> {
    const res = await api.delete<{ success: true; data: T }>(url);
    return res.data.data;
  },
};

/**
 * Fetch a paginated endpoint and return just the rows.
 * List endpoints answer with `{ items, meta }`, so dropdown-style lookups go
 * through this helper instead of parsing the envelope themselves.
 */
export async function list<T>(url: string, params?: Record<string, unknown>): Promise<T[]> {
  const res = await api.get<{ success: true; data: { items: T[] } }>(url, { params });
  return res.data.data.items ?? [];
}
