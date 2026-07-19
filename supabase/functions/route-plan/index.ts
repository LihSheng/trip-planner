// Google Routes proxy. GOOGLE_ROUTES_API_KEY is a Supabase Edge Function secret,
// never a VITE_ variable or browser value.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Mode = 'public' | 'walk' | 'bike' | 'car';
type Place = { id: string; latitude: number; longitude: number };
type Day = { id: string; placeIds: string[]; travelMode?: Mode; startTime?: string; legModeOverrides?: Record<string, Mode | 'default'> };

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const GOOGLE_MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const DAILY_LIMIT = 100;

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }); }
function point(place: Place) { return { location: { latLng: { latitude: place.latitude, longitude: place.longitude } } }; }
function legKey(from: string, to: string) { return `${from}:${to}`; }
function googleMode(mode: Mode) { return ({ public: 'TRANSIT', walk: 'WALK', bike: 'BICYCLE', car: 'DRIVE' })[mode]; }
function durationMinutes(value?: string) { return value ? Math.max(1, Math.round(Number(value.replace('s', '')) / 60)) : 0; }

async function routeLeg(apiKey: string, from: Place, to: Place, mode: Mode, departureTime: string) {
  const response = await fetch(GOOGLE_ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.transitDetails',
    },
    body: JSON.stringify({ origin: point(from), destination: point(to), travelMode: googleMode(mode), departureTime }),
  });
  if (!response.ok) throw new Error(`Google Routes: ${await response.text()}`);
  const route = ((await response.json()) as { routes?: Array<Record<string, unknown>> }).routes?.[0];
  if (!route) throw new Error('Google Routes returned no route.');
  const steps = ((route.legs as Array<{ steps?: Array<Record<string, unknown>> }> | undefined)?.[0]?.steps ?? []).map((step) => ({
    instruction: (step.navigationInstruction as { instructions?: string } | undefined)?.instructions ?? '',
    durationMinutes: durationMinutes(step.staticDuration as string | undefined), distanceMeters: step.distanceMeters as number | undefined,
    transitLine: ((step.transitDetails as { transitLine?: { name?: string } } | undefined)?.transitLine?.name),
  })).filter((step) => step.instruction || step.transitLine);
  return { fromPlaceId: from.id, toPlaceId: to.id, mode, durationMinutes: durationMinutes(route.duration as string), distanceMeters: (route.distanceMeters as number) ?? 0, polyline: (route.polyline as { encodedPolyline?: string } | undefined)?.encodedPolyline, steps };
}

async function cachedRouteLeg(admin: ReturnType<typeof createClient>, apiKey: string, from: Place, to: Place, mode: Mode, departureTime: string) {
  const cacheKey = `${mode}:${from.latitude},${from.longitude}:${to.latitude},${to.longitude}:${departureTime.slice(0, 13)}`;
  const { data } = await admin.from('route_cache').select('result').eq('cache_key', cacheKey).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (data?.result) return data.result;
  const result = await routeLeg(apiKey, from, to, mode, departureTime);
  await admin.from('route_cache').upsert({ cache_key: cacheKey, result, expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
  return result;
}

async function shortestOrder(apiKey: string, places: Place[], mode: Mode, departureTime: string) {
  if (places.length < 3) return places;
  const response = await fetch(GOOGLE_MATRIX_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'originIndex,destinationIndex,duration' },
    body: JSON.stringify({ origins: places.map(point), destinations: places.map(point), travelMode: googleMode(mode), departureTime }),
  });
  if (!response.ok) throw new Error(`Google Routes matrix: ${await response.text()}`);
  const durations = new Map<string, number>();
  const text = await response.text();
  for (const line of text.split('\n').filter(Boolean)) {
    const entry = JSON.parse(line) as { originIndex?: number; destinationIndex?: number; duration?: string };
    if (entry.originIndex !== undefined && entry.destinationIndex !== undefined) durations.set(`${entry.originIndex}:${entry.destinationIndex}`, durationMinutes(entry.duration));
  }
  const result = [places[0]]; const remaining = places.slice(1);
  while (remaining.length) {
    const current = result.at(-1)!;
    const currentIndex = places.indexOf(current);
    remaining.sort((a, b) => (durations.get(`${currentIndex}:${places.indexOf(a)}`) ?? Number.MAX_SAFE_INTEGER) - (durations.get(`${currentIndex}:${places.indexOf(b)}`) ?? Number.MAX_SAFE_INTEGER));
    result.push(remaining.shift()!);
  }
  return result;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ message: 'Method not allowed' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ message: 'Sign in required' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);
  const token = authorization.replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ message: 'Invalid session' }, 401);
  const payload = await request.json() as { tripOwnerId: string; startDate: string; day: Day; places: Place[]; operation: 'optimize' | 'leg'; fromPlaceId?: string; toPlaceId?: string; mode?: Mode };
  if (payload.tripOwnerId !== auth.user.id) return json({ message: 'Only the trip owner can request routing.' }, 403);
  const apiKey = Deno.env.get('GOOGLE_ROUTES_API_KEY');
  if (!apiKey) return json({ message: 'GOOGLE_ROUTES_API_KEY is not configured.' }, 503);
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin.from('route_request_usage').select('request_count').eq('user_id', auth.user.id).eq('usage_date', today).maybeSingle();
  if ((usage?.request_count ?? 0) >= DAILY_LIMIT) return json({ message: `Daily route limit (${DAILY_LIMIT}) reached.` }, 429);
  await admin.from('route_request_usage').upsert({ user_id: auth.user.id, usage_date: today, request_count: (usage?.request_count ?? 0) + 1, updated_at: new Date().toISOString() });
  const byId = new Map(payload.places.map((place) => [place.id, place]));
  const requestedIds = payload.operation === 'leg' ? [payload.fromPlaceId, payload.toPlaceId] : payload.day.placeIds;
  const selected = requestedIds.map((id) => id ? byId.get(id) : undefined).filter((place): place is Place => Boolean(place));
  if (selected.length < 2) return json({ message: 'At least two valid places are required.' }, 400);
  const departureTime = `${payload.startDate}T${payload.day.startTime ?? '09:00'}:00+08:00`;
  try {
    const ordered = payload.operation === 'optimize' ? await shortestOrder(apiKey, selected, payload.day.travelMode ?? 'public', departureTime) : selected;
    const legs = [];
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const from = ordered[index]; const to = ordered[index + 1];
      const override = payload.operation === 'leg' ? payload.mode : payload.day.legModeOverrides?.[legKey(from.id, to.id)];
      legs.push(await cachedRouteLeg(admin, apiKey, from, to, override && override !== 'default' ? override : payload.day.travelMode ?? 'public', departureTime));
    }
    return json({ placeIds: payload.operation === 'optimize' ? ordered.map((place) => place.id) : undefined, legs });
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : 'Route request failed' }, 502);
  }
});
