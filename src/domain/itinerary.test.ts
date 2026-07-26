import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import { ensureItineraryEntries } from './itinerary';

describe('ensureItineraryEntries', () => {
  it('migrates legacy containers with stable visit identities', () => {
    const state = createInitialState();
    state.days[0].placeIds.push('taipei-101');

    const migrated = ensureItineraryEntries(state);
    const entries = migrated.itineraryEntries ?? [];

    expect(entries.filter((entry) => entry.placeId === 'taipei-101')).toHaveLength(2);
    expect(entries.find((entry) => entry.dayId === 'day-1' && entry.sortOrder === 0)).toMatchObject({ placeId: 'taipei-101' });
    expect(ensureItineraryEntries(migrated)).toBe(migrated);
  });

  it('rejects a legacy itinerary that references a missing place', () => {
    const state = createInitialState();
    state.days[0].placeIds.push('missing-place');
    expect(() => ensureItineraryEntries(state)).toThrow('Itinerary references missing place missing-place.');
  });
});
