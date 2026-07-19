import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import { findContainer, getContainerItems, movePlace, replaceContainerItems } from './itinerary';

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

  it('moves places from a day to unscheduled and clamps destination indexes', () => {
    const state = createInitialState();
    const next = movePlace(state, 'taipei-101', 'unscheduled', 99);

    expect(next.days[0].placeIds).toEqual(['ximending']);
    expect(next.unscheduledIds).toEqual(['alishan', 'taipei-101']);
    expect(getContainerItems(next, 'missing-day')).toEqual([]);
  });

  it('does not alter state for unknown places or same positions', () => {
    const state = createInitialState();

    expect(movePlace(state, 'missing', 'day-1', 0)).toBe(state);
    expect(movePlace(state, 'taipei-101', 'day-1', 0)).toBe(state);
    expect(replaceContainerItems(state, 'missing-day', ['x'])).toEqual(state);
  });
});
