import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../data/seed';
import {
  acceptTripInvitations,
  createTripPlan,
  getOrCreateShareToken,
  inviteTripCollaborator,
  isTripState,
  listTripPlans,
  loadSharedTripPlanId,
  loadTripCollaborators,
  loadTripState,
  removeTripCollaborator,
  saveTripState,
} from './tripRepository';

const fetchMock = vi.fn();

describe('trip repository', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recognizes only supported trip state payloads', () => {
    expect(isTripState(createInitialState())).toBe(true);
    expect(isTripState({ version: 2 })).toBe(false);
    expect(isTripState(null)).toBe(false);
  });

  it('loads and normalizes legacy optional scheduling fields', async () => {
    const state = createInitialState();
    state.days = [{ id: 'd1', label: 'Day', placeIds: [] }];
    // Simulates a saved pre-scheduling trip.
    delete (state as Partial<typeof state>).visitedPlaceIds;
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ id: 'plan-1', owner_id: 'owner', state }]), { status: 200 }));

    const loaded = await loadTripState('token', 'plan-1');

    expect(loaded?.visitedPlaceIds).toEqual([]);
    expect(loaded?.days[0]).toMatchObject({ travelMode: 'public', stopSchedules: {}, timeManagementEnabled: false });
    expect(fetchMock.mock.calls[0][0]).toContain('id=eq.plan-1');
  });

  it('creates, lists, saves trips, and translates repository failure responses', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'created-plan' }]), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 'plan-1', owner_id: 'owner', state: createInitialState(), updated_at: '2026-01-01T00:00:00Z' },
        { id: 'plan-2', owner_id: 'friend', state: { version: 2 }, updated_at: '2026-01-02T00:00:00Z' },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(createTripPlan('token', 'owner', createInitialState())).resolves.toBe('created-plan');
    await expect(listTripPlans('token', 'owner')).resolves.toEqual([expect.objectContaining({ id: 'plan-1', isOwner: true })]);
    await saveTripState('token', 'plan-1', createInitialState());
    const [, request] = fetchMock.mock.calls[0];
    expect(request.method).toBe('POST');
    expect(JSON.parse(request.body).owner_id).toBe('owner');
    expect(fetchMock.mock.calls[2][1].method).toBe('PATCH');

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Denied' }), { status: 403 }));
    await expect(loadTripState('token', 'plan-1')).rejects.toThrow('Denied');
  });

  it('gets or creates read-only share tokens for one selected plan', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([{ share_token: 'existing-token' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ share_token: null }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ share_token: 'new-token' }]), { status: 200 }));
    vi.stubGlobal('crypto', { randomUUID: () => 'new-token' });

    await expect(getOrCreateShareToken('token', 'plan-1')).resolves.toBe('existing-token');
    await expect(getOrCreateShareToken('token', 'plan-2')).resolves.toBe('new-token');

    expect(fetchMock.mock.calls[0][0]).toContain('id=eq.plan-1');
    expect(fetchMock.mock.calls[1][0]).toContain('id=eq.plan-2');
    expect(fetchMock.mock.calls[2][0]).toContain('id=eq.plan-2');
    expect(fetchMock.mock.calls[2][1].method).toBe('PATCH');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).share_token).toBe('new-token');
  });

  it('handles invitation, collaborator, and removal requests', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ trip_plan_id: 'shared-plan' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ invite_email: 'one@example.com', member_id: null }, { invite_email: 'two@example.com', member_id: 'id' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await acceptTripInvitations('token');
    await expect(loadSharedTripPlanId('token', 'member')).resolves.toBe('shared-plan');
    await expect(loadTripCollaborators('token', 'plan-1')).resolves.toEqual([
      { inviteEmail: 'one@example.com', accepted: false },
      { inviteEmail: 'two@example.com', accepted: true },
    ]);
    await inviteTripCollaborator('token', 'plan-1', '  Friend@Example.com ');
    await removeTripCollaborator('token', 'plan-1', 'friend@example.com');

    expect(JSON.parse(fetchMock.mock.calls[3][1].body).invite_email).toBe('friend@example.com');
    expect(fetchMock.mock.calls[4][1].method).toBe('DELETE');
  });
});
