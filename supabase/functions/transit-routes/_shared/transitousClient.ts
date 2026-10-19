import type { LatLng } from './transitRequest.ts';

// Transitous usage policy: the User-Agent names the app, its version and a contact URL.
export const TRANSITOUS_USER_AGENT = 'trip-planner/0.1 (+https://github.com/LihSheng/trip-planner)';
export const TRANSITOUS_TIMEOUT_MS = 10_000;

export interface PlanQuery {
  from: LatLng;
  to: LatLng;
  departAt: Date;
}

export type PlanResult =
  | { ok: true; body: unknown }
  | { ok: false; reason: 'rateLimited' | 'unavailable' | 'invalidJson'; status: number | null };

export function transitousPlanUrl(baseUrl: string, query: PlanQuery): string {
  const params = [
    `fromPlace=${query.from.lat},${query.from.lng}`,
    `toPlace=${query.to.lat},${query.to.lng}`,
    `time=${query.departAt.toISOString().replace(/\.\d{3}Z$/, 'Z')}`,
    'detailedTransfers=false',
  ];
  return `${baseUrl.replace(/\/+$/, '')}/api/v5/plan?${params.join('&')}`;
}

export async function fetchTransitousPlan(
  baseUrl: string,
  query: PlanQuery,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = TRANSITOUS_TIMEOUT_MS,
): Promise<PlanResult> {
  let response: Response;
  let text: string;
  try {
    response = await fetchImpl(transitousPlanUrl(baseUrl, query), {
      headers: { 'User-Agent': TRANSITOUS_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, reason: response.status === 429 ? 'rateLimited' : 'unavailable', status: response.status };
    }
    text = await response.text();
  } catch {
    return { ok: false, reason: 'unavailable', status: null };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, reason: 'invalidJson', status: response.status };
  }
}
