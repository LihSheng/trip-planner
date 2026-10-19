import type { AuthKind } from '../context/AuthContext';
import {
  finalizeOptions,
  type LatLng,
  type RawTransitOption,
  type TransitDeparture,
  type TransitLookup,
  type TransitProviderId,
  type TransitStep,
  type TransitStepKind,
} from '../domain/transit';
import { supabasePublishableKey, supabaseUrl } from './supabaseConfig';
import { mockDepartAt, mockTransitOptions } from './transitMock';

export interface TransitRequest { from: LatLng; to: LatLng; departure: TransitDeparture }

export type TransitLookupError =
  | { kind: 'limitReached'; resetsAt?: string }
  | { kind: 'busy' }
  | { kind: 'offline' }
  | { kind: 'unavailable'; requestId?: string };

export type TransitLookupResult = { ok: true; lookup: TransitLookup } | { ok: false; error: TransitLookupError };

export interface TransitLookupOptions {
  /** Aborting only stops this caller's wait: the request still finishes and fills the cache. */
  signal?: AbortSignal;
  /** Skip the session cache and replace its entry, for an explicit refresh. */
  fresh?: boolean;
}

export interface TransitClient {
  readonly provider: TransitProviderId;
  /** Never rejects for expected failures. Successful results are shared for the session unless `fresh` is set. */
  lookup(request: TransitRequest, options?: TransitLookupOptions): Promise<TransitLookupResult>;
}

const STEP_KINDS: readonly TransitStepKind[] = ['walk', 'bus', 'tram', 'metro', 'rail', 'highSpeedRail', 'ferry', 'cableCar', 'other'];
const MOCK_DELAY_MS = 300;

const sessionCache = new Map<string, Promise<TransitLookupResult>>();

/** Test seam: forget every cached lookup. */
export function resetTransitSessionCache() {
  sessionCache.clear();
}

function cacheKey(provider: TransitProviderId, request: TransitRequest, now: number) {
  const point = ({ lat, lng }: LatLng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;
  // "Now" means a different departure every few minutes, so it is bucketed rather than cached for the session.
  const departure = request.departure.kind === 'planned' ? request.departure.local : `now@${Math.floor(now / 300_000)}`;
  return `${provider}|${point(request.from)}|${point(request.to)}|${departure}`;
}

function cached(provider: TransitProviderId, run: (request: TransitRequest) => Promise<TransitLookupResult>): TransitClient['lookup'] {
  return (request, { signal, fresh = false } = {}) => {
    const key = cacheKey(provider, request, Date.now());
    let pending = fresh ? undefined : sessionCache.get(key);
    if (!pending) {
      const started: Promise<TransitLookupResult> = run(request).then((result) => {
        // A fresh lookup may have replaced this entry since; only drop our own failure.
        if (!result.ok && sessionCache.get(key) === started) sessionCache.delete(key);
        return result;
      });
      pending = started;
      sessionCache.set(key, pending);
    }
    if (!signal) return pending;
    return new Promise<TransitLookupResult>((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      void pending.then(resolve);
    });
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isMinutes = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const optionalString = (value: unknown) => value === undefined || typeof value === 'string';
const optionalNumber = (value: unknown) => value === undefined || (typeof value === 'number' && Number.isFinite(value));

function parseStep(value: unknown): TransitStep | null {
  if (!isRecord(value) || typeof value.kind !== 'string' || !isMinutes(value.minutes)) return null;
  const { line, fromStop, toStop, stopCount, distanceMeters } = value;
  if (![line, fromStop, toStop].every(optionalString) || ![stopCount, distanceMeters].every(optionalNumber)) return null;
  // A kind added on the server before this client learns it still shows, as "other".
  const kind = (STEP_KINDS as readonly string[]).includes(value.kind) ? value.kind as TransitStepKind : 'other';
  const step: TransitStep = { kind, minutes: value.minutes };
  if (line !== undefined) step.line = line as string;
  if (fromStop !== undefined) step.fromStop = fromStop as string;
  if (toStop !== undefined) step.toStop = toStop as string;
  if (stopCount !== undefined) step.stopCount = stopCount as number;
  if (distanceMeters !== undefined) step.distanceMeters = distanceMeters as number;
  return step;
}

function parseOption(value: unknown): RawTransitOption | null {
  if (!isRecord(value) || !isMinutes(value.minutes) || !Array.isArray(value.steps)) return null;
  const steps = value.steps.map(parseStep);
  return steps.every((step): step is TransitStep => step !== null) ? { minutes: value.minutes, steps } : null;
}

/** Boundary validation of the transit-routes 200 body. Null on any shape violation. */
export function parseTransitRoutesResponse(body: unknown, request: TransitRequest): TransitLookup | null {
  if (!isRecord(body) || body.version !== 1 || body.provider !== 'transitous') return null;
  if (typeof body.departAt !== 'string' || typeof body.fetchedAt !== 'string' || !Array.isArray(body.options)) return null;
  const options = body.options.map(parseOption);
  if (!options.every((option): option is RawTransitOption => option !== null)) return null;
  return {
    provider: body.provider,
    fetchedAt: body.fetchedAt,
    basis: { from: request.from, to: request.to, departAt: body.departAt },
    options: finalizeOptions(options),
  };
}

function errorFor(status: number, body: unknown): TransitLookupError {
  const record = isRecord(body) ? body : {};
  const code = record.code;
  if (status === 429 && code === 'TRANSIT_LIMIT_REACHED') {
    return typeof record.resetsAt === 'string' ? { kind: 'limitReached', resetsAt: record.resetsAt } : { kind: 'limitReached' };
  }
  if (status === 503 && code === 'TRANSIT_BUSY') return { kind: 'busy' };
  return typeof record.requestId === 'string' ? { kind: 'unavailable', requestId: record.requestId } : { kind: 'unavailable' };
}

async function edgeLookup(accessToken: string, request: TransitRequest): Promise<TransitLookupResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, error: { kind: 'offline' } };
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/transit-routes`, {
      method: 'POST',
      headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    return { ok: false, error: { kind: 'offline' } };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: errorFor(response.status, body) };
  const lookup = parseTransitRoutesResponse(body, request);
  return lookup ? { ok: true, lookup } : { ok: false, error: errorFor(response.status, body) };
}

function edgeClient(accessToken: string): TransitClient {
  return { provider: 'transitous', lookup: cached('transitous', (request) => edgeLookup(accessToken, request)) };
}

const mockClient: TransitClient = {
  provider: 'mock',
  lookup: cached('mock', async (request) => {
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
    const now = new Date();
    return {
      ok: true,
      lookup: {
        provider: 'mock',
        fetchedAt: now.toISOString(),
        basis: { from: request.from, to: request.to, departAt: mockDepartAt(request.departure, now) },
        options: finalizeOptions(mockTransitOptions(request.from, request.to)),
      },
    };
  }),
};

/** Decision 14: signed-in users go through the edge function, demo uses the mock, share-link guests only read saved routes. */
export function transitClientFor(auth: { kind: AuthKind; accessToken: string }): TransitClient | null {
  if (auth.kind === 'signedIn') return edgeClient(auth.accessToken);
  return auth.kind === 'demo' ? mockClient : null;
}
