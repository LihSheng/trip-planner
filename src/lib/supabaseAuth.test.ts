import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshAuthSession, restoreSession, sendMagicLink, signOutSession } from './supabaseAuth';

const fetchMock = vi.fn();
const sessionKey = 'taiwan-trip-planner:supabase-session';

describe('Supabase auth client', () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState({}, '', '/');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  it('restores an active stored session and persists its user-less form', async () => {
    localStorage.setItem(sessionKey, JSON.stringify({ accessToken: 'access', refreshToken: 'refresh', expiresAt: 4_000_000_000 }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'user-1', email: 'me@example.com' }), { status: 200 }));

    await expect(restoreSession()).resolves.toMatchObject({ accessToken: 'access', user: { email: 'me@example.com' } });
    expect(JSON.parse(localStorage.getItem(sessionKey) ?? '{}')).not.toHaveProperty('user');
  });

  it('refreshes expired sessions and clears storage when both restore paths fail', async () => {
    localStorage.setItem(sessionKey, JSON.stringify({ accessToken: 'access', refreshToken: 'refresh', expiresAt: 1 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'new', refresh_token: 'new-refresh', expires_in: 3600, user: { id: 'u' } }), { status: 200 }));
    await expect(restoreSession()).resolves.toMatchObject({ accessToken: 'new' });

    localStorage.setItem(sessionKey, JSON.stringify({ accessToken: 'bad', refreshToken: 'bad-refresh', expiresAt: 4_000_000_000 }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(restoreSession()).resolves.toBeNull();
    expect(localStorage.getItem(sessionKey)).toBeNull();
  });

  it('processes redirect sessions and sends authentication requests', async () => {
    history.replaceState({}, '', '/#access_token=redirect&refresh_token=refresh&expires_at=4000000000');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'redirect-user' }), { status: 200 }));
    await expect(restoreSession()).resolves.toMatchObject({ accessToken: 'redirect' });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(new Response(null, { status: 200 }));
    await sendMagicLink('friend@example.com');
    await signOutSession('token');
    expect(fetchMock.mock.calls[1][0]).toContain('/otp?redirect_to=');
    expect(fetchMock.mock.calls[2][0]).toContain('/logout');
  });

  it('shares a redirect restore across concurrent Strict Mode effects', async () => {
    history.replaceState({}, '', '/#access_token=redirect&refresh_token=refresh&expires_at=4000000000');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'redirect-user' }), { status: 200 }));

    const firstRestore = restoreSession();
    const secondRestore = restoreSession();

    await expect(Promise.all([firstRestore, secondRestore])).resolves.toEqual([
      expect.objectContaining({ accessToken: 'redirect' }),
      expect.objectContaining({ accessToken: 'redirect' }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('');
  });

  it('persists a refreshed session', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ access_token: 'new', refresh_token: 'refresh', expires_in: 3600, user: { id: 'u' } }), { status: 200 }));
    await refreshAuthSession('refresh');
    expect(JSON.parse(localStorage.getItem(sessionKey) ?? '{}')).toMatchObject({ accessToken: 'new' });
  });
});
