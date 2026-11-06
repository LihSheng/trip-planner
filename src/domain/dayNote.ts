import { DAY_NOTE_COLORS, type DayNote, type DayNoteColor, type TripState } from '../types';

export function dayNoteColor(color: string | undefined): DayNoteColor {
  return DAY_NOTE_COLORS.includes(color as DayNoteColor) ? (color as DayNoteColor) : 'yellow';
}

export function normalizeDayNotes(state: Pick<TripState, 'days' | 'dayNotes'>): DayNote[] {
  const dayIds = new Set(state.days.map((day) => day.id));
  const seen = new Set<string>();
  return (Array.isArray(state.dayNotes) ? state.dayNotes : [])
    .filter((note): note is DayNote => {
      const valid = Boolean(
        note
        && typeof note.id === 'string'
        && !seen.has(note.id)
        && typeof note.dayId === 'string'
        && dayIds.has(note.dayId)
        && typeof note.text === 'string'
        && note.text.trim(),
      );
      if (valid) seen.add(note.id);
      return valid;
    })
    .map((note) => {
      const createdAt = typeof note.createdAt === 'string' ? note.createdAt : new Date(0).toISOString();
      return {
        id: note.id,
        dayId: note.dayId,
        text: note.text.trim(),
        color: dayNoteColor(note.color),
        createdAt,
        updatedAt: typeof note.updatedAt === 'string' ? note.updatedAt : createdAt,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
