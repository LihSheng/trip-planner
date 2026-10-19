import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import tzlookup from 'npm:@photostructure/tz-lookup@11.7.0';
import { AdapterShapeError, adaptTransitousPlan, type TransitOptionV1 } from './_shared/transitousAdapter.ts';
import { fetchTransitousPlan } from './_shared/transitousClient.ts';
import { formatInZone, isValidTimeZone, parseTransitRequest, resolveDeparture } from './_shared/transitRequest.ts';

function positiveIntegerEnv(name: string, fallback: number, maximum: number) {
  const value = Number(Deno.env.get(name) ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be an integer from 1 to ${maximum}.`);
  return value;
}
const dailyLimit = positiveIntegerEnv('TRANSIT_DAILY_LIMIT', 30, 1000);
// Shared by every user. Transitous is volunteer-run and asks to be contacted before heavy use.
const perMinuteLimit = positiveIntegerEnv('TRANSIT_PER_MINUTE_LIMIT', 10, 100);
const allowedOrigins = (Deno.env.get('TRANSIT_ALLOWED_ORIGIN') ?? '*').split(',').map((origin) => origin.trim()).filter(Boolean);
const transitousBaseUrl = Deno.env.get('TRANSITOUS_BASE_URL') ?? 'https://api.transitous.org';
const maxRequestBytes = 4096;
const busyRetryAfterSeconds = 60;

type ErrorCode =
  | 'AUTH_REQUIRED' | 'METHOD_NOT_ALLOWED' | 'INVALID_REQUEST' | 'TRANSIT_LIMIT_REACHED' | 'TRANSIT_BUSY'
  | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_RESPONSE_INVALID' | 'INTERNAL_ERROR';

interface TransitRoutesResponse {
  version: 1;
  provider: 'transitous';
  departAt: string;
  timeZone: string;
  fetchedAt: string;
  options: TransitOptionV1[];
}

function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? '';
  // Vite chooses the next free port, so local development is not always 5173.
  const isLocalViteOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  const allowOrigin = allowedOrigins.includes('*') ? '*' : allowedOrigins.includes(origin) || isLocalViteOrigin ? origin : allowedOrigins[0] ?? 'null';
  return { 'Access-Control-Allow-Origin': allowOrigin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}
function json(payload: unknown, status: number, request: Request, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders(request), ...headers, 'Content-Type': 'application/json' } });
}
function fail(code: ErrorCode, message: string, status: number, requestId: string, request: Request, extra: { resetsAt?: string; retryAfterSeconds?: number } = {}) {
  const body = { code, message, requestId, retryable: status >= 500, ...(extra.resetsAt ? { resetsAt: extra.resetsAt } : {}) };
  return json(body, status, request, extra.retryAfterSeconds ? { 'Retry-After': String(extra.retryAfterSeconds) } : {});
}

async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxRequestBytes) throw new Error('Request body is too large.');
  const text = await request.text();
  if (text.length > maxRequestBytes) throw new Error('Request body is too large.');
  return JSON.parse(text);
}

function timeZoneAt(lat: number, lng: number): string | null {
  try {
    const timeZone = tzlookup(lat, lng);
    return isValidTimeZone(timeZone) ? timeZone : null;
  } catch {
    return null;
  }
}

async function settle(service: SupabaseClient, usageId: string, requestId: string, outcome: { status: 'completed' } | { status: 'failed'; errorCode: string }) {
  const { error } = await service.from('ai_import_usage').update({
    status: outcome.status,
    error_code: outcome.status === 'failed' ? outcome.errorCode : null,
    completed_at: new Date().toISOString(),
  }).eq('id', usageId);
  if (error) console.error(JSON.stringify({ requestId, code: 'USAGE_UPDATE_FAILED', message: error.message }));
}

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Use POST.', 405, requestId, request);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return fail('AUTH_REQUIRED', 'Sign in to look up transit routes.', 401, requestId, request);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return fail('INTERNAL_ERROR', 'Transit routes are not configured.', 500, requestId, request);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return fail('AUTH_REQUIRED', 'Sign in to look up transit routes.', 401, requestId, request);

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch {
    return fail('INVALID_REQUEST', 'Request body must be a JSON object under 4 KB.', 400, requestId, request);
  }
  const parsed = parseTransitRequest(body);
  if (!parsed.ok) return fail('INVALID_REQUEST', parsed.message, 400, requestId, request);
  const { from, to, departure } = parsed.request;

  // Resolved before reserving so a lookup failure here cannot spend the user's cap.
  const timeZone = timeZoneAt(from.lat, from.lng);
  if (!timeZone) {
    console.error(JSON.stringify({ requestId, code: 'TIME_ZONE_LOOKUP_FAILED', lat: from.lat, lng: from.lng }));
    return fail('INTERNAL_ERROR', 'Could not work out the local time zone.', 500, requestId, request);
  }
  const departAt = resolveDeparture(departure, timeZone, new Date());

  // Browser roles cannot read usage rows; use a service client only for the quota ledger.
  const service = createClient(supabaseUrl, serviceKey);
  const reservation = await service.rpc('reserve_transit_usage', {
    p_user_id: userData.user.id,
    p_daily_limit: dailyLimit,
    p_per_minute_limit: perMinuteLimit,
  });
  const reserved = Array.isArray(reservation.data) ? reservation.data[0] as { outcome?: string; reservation_id?: string | null; resets_at?: string | null } | undefined : undefined;
  if (reservation.error || !reserved) {
    console.error(JSON.stringify({ requestId, code: 'QUOTA_RESERVATION_FAILED', message: reservation.error?.message ?? 'no row' }));
    return fail('INTERNAL_ERROR', 'Transit quota is unavailable.', 500, requestId, request);
  }
  if (reserved.outcome === 'busy') {
    return fail('TRANSIT_BUSY', 'Busy, try again in a minute.', 503, requestId, request, { retryAfterSeconds: busyRetryAfterSeconds });
  }
  if (reserved.outcome === 'limit') {
    const resetsAt = reserved.resets_at ? new Date(reserved.resets_at).toISOString() : undefined;
    return fail('TRANSIT_LIMIT_REACHED', 'Daily transit lookup limit reached.', 429, requestId, request, { resetsAt });
  }
  const usageId = reserved.reservation_id;
  if (reserved.outcome !== 'reserved' || !usageId) {
    console.error(JSON.stringify({ requestId, code: 'QUOTA_RESERVATION_FAILED', outcome: reserved.outcome ?? null }));
    return fail('INTERNAL_ERROR', 'Transit quota is unavailable.', 500, requestId, request);
  }

  try {
    const plan = await fetchTransitousPlan(transitousBaseUrl, { from, to, departAt });
    if (!plan.ok) {
      console.warn(JSON.stringify({ requestId, code: 'PROVIDER_FAILED', reason: plan.reason, status: plan.status }));
      if (plan.reason === 'rateLimited') {
        await settle(service, usageId, requestId, { status: 'failed', errorCode: 'TRANSIT_BUSY' });
        return fail('TRANSIT_BUSY', 'Busy, try again in a minute.', 503, requestId, request, { retryAfterSeconds: busyRetryAfterSeconds });
      }
      if (plan.reason === 'invalidJson') {
        await settle(service, usageId, requestId, { status: 'failed', errorCode: 'PROVIDER_RESPONSE_INVALID' });
        return fail('PROVIDER_RESPONSE_INVALID', 'The transit provider sent an unreadable answer.', 502, requestId, request);
      }
      await settle(service, usageId, requestId, { status: 'failed', errorCode: 'PROVIDER_UNAVAILABLE' });
      return fail('PROVIDER_UNAVAILABLE', 'The transit provider is unavailable.', 502, requestId, request);
    }

    let options: TransitOptionV1[];
    try {
      const adapted = adaptTransitousPlan(plan.body);
      options = adapted.options;
      if (adapted.dropped) console.warn(JSON.stringify({ requestId, code: 'ITINERARIES_DROPPED', dropped: adapted.dropped }));
    } catch (error) {
      if (!(error instanceof AdapterShapeError)) throw error;
      console.error(JSON.stringify({ requestId, code: 'PROVIDER_RESPONSE_INVALID', message: error.message, sample: error.sample }));
      await settle(service, usageId, requestId, { status: 'failed', errorCode: 'PROVIDER_RESPONSE_INVALID' });
      return fail('PROVIDER_RESPONSE_INVALID', 'The transit provider sent an unreadable answer.', 502, requestId, request);
    }

    await settle(service, usageId, requestId, { status: 'completed' });
    const response: TransitRoutesResponse = {
      version: 1,
      provider: 'transitous',
      departAt: formatInZone(departAt, timeZone),
      timeZone,
      fetchedAt: new Date().toISOString(),
      options,
    };
    return json(response, 200, request);
  } catch (error) {
    console.error(JSON.stringify({ requestId, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'unknown' }));
    await settle(service, usageId, requestId, { status: 'failed', errorCode: 'INTERNAL_ERROR' });
    return fail('INTERNAL_ERROR', 'Could not look up transit routes.', 500, requestId, request);
  }
});
