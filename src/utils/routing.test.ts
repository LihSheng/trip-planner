import { describe, expect, it } from 'vitest';
import type { LocationCluster, Place, TripDay } from '../types';
import { resolveLeg } from './routing';

const day: TripDay = { id: 'day-1', label: 'Day 1', placeIds: ['a', 'b'], travelMode: 'public' };

const place = (id: string, latitude: number, longitude: number, extra: Partial<Place> = {}): Place => ({
  id, name: id, region: 'Taipei', category: 'Landmark', latitude, longitude, notes: '', ...extra,
});

describe('resolveLeg', () => {
  const a = place('a', 25.0, 121.5);
  const b = place('b', 25.0, 121.6);
  const cluster = (relationship: 'inside' | 'walkable' | 'same-area', extra = {}): LocationCluster => ({
    id: 'c1', name: 'Cluster', anchorPlaceId: 'a',
    members: [{ placeId: 'a', relationship: 'inside' }, { placeId: 'b', relationship, ...extra }],
  });

  it('uses the day default mode and an estimated duration', () => {
    const leg = resolveLeg({ ...day, travelMode: 'car' }, [], a, b);
    expect(leg.mode).toBe('car');
    expect(leg.legMode).toBe('default');
    expect(leg.inside).toBe(false);
    expect(leg.relationship).toBeUndefined();
    expect(leg.minutes).toBeGreaterThan(0);
  });

  it('prefers an explicit override', () => {
    const leg = resolveLeg({ ...day, legModeOverrides: { 'a:b': 'bike' } }, [], a, b);
    expect(leg.legMode).toBe('bike');
    expect(leg.mode).toBe('bike');
  });

  it('walks inside a cluster using the member minutes', () => {
    const leg = resolveLeg({ ...day, legModeOverrides: { 'a:b': 'car' } }, [cluster('inside', { travelMinutes: 4 })], a, b);
    expect(leg.inside).toBe(true);
    expect(leg.relationship).toBe('inside');
    expect(leg.mode).toBe('walk');
    expect(leg.minutes).toBe(4);
  });

  it('walks for walkable cluster members', () => {
    const leg = resolveLeg(day, [cluster('walkable', { walkMinutes: 7 })], a, b);
    expect(leg.relationship).toBe('walkable');
    expect(leg.mode).toBe('walk');
    expect(leg.minutes).toBe(7);
  });

  it('leaves minutes undefined when a stop is a placeholder', () => {
    const leg = resolveLeg(day, [], a, place('b', 25.0, 121.6, { placeholderKind: 'free-time' as Place['placeholderKind'] }));
    expect(leg.minutes).toBeUndefined();
    expect(leg.mode).toBe('public');
  });
});
