import type { DayTask, TripState } from '../types';

export function normalizeDayTasks(state: Pick<TripState, 'days' | 'dayTasks'>): DayTask[] {
  const dayIds = new Set(state.days.map((day) => day.id));
  const seen = new Set<string>();
  return (Array.isArray(state.dayTasks) ? state.dayTasks : [])
    .filter((task): task is DayTask => {
      const valid = Boolean(
        task
        && typeof task.id === 'string'
        && !seen.has(task.id)
        && typeof task.dayId === 'string'
        && dayIds.has(task.dayId)
        && typeof task.text === 'string'
        && task.text.trim(),
      );
      if (valid) seen.add(task.id);
      return valid;
    })
    .map((task, index) => ({
        id: task.id,
        dayId: task.dayId,
        text: task.text.trim(),
        completed: task.completed === true,
        sortOrder: Number.isFinite(task.sortOrder) ? task.sortOrder : index,
      }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
