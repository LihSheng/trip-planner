import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import type { SavedLegTransit } from './transit';
import { restoreTripState } from './tripRestoration';

describe('restoreTripState', () => {
  it('normalizes every supported Trip through one restoration path', () => {
    const state = createInitialState();
    state.days = [{ id: 'day', label: 'Day', placeIds: [] }];
    delete (state as Partial<typeof state>).visitedPlaceIds;

    const restored = restoreTripState(state);

    expect(restored).toMatchObject({
      ok: true,
      trip: {
        readOnly: false,
        state: { visitedPlaceIds: [], days: [{ travelMode: 'public', stopSchedules: {} }] },
      },
    });
  });

  it('drops the retired route fields from older saved days', () => {
    const state = createInitialState();
    state.days = [{
      id: 'day', label: 'Day', placeIds: [],
      routeLegs: [], routeUpdatedAt: '2026-01-01T00:00:00.000Z', routeStale: true, routeError: 'x',
    } as typeof state.days[number]];

    const restored = restoreTripState(state);

    expect(restored.ok && Object.keys(restored.trip.state.days[0]).filter((key) => key.startsWith('route'))).toEqual([]);
  });

  it('defaults saved transit routes to an empty record and drops orphaned ones', () => {
    const state = createInitialState();
    const route: SavedLegTransit = {
      provider: 'mock',
      fetchedAt: '2026-10-19T01:00:00.000Z',
      basis: { from: { lat: 25, lng: 121.5 }, to: { lat: 25.1, lng: 121.6 }, departAt: '2026-10-20T10:00:00+08:00' },
      options: [],
    };
    state.days = [
      { ...state.days[0], transitByLeg: undefined },
      { ...state.days[1], transitByLeg: { 'shifen:jiufen': route, 'shifen:gone': route } },
    ];

    const restored = restoreTripState(state);

    expect(restored.ok && restored.trip.state.days.map((day) => day.transitByLeg)).toEqual([{}, { 'shifen:jiufen': route }]);
  });

  it('retains a migratable-shaped Trip read-only when migration fails', () => {
    const state = createInitialState();
    state.days[0].placeIds.push('missing-place');

    const restored = restoreTripState(state);

    expect(restored).toMatchObject({
      ok: true,
      trip: { state, readOnly: true, error: 'Itinerary references missing place missing-place.' },
    });
  });

  it('rejects payloads that cannot be rendered as a Trip', () => {
    expect(restoreTripState({ version: 2 })).toEqual({
      ok: false,
      error: 'The saved trip has an unsupported data format.',
    });
  });
});
