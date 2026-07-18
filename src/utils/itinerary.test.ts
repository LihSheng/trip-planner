import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import { findContainer, movePlace } from './itinerary';

describe('itinerary moves', () => {
  it('moves a place into another day', () => {
    const state = createInitialState();
    const next = movePlace(state, 'taipei-101', 'day-2', 1);

    expect(findContainer(next, 'taipei-101')).toBe('day-2');
    expect(next.days[1].placeIds).toEqual(['shifen', 'taipei-101', 'jiufen']);
  });

  it('reorders a place within the same day', () => {
    const state = createInitialState();
    const next = movePlace(state, 'ximending', 'day-1', 0);

    expect(next.days[0].placeIds).toEqual(['ximending', 'taipei-101']);
  });
});
