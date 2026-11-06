import { describe, expect, it } from 'vitest';
import { normalizeDayNotes } from './dayNote';
import type { DayNote, TripDay } from '../types';

const days = [{ id: 'day-1' }, { id: 'day-2' }] as TripDay[];
const note = (overrides: Partial<DayNote>): DayNote => ({
  id: 'n1', dayId: 'day-1', text: 'hello', color: 'yellow', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...overrides,
});

describe('normalizeDayNotes', () => {
  it('drops blank, duplicate, orphaned and malformed notes and trims text', () => {
    const result = normalizeDayNotes({
      days,
      dayNotes: [
        note({ id: 'a', text: '  keep me  ' }),
        note({ id: 'a', text: 'duplicate id' }),
        note({ id: 'b', text: '   ' }),
        note({ id: 'c', dayId: 'gone' }),
        null as never,
      ],
    });
    expect(result.map((n) => [n.id, n.text])).toEqual([['a', 'keep me']]);
  });

  it('returns several notes per day newest first and tolerates a missing collection', () => {
    const result = normalizeDayNotes({
      days,
      dayNotes: [
        note({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
        note({ id: 'new', createdAt: '2026-01-02T00:00:00.000Z' }),
      ],
    });
    expect(result.map((n) => n.id)).toEqual(['new', 'old']);
    expect(normalizeDayNotes({ days })).toEqual([]);
  });

  it('defaults missing or unknown colours to yellow and keeps known colours', () => {
    const result = normalizeDayNotes({
      days,
      dayNotes: [
        note({ id: 'legacy', color: undefined as never }),
        note({ id: 'unknown', color: 'purple' as never }),
        note({ id: 'pink', color: 'pink' }),
      ],
    });
    expect(Object.fromEntries(result.map((n) => [n.id, n.color]))).toEqual({
      legacy: 'yellow',
      unknown: 'yellow',
      pink: 'pink',
    });
  });
});
