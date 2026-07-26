import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import { describeTripChanges } from './tripActivity';

describe('describeTripChanges', () => {
  it('credits an AI-added place and a changed schedule', () => {
    const previous = createInitialState();
    const next = structuredClone(previous);
    next.places.push({ id: 'ai-place', name: 'Taipei 101', region: 'Taipei', category: 'Landmark', latitude: 25, longitude: 121, notes: '', importedWithAi: true });
    next.unscheduledIds.push('ai-place');
    next.days[0].stopSchedules = { 'taipei-101': { startTime: '09:00' } };

    expect(describeTripChanges(previous, next)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'place_added', targetName: 'Taipei 101', detail: 'Imported with AI' }),
      expect.objectContaining({ type: 'day_updated' }),
    ]));
  });
});
