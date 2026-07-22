import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import type { Activity } from '../types';
import { ensureActivities, isValidActivity, legacyPlaceToActivity, updateActivityDetails } from './activity';

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

  it('updates scheduled activity details and mirrors schedule fields', () => {
    const state = ensureActivities(createInitialState());
    const previous = state.activities!.find((activity) => activity.id === 'taipei-101')!;
    const protectedActivity: Activity = {
      ...previous,
      booking: {
        isConfirmed: true,
        startTime: '14:00',
        arrivalBufferMinutes: 30,
      },
      lock: { lockDay: true, lockTime: true },
    };
    const withBooking = {
      ...state,
      activities: state.activities!.map((activity) => activity.id === protectedActivity.id ? protectedActivity : activity),
    };

    const next = updateActivityDetails(withBooking, 'taipei-101', {
      title: 'Visit Taipei 101 Observatory',
      category: 'Landmark',
      durationMinutes: 120,
      preferredStartTime: '15:30',
      notes: 'Use the pre-booked ticket entrance.',
    });

    expect(next.activities?.find((activity) => activity.id === 'taipei-101')).toMatchObject({
      title: 'Visit Taipei 101 Observatory',
      durationMinutes: 120,
      durationSource: 'user',
      preferredStartTime: '15:30',
      notes: 'Use the pre-booked ticket entrance.',
      lock: { lockDay: true, lockTime: true },
      booking: protectedActivity.booking,
    });
    expect(next.days.find((day) => day.id === 'day-1')?.stopSchedules?.['taipei-101']).toMatchObject({
      startTime: '15:30',
      durationMinutes: 120,
    });
  });

  it('stores details for unscheduled activities without creating a day schedule', () => {
    const state = ensureActivities(createInitialState());
    const activityId = state.unscheduledIds[0];

    const next = updateActivityDetails(state, activityId, {
      title: 'Explore Alishan trails',
      category: 'Nature',
      durationMinutes: 180,
      preferredStartTime: '08:00',
      notes: 'Keep flexible until transport is confirmed.',
    });

    expect(next.activities?.find((activity) => activity.id === activityId)).toMatchObject({
      title: 'Explore Alishan trails',
      dayId: undefined,
      durationMinutes: 180,
      preferredStartTime: '08:00',
    });
    expect(next.days.every((day) => !day.stopSchedules?.[activityId])).toBe(true);
  });

  it('does not apply invalid activity edits', () => {
    const state = ensureActivities(createInitialState());

    expect(updateActivityDetails(state, 'taipei-101', {
      title: ' ',
      category: 'Landmark',
      durationMinutes: 60,
    })).toBe(state);
    expect(updateActivityDetails(state, 'taipei-101', {
      title: 'Valid title',
      category: 'Landmark',
      durationMinutes: 0,
    })).toBe(state);
    expect(updateActivityDetails(state, 'missing', {
      title: 'Missing',
      category: 'Landmark',
    })).toBe(state);
  });
});
