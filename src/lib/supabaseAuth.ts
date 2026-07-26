import { supabasePublishableKey, supabaseUrl } from './supabaseConfig';

const SESSION_STORAGE_KEY = 'taiwan-trip-planner:supabase-session';
const SESSION_EXPIRY_BUFFER_SECONDS = 60;
let pendingSessionRestore: Promise<AuthSession | null> | null = null;

export interface AuthUser {
  id: string;
  email?: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
}

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface AuthSessionResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  user: AuthUser;
}

function authHeaders(accessToken?: string): HeadersInit {
  return {
    apikey: supabasePublishableKey,
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { msg?: string; message?: string; error_description?: string };
    return payload.error_description ?? payload.message ?? payload.msg ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function persistSession(session: AuthSession): void {
  const stored: StoredSession = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
  };
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored));
}

function clearStoredSession(): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function readStoredSession(): StoredSession | null {
  try {
    const value = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<StoredSession>;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

function sessionFromResponse(response: AuthSessionResponse): AuthSession {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: response.expires_at ?? Math.floor(Date.now() / 1000) + response.expires_in,
    user: response.user,
  };
}

async function fetchUser(accessToken: string): Promise<AuthUser> {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: authHeaders(accessToken),
  });

  if (!response.ok) throw new Error(await parseError(response));
  return (await response.json()) as AuthUser;
}

export async function refreshAuthSession(refreshToken: string): Promise<AuthSession> {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) throw new Error(await parseError(response));
  const session = sessionFromResponse((await response.json()) as AuthSessionResponse);
  persistSession(session);
  return session;
}

function readSessionFromRedirect(): StoredSession | null {
  if (!window.location.hash) return null;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const error = params.get('error_description') ?? params.get('error');
  if (error) {
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    throw new Error(error);
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresAt = Number(params.get('expires_at'));
  const expiresIn = Number(params.get('expires_in'));

  if (!accessToken || !refreshToken) return null;

  window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
  return {
    accessToken,
    refreshToken,
    expiresAt: Number.isFinite(expiresAt) && expiresAt > 0
      ? expiresAt
      : Math.floor(Date.now() / 1000) + (Number.isFinite(expiresIn) ? expiresIn : 3600),
  };
}

async function performSessionRestore(): Promise<AuthSession | null> {
  const redirectSession = readSessionFromRedirect();
  const stored = redirectSession ?? readStoredSession();
  if (!stored) return null;

  try {
    if (stored.expiresAt <= Math.floor(Date.now() / 1000) + SESSION_EXPIRY_BUFFER_SECONDS) {
      return await refreshAuthSession(stored.refreshToken);
    }

    const session: AuthSession = {
      ...stored,
      user: await fetchUser(stored.accessToken),
    };
    persistSession(session);
    return session;
  } catch {
    try {
      return await refreshAuthSession(stored.refreshToken);
    } catch {
      clearStoredSession();
      return null;
    }
  }
}

export function restoreSession(): Promise<AuthSession | null> {
  if (!pendingSessionRestore) {
    pendingSessionRestore = performSessionRestore().finally(() => {
      pendingSessionRestore = null;
    });
  }
  return pendingSessionRestore;
}

export async function sendMagicLink(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const response = await fetch(
    `${supabaseUrl}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email, create_user: true }),
    },
  );

  if (!response.ok) throw new Error(await parseError(response));
}

export async function signOutSession(accessToken: string): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/auth/v1/logout`, {
      method: 'POST',
      headers: authHeaders(accessToken),
    });
  } finally {
    clearStoredSession();
  }
}
