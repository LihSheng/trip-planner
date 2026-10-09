import type { TripState } from '../types';

const formatter = new Intl.DateTimeFormat('en-MY', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

export function addDays(dateString: string, offset: number): Date {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return date;
}

export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function tripDayDate(startDate: string, index: number): string {
  return localDateKey(addDays(startDate, index));
}

/** The day Today mode opens on: the calendar match, else the first day with stops left, else day one. */
export function defaultTodayDay(state: TripState, today = localDateKey()) {
  const byDate = state.days.find((_, index) => tripDayDate(state.startDate, index) === today);
  const incomplete = state.days.find((day) => day.placeIds.some((id) => {
    const status = state.executionByDay?.[day.id]?.stopStates[id]?.status;
    return status !== 'completed' && status !== 'skipped' && status !== 'rescheduled';
  }));
  return byDate ?? incomplete ?? state.days[0];
}

export function formatTripDate(dateString: string, offset: number): string {
  return formatter.format(addDays(dateString, offset));
}
