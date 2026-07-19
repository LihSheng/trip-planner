import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../data/seed';
import {
  acceptTripInvitations,
  inviteTripCollaborator,
  isTripState,
  loadSharedTripOwnerId,
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
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ state }]), { status: 200 }));

    const loaded = await loadTripState('token', 'owner');

    expect(loaded?.visitedPlaceIds).toEqual([]);
    expect(loaded?.days[0]).toMatchObject({ travelMode: 'public', stopSchedules: {}, timeManagementEnabled: false });
    expect(fetchMock.mock.calls[0][0]).toContain('user_id=eq.owner');
  });

  it('saves trips and translates repository failure responses', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 }));
    await saveTripState('token', 'owner', createInitialState());
    const [, request] = fetchMock.mock.calls[0];
    expect(request.method).toBe('POST');
    expect(JSON.parse(request.body).user_id).toBe('owner');

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Denied' }), { status: 403 }));
    await expect(loadTripState('token', 'owner')).rejects.toThrow('Denied');
  });

  it('handles invitation, collaborator, and removal requests', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ trip_owner_id: 'shared-owner' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ invite_email: 'one@example.com', member_id: null }, { invite_email: 'two@example.com', member_id: 'id' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await acceptTripInvitations('token');
    await expect(loadSharedTripOwnerId('token', 'member')).resolves.toBe('shared-owner');
    await expect(loadTripCollaborators('token', 'owner')).resolves.toEqual([
      { inviteEmail: 'one@example.com', accepted: false },
      { inviteEmail: 'two@example.com', accepted: true },
    ]);
    await inviteTripCollaborator('token', 'owner', '  Friend@Example.com ');
    await removeTripCollaborator('token', 'owner', 'friend@example.com');

    expect(JSON.parse(fetchMock.mock.calls[3][1].body).invite_email).toBe('friend@example.com');
    expect(fetchMock.mock.calls[4][1].method).toBe('DELETE');
  });
});
