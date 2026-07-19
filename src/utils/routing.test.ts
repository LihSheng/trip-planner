import { describe, expect, it } from 'vitest';
import type { TripDay } from '../types';
import { effectiveLegMode, markRouteStale, routeLegKey } from './routing';

const day: TripDay = { id: 'day-1', label: 'Day 1', placeIds: ['a', 'b'], travelMode: 'public' };

describe('routing helpers', () => {
  it('uses a per-leg override only when one is selected', () => {
    expect(effectiveLegMode(day, 'a', 'b')).toBe('public');
    expect(effectiveLegMode({ ...day, legModeOverrides: { [routeLegKey('a', 'b')]: 'walk' } }, 'a', 'b')).toBe('walk');
  });

  it('marks saved routes stale without dropping their result', () => {
    const stale = markRouteStale({ ...day, routeUpdatedAt: '2026-01-01T00:00:00.000Z', routeLegs: [] });
    expect(stale.routeStale).toBe(true);
    expect(stale.routeUpdatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
