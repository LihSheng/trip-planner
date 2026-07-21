import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import type { Activity } from '../types';
import { ensureActivities, isValidActivity, legacyPlaceToActivity } from './activity';

describe('activity domain foundation', () => {
  it('converts scheduled legacy places into activities without changing order', () => {
    const state = createInitialState();
    const place = state.places.find((item) => item.id === 'taipei-101');

    expect(place).toBeDefined();
    const activity = legacyPlaceToActivity(state, place!);

    expect(activity).toMatchObject({
      id: 'taipei-101',
      placeId: 'taipei-101',
      dayId: 'day-1',
      sortOrder: 0,
      lock: { lockDay: false, lockTime: false },
    });
  });

  it('converts unscheduled places and preserves their ordering', () => {
    const state = createInitialState();
    const place = state.places.find((item) => item.id === state.unscheduledIds[0]);

    const activity = legacyPlaceToActivity(state, place!);

    expect(activity.dayId).toBeUndefined();
    expect(activity.sortOrder).toBe(0);
  });

  it('is idempotent and does not duplicate activity records', () => {
    const state = createInitialState();
    const first = ensureActivities(state);
    const second = ensureActivities(first);

    expect(first.activities).toHaveLength(state.places.length);
    expect(second).toBe(first);
    expect(new Set(second.activities?.map((activity) => activity.id)).size).toBe(state.places.length);
  });

  it('preserves richer activity metadata while refreshing legacy assignment', () => {
    const state = createInitialState();
    const first = ensureActivities(state);
    const existing = first.activities!.find((activity) => activity.id === 'taipei-101')!;
    const enriched: Activity = {
      ...existing,
      title: 'Visit Taipei 101 Observatory',
      durationMinutes: 120,
      durationSource: 'user',
      preferredStartTime: '14:00',
      lock: { lockDay: true, lockTime: false },
    };

    const next = ensureActivities({
      ...first,
      activities: first.activities!.map((activity) => activity.id === enriched.id ? enriched : activity),
    });

    expect(next.activities?.find((activity) => activity.id === enriched.id)).toMatchObject({
      title: 'Visit Taipei 101 Observatory',
      dayId: 'day-1',
      sortOrder: 0,
      durationMinutes: 120,
      preferredStartTime: '14:00',
      lock: { lockDay: true, lockTime: false },
    });
  });

  it('requires confirmed bookings to have protected day and time locks', () => {
    const state = ensureActivities(createInitialState());
    const base = state.activities![0];
    const invalid: Activity = {
      ...base,
      booking: {
        isConfirmed: true,
        startTime: '19:00',
        arrivalBufferMinutes: 15,
      },
      lock: { lockDay: true, lockTime: false },
    };

    expect(isValidActivity(invalid, state)).toBe(false);
    expect(isValidActivity({ ...invalid, lock: { lockDay: true, lockTime: true } }, state)).toBe(true);
  });

  it('rejects orphaned day and place references', () => {
    const state = ensureActivities(createInitialState());
    const base = state.activities![0];

    expect(isValidActivity({ ...base, dayId: 'missing-day' }, state)).toBe(false);
    expect(isValidActivity({ ...base, placeId: 'missing-place' }, state)).toBe(false);
  });
});
