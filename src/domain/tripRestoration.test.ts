import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
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
