import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTransitSessionCache, transitClientFor, type TransitClient, type TransitRequest } from './transitClient';

const request: TransitRequest = {
  from: { lat: 25.0339, lng: 121.5645 },
  to: { lat: 25.0372, lng: 121.4999 },
  departure: { kind: 'planned', local: '2026-10-21T10:30' },
};

const okBody = {
  version: 1,
  provider: 'transitous',
  departAt: '2026-10-21T10:30:00+08:00',
  timeZone: 'Asia/Taipei',
  fetchedAt: '2026-10-19T02:00:00.000Z',
  options: [
    { minutes: 40, steps: [{ kind: 'walk', minutes: 5 }, { kind: 'bus', minutes: 35, line: '307', fromStop: 'A', toStop: 'B', stopCount: 12 }] },
    { minutes: 24, steps: [{ kind: 'walk', minutes: 4 }, { kind: 'metro', minutes: 20, line: 'BL', stopCount: 5 }] },
    { minutes: 30, steps: [{ kind: 'gondolaLift', minutes: 30, line: 'Maokong' }] },
  ],
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
let client: TransitClient;

beforeEach(() => {
  resetTransitSessionCache();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  client = transitClientFor({ kind: 'signedIn', accessToken: 'token-1' })!;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('transitClientFor', () => {
  it('uses the edge for signed-in users, the mock for demo, and nothing for share-link guests', () => {
    expect(transitClientFor({ kind: 'signedIn', accessToken: 't' })?.provider).toBe('transitous');
    expect(transitClientFor({ kind: 'demo', accessToken: '' })?.provider).toBe('mock');
    expect(transitClientFor({ kind: 'sharedViewer', accessToken: '' })).toBeNull();
  });
});

describe('edge transit client', () => {
  it('posts the request with the user token and parses the answer into a lookup', async () => {
    fetchMock.mockResolvedValue(json(200, okBody));
    const result = await client.lookup(request);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/functions\/v1\/transit-routes$/);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body as string)).toEqual(request);
    expect(result).toEqual({
      ok: true,
      lookup: {
        provider: 'transitous',
        fetchedAt: '2026-10-19T02:00:00.000Z',
        basis: { from: request.from, to: request.to, departAt: '2026-10-21T10:30:00+08:00' },
        options: [
          { signature: 'metro:BL', minutes: 24, steps: [{ kind: 'walk', minutes: 4 }, { kind: 'metro', minutes: 20, line: 'BL', stopCount: 5 }] },
          { signature: 'other:Maokong', minutes: 30, steps: [{ kind: 'other', minutes: 30, line: 'Maokong' }] },
          { signature: 'bus:307', minutes: 40, steps: [{ kind: 'walk', minutes: 5 }, { kind: 'bus', minutes: 35, line: '307', fromStop: 'A', toStop: 'B', stopCount: 12 }] },
        ],
      },
    });
  });

  it('treats empty options as a valid answer', async () => {
    fetchMock.mockResolvedValue(json(200, { ...okBody, options: [] }));
    const result = await client.lookup(request);
    expect(result.ok && result.lookup.options).toEqual([]);
  });

  it.each([
    [429, { code: 'TRANSIT_LIMIT_REACHED', message: 'x', requestId: 'r1', retryable: false, resetsAt: '2026-10-20T02:00:00.000Z' }, { kind: 'limitReached', resetsAt: '2026-10-20T02:00:00.000Z' }],
    [503, { code: 'TRANSIT_BUSY', message: 'x', requestId: 'r2', retryable: true }, { kind: 'busy' }],
    [401, { code: 'AUTH_REQUIRED', message: 'x', requestId: 'r3', retryable: false }, { kind: 'unavailable', requestId: 'r3' }],
    [400, { code: 'INVALID_REQUEST', message: 'x', requestId: 'r4', retryable: false }, { kind: 'unavailable', requestId: 'r4' }],
    [502, { code: 'PROVIDER_UNAVAILABLE', message: 'x', requestId: 'r5', retryable: true }, { kind: 'unavailable', requestId: 'r5' }],
    [500, { code: 'INTERNAL_ERROR', message: 'x', requestId: 'r6', retryable: true }, { kind: 'unavailable', requestId: 'r6' }],
    [200, { version: 2, options: [] }, { kind: 'unavailable' }],
  ])('maps a %i answer to an error without rejecting', async (status, body, error) => {
    fetchMock.mockResolvedValue(json(status, body));
    await expect(client.lookup(request)).resolves.toEqual({ ok: false, error });
  });

  it('reports unavailable when the request fails while the browser is online', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(client.lookup(request)).resolves.toEqual({ ok: false, error: { kind: 'unavailable' } });
  });

  it('reports offline when the request fails because the connection dropped', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get');
    fetchMock.mockImplementation(async () => {
      onLine.mockReturnValue(false);
      throw new TypeError('Failed to fetch');
    });
    await expect(client.lookup(request)).resolves.toEqual({ ok: false, error: { kind: 'offline' } });
    onLine.mockRestore();
  });

  it('shares one request per leg and departure for the session', async () => {
    fetchMock.mockResolvedValue(json(200, okBody));
    const [first, second] = await Promise.all([client.lookup(request), client.lookup(request)]);
    const third = await transitClientFor({ kind: 'signedIn', accessToken: 'token-2' })!.lookup({
      ...request,
      from: { lat: 25.03392, lng: 121.56451 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);

    fetchMock.mockResolvedValue(json(200, okBody));
    await client.lookup({ ...request, departure: { kind: 'planned', local: '2026-10-21T11:30' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks the server again on a fresh lookup and keeps that answer for later lookups', async () => {
    fetchMock.mockResolvedValueOnce(json(200, okBody));
    fetchMock.mockResolvedValueOnce(json(200, { ...okBody, fetchedAt: '2026-10-19T08:00:00.000Z' }));
    await client.lookup(request);

    const refreshed = await client.lookup(request, { fresh: true });
    const later = await client.lookup(request);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshed.ok && refreshed.lookup.fetchedAt).toBe('2026-10-19T08:00:00.000Z');
    expect(later).toBe(refreshed);
  });

  it('does not keep failures, so the next lookup asks again', async () => {
    fetchMock.mockResolvedValueOnce(json(503, { code: 'TRANSIT_BUSY', message: 'x', requestId: 'r', retryable: true }));
    fetchMock.mockResolvedValueOnce(json(200, okBody));
    expect((await client.lookup(request)).ok).toBe(false);
    expect((await client.lookup(request)).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lets a caller stop waiting while the shared request still fills the cache', async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { answer = resolve; }));
    const controller = new AbortController();
    const waiting = client.lookup(request, { signal: controller.signal });
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });

    answer(json(200, okBody));
    expect((await client.lookup(request)).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
