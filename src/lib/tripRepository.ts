import type { TripState } from '../types';
import { supabasePublishableKey, supabaseUrl } from './supabaseConfig';

interface TripRow {
  id: string;
  owner_id: string;
  state: unknown;
  updated_at?: string;
}

interface SharedTripRow {
  state: unknown;
}

export interface TripCollaborator {
  inviteEmail: string;
  accepted: boolean;
}

export interface TripPlanSummary {
  id: string;
  ownerId: string;
  tripName: string;
  startDate: string;
  updatedAt: string;
  isOwner: boolean;
}

function dataHeaders(accessToken: string, additional?: Record<string, string>): HeadersInit {
  return {
    apikey: supabasePublishableKey,
    Authorization: `Bearer ${accessToken}`,
    ...additional,
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string; details?: string; hint?: string };
    return [payload.message, payload.details, payload.hint].filter(Boolean).join(' — ') || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function isTripState(value: unknown): value is TripState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TripState>;
  return (
    candidate.version === 1 &&
    typeof candidate.tripName === 'string' &&
    typeof candidate.startDate === 'string' &&
    Array.isArray(candidate.places) &&
    Array.isArray(candidate.unscheduledIds) &&
    Array.isArray(candidate.days)
  );
}

function tripSummary(row: TripRow, userId: string): TripPlanSummary | null {
  if (!isTripState(row.state)) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    tripName: row.state.tripName,
    startDate: row.state.startDate,
    updatedAt: row.updated_at ?? '',
    isOwner: row.owner_id === userId,
  };
}

function normalizeTripState(state: TripState): TripState {
  return {
    ...state,
    visitedPlaceIds: Array.isArray(state.visitedPlaceIds)
      ? state.visitedPlaceIds.filter((placeId): placeId is string => typeof placeId === 'string')
      : [],
    days: state.days.map((day) => ({
      ...day,
      travelMode: day.travelMode ?? 'public',
      stopSchedules: day.stopSchedules ?? {},
      timeManagementEnabled: day.timeManagementEnabled ?? false,
      legModeOverrides: day.legModeOverrides ?? {},
    })),
    executionByDay: state.executionByDay ?? {},
    expenses: Array.isArray(state.expenses) ? state.expenses : [],
    displayCurrency: state.displayCurrency ?? 'MYR',
  };
}

export async function listTripPlans(accessToken: string, userId: string): Promise<TripPlanSummary[]> {
  const query = new URLSearchParams({
    select: 'id,owner_id,state,updated_at',
    order: 'updated_at.desc',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/trip_plans?${query.toString()}`, {
    headers: dataHeaders(accessToken),
  });

  if (!response.ok) throw new Error(await parseError(response));
  const rows = (await response.json()) as TripRow[];
  return rows.flatMap((row) => {
    const summary = tripSummary(row, userId);
    return summary ? [summary] : [];
  });
}

export async function loadTripState(accessToken: string, planId: string): Promise<TripState | null> {
  const query = new URLSearchParams({
    select: 'id,owner_id,state,updated_at',
    id: `eq.${planId}`,
    limit: '1',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/trip_plans?${query.toString()}`, {
    headers: dataHeaders(accessToken),
  });

  if (!response.ok) throw new Error(await parseError(response));
  const rows = (await response.json()) as TripRow[];
  if (!rows[0]) return null;
  if (!isTripState(rows[0].state)) throw new Error('The saved trip has an unsupported data format.');
  return normalizeTripState(rows[0].state);
}

export async function loadPublicTrip(shareToken: string): Promise<TripState | null> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_shared_trip`, {
    method: 'POST',
    headers: dataHeaders(supabasePublishableKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ requested_share_token: shareToken }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  const rows = (await response.json()) as SharedTripRow[];
  if (!rows[0]) return null;
  if (!isTripState(rows[0].state)) throw new Error('The shared trip has an unsupported data format.');
  return normalizeTripState(rows[0].state);
}

export async function getOrCreateShareToken(accessToken: string, planId: string): Promise<string> {
  const existingQuery = new URLSearchParams({ select: 'share_token', id: `eq.${planId}`, limit: '1' });
  const existing = await fetch(`${supabaseUrl}/rest/v1/trip_plans?${existingQuery.toString()}`, { headers: dataHeaders(accessToken) });
  if (!existing.ok) throw new Error(await parseError(existing));
  const rows = (await existing.json()) as Array<{ share_token: string | null }>;
  if (rows[0]?.share_token) return rows[0].share_token;

  const shareToken = crypto.randomUUID();
  const updateQuery = new URLSearchParams({ id: `eq.${planId}` });
  const response = await fetch(`${supabaseUrl}/rest/v1/trip_plans?${updateQuery.toString()}`, {
    method: 'PATCH',
    headers: dataHeaders(accessToken, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({ share_token: shareToken }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  const updated = (await response.json()) as Array<{ share_token: string | null }>;
  if (!updated[0]?.share_token) throw new Error('Could not create a share link.');
  return updated[0].share_token;
}

export async function saveTripState(
  accessToken: string,
  planId: string,
  state: TripState,
): Promise<void> {
  const query = new URLSearchParams({ id: `eq.${planId}` });
  const response = await fetch(`${supabaseUrl}/rest/v1/trip_plans?${query.toString()}`, {
    method: 'PATCH',
    headers: dataHeaders(accessToken, {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }),
    body: JSON.stringify({
      state,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) throw new Error(await parseError(response));
}

export async function createTripPlan(accessToken: string, userId: string, state: TripState): Promise<string> {
  const response = await fetch(`${supabaseUrl}/rest/v1/trip_plans`, {
    method: 'POST',
    headers: dataHeaders(accessToken, {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }),
    body: JSON.stringify({
      owner_id: userId,
      state,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) throw new Error(await parseError(response));
  const rows = (await response.json()) as Array<{ id?: string }>;
  if (!rows[0]?.id) throw new Error('Could not create a trip plan.');
  return rows[0].id;
}

export async function acceptTripInvitations(accessToken: string): Promise<void> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/accept_trip_invitations`, {
    method: 'POST',
    headers: dataHeaders(accessToken, { 'Content-Type': 'application/json' }),
  });
  if (!response.ok) throw new Error(await parseError(response));
}

export async function loadSharedTripPlanId(accessToken: string, userId: string): Promise<string | null> {
  const query = new URLSearchParams({ select: 'trip_plan_id', member_id: `eq.${userId}`, order: 'accepted_at.desc', limit: '1' });
  const response = await fetch(`${supabaseUrl}/rest/v1/trip_collaborators?${query.toString()}`, { headers: dataHeaders(accessToken) });
  if (!response.ok) throw new Error(await parseError(response));
  const rows = (await response.json()) as Array<{ trip_plan_id: string }>;
  return rows[0]?.trip_plan_id ?? null;
}

export async function loadTripCollaborators(accessToken: string, planId: string): Promise<TripCollaborator[]> {
  const query = new URLSearchParams({ select: 'invite_email,member_id', trip_plan_id: `eq.${planId}`, order: 'invited_at.asc' });
  const response = await fetch(`${supabaseUrl}/rest/v1/trip_collaborators?${query.toString()}`, { headers: dataHeaders(accessToken) });
  if (!response.ok) throw new Error(await parseError(response));
  const rows = (await response.json()) as Array<{ invite_email: string; member_id: string | null }>;
  return rows.map((row) => ({ inviteEmail: row.invite_email, accepted: Boolean(row.member_id) }));
}

export async function inviteTripCollaborator(accessToken: string, planId: string, email: string): Promise<void> {
  const response = await fetch(`${supabaseUrl}/rest/v1/trip_collaborators?on_conflict=trip_plan_id,invite_email`, {
    method: 'POST',
    headers: dataHeaders(accessToken, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ trip_plan_id: planId, invite_email: email.trim().toLowerCase() }),
  });
  if (!response.ok) throw new Error(await parseError(response));
}

export async function removeTripCollaborator(accessToken: string, planId: string, email: string): Promise<void> {
  const query = new URLSearchParams({ trip_plan_id: `eq.${planId}`, invite_email: `eq.${email}` });
  const response = await fetch(`${supabaseUrl}/rest/v1/trip_collaborators?${query.toString()}`, {
    method: 'DELETE', headers: dataHeaders(accessToken),
  });
  if (!response.ok) throw new Error(await parseError(response));
}
