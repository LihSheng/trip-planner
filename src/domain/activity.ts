import type { Activity, ActivityBooking, Place, TripState } from '../types';

function findScheduledPosition(state: TripState, placeId: string): { dayId?: string; sortOrder: number } {
  for (const day of state.days) {
    const index = day.placeIds.indexOf(placeId);
    if (index >= 0) return { dayId: day.id, sortOrder: index };
  }

  const unscheduledIndex = state.unscheduledIds.indexOf(placeId);
  return { sortOrder: unscheduledIndex >= 0 ? unscheduledIndex : Number.MAX_SAFE_INTEGER };
}

function bookingFromLegacySchedule(
  state: TripState,
  placeId: string,
  dayId?: string,
): Pick<Activity, 'durationMinutes' | 'durationSource' | 'preferredStartTime'> {
  if (!dayId) return {};
  const schedule = state.days.find((day) => day.id === dayId)?.stopSchedules?.[placeId];
  if (!schedule) return {};

  return {
    durationMinutes: schedule.durationMinutes,
    durationSource: schedule.durationMinutes ? 'user' : undefined,
    preferredStartTime: schedule.startTime,
  };
}

export function legacyPlaceToActivity(state: TripState, place: Place): Activity {
  const { dayId, sortOrder } = findScheduledPosition(state, place.id);
  const schedule = bookingFromLegacySchedule(state, place.id, dayId);

  return {
    id: place.id,
    title: place.name,
    placeId: place.id,
    dayId,
    sortOrder,
    notes: place.notes || undefined,
    category: place.category,
    lock: { lockDay: false, lockTime: false },
    ...schedule,
  };
}

function isValidBooking(value: ActivityBooking | undefined): boolean {
  if (!value) return true;
  if (!value.isConfirmed) return true;
  return Boolean(value.startTime) && value.arrivalBufferMinutes >= 0;
}

export function isValidActivity(activity: Activity, state?: TripState): boolean {
  if (!activity.id || !activity.title.trim()) return false;
  if (!Number.isFinite(activity.sortOrder) || activity.sortOrder < 0) return false;
  if (activity.durationMinutes !== undefined && activity.durationMinutes <= 0) return false;
  if (!isValidBooking(activity.booking)) return false;
  if (activity.booking?.isConfirmed && (!activity.lock.lockDay || !activity.lock.lockTime)) return false;
  if (state && activity.dayId && !state.days.some((day) => day.id === activity.dayId)) return false;
  if (state && activity.placeId && !state.places.some((place) => place.id === activity.placeId)) return false;
  return true;
}

/**
 * Produces a stable Activity snapshot from the legacy place/day model.
 *
 * Existing activity records win so later epics can progressively add richer fields.
 * Missing records are created from legacy places. Orphaned records are removed.
 */
export function ensureActivities(state: TripState): TripState {
  const existingById = new Map((state.activities ?? []).map((activity) => [activity.id, activity]));
  const activities = state.places.map((place) => {
    const legacy = legacyPlaceToActivity(state, place);
    const existing = existingById.get(place.id);
    if (!existing) return legacy;

    return {
      ...legacy,
      ...existing,
      id: place.id,
      placeId: place.id,
      dayId: legacy.dayId,
      sortOrder: legacy.sortOrder,
      lock: existing.lock ?? legacy.lock,
    };
  });

  if (
    state.activities?.length === activities.length &&
    state.activities.every((activity, index) => JSON.stringify(activity) === JSON.stringify(activities[index]))
  ) {
    return state;
  }

  return { ...state, activities };
}
