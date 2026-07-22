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

export type ActivityDetailUpdates = Pick<Activity, 'title' | 'category'> &
  Partial<Pick<Activity, 'durationMinutes' | 'preferredStartTime' | 'notes'>>;

/**
 * Applies user-editable activity details while preserving assignment, ordering,
 * booking, and lock metadata. Scheduled activities mirror time and duration into
 * the legacy stop schedule until planner surfaces fully migrate to Activity.
 */
export function updateActivityDetails(
  state: TripState,
  activityId: string,
  updates: ActivityDetailUpdates,
): TripState {
  const normalized = ensureActivities(state);
  const currentActivity = normalized.activities?.find((activity) => activity.id === activityId);
  if (!currentActivity) return state;

  const title = updates.title.trim();
  if (!title) return state;
  if (updates.durationMinutes !== undefined && updates.durationMinutes <= 0) return state;

  const bookingTimingProtected = currentActivity.booking?.isConfirmed === true;
  const nextDuration = bookingTimingProtected ? currentActivity.durationMinutes : updates.durationMinutes;
  const nextPreferredStartTime = bookingTimingProtected
    ? currentActivity.preferredStartTime
    : updates.preferredStartTime?.trim() || undefined;

  const nextActivity: Activity = {
    ...currentActivity,
    title,
    category: updates.category,
    durationMinutes: nextDuration,
    durationSource: bookingTimingProtected
      ? currentActivity.durationSource
      : nextDuration === undefined ? undefined : 'user',
    preferredStartTime: nextPreferredStartTime,
    notes: updates.notes?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };

  const days = bookingTimingProtected ? normalized.days : normalized.days.map((day) => {
    if (day.id !== nextActivity.dayId || !nextActivity.placeId) return day;

    const stopSchedules = { ...day.stopSchedules };
    const previous = { ...stopSchedules[nextActivity.placeId] };
    if (nextActivity.preferredStartTime) previous.startTime = nextActivity.preferredStartTime;
    else delete previous.startTime;
    if (nextActivity.durationMinutes !== undefined) previous.durationMinutes = nextActivity.durationMinutes;
    else delete previous.durationMinutes;

    if (Object.keys(previous).length) stopSchedules[nextActivity.placeId] = previous;
    else delete stopSchedules[nextActivity.placeId];

    return { ...day, stopSchedules };
  });

  return {
    ...normalized,
    activities: normalized.activities!.map((activity) => activity.id === activityId ? nextActivity : activity),
    days,
  };
}
