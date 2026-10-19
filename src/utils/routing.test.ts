import { describe, expect, it } from 'vitest';
import type { LocationCluster, Place, TripDay } from '../types';
import type { SavedLegTransit, TransitOption } from '../domain/transit';
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
    expect(leg.minutesSource).toBe('none');
    expect(leg.mode).toBe('public');
    expect(leg.transit).toEqual({ status: 'ineligible' });
  });

  describe('with a saved transit route', () => {
    const metro: TransitOption = { signature: 'metro:Red', minutes: 14, steps: [{ kind: 'metro', minutes: 14, line: 'Red' }] };
    const saved = (chosen?: string, departAt = '2026-10-20T10:30:00+08:00'): SavedLegTransit => ({
      provider: 'transitous',
      fetchedAt: '2026-10-19T01:00:00.000Z',
      basis: { from: { lat: 25.0, lng: 121.5 }, to: { lat: 25.0, lng: 121.6 }, departAt },
      options: [metro],
      ...(chosen ? { chosen } : {}),
    });
    const withRoute = (route: SavedLegTransit, extra: Partial<TripDay> = {}): TripDay => ({ ...day, transitByLeg: { 'a:b': route }, ...extra });

    it('uses the chosen route minutes on a public leg', () => {
      const leg = resolveLeg(withRoute(saved('metro:Red')), [], a, b);
      expect(leg.key).toBe('a:b');
      expect(leg.minutes).toBe(14);
      expect(leg.minutesSource).toBe('transit');
      expect(leg.transit).toMatchObject({ status: 'saved', chosen: metro, stale: [] });
    });

    it('beats same-area cluster minutes', () => {
      const leg = resolveLeg(withRoute(saved('metro:Red')), [cluster('same-area', { travelMinutes: 30, travelMode: 'public' })], a, b);
      expect(leg.minutes).toBe(14);
      expect(leg.minutesSource).toBe('transit');
    });

    it('keeps driving minutes when stale', () => {
      const shifted = withRoute(saved('metro:Red', '2026-10-20T15:00:00+08:00'), {
        timeManagementEnabled: true,
        stopSchedules: { a: { startTime: '09:00', durationMinutes: 60 } },
      });
      const leg = resolveLeg(shifted, [], a, b);
      expect(leg.minutes).toBe(14);
      expect(leg.transit).toMatchObject({ status: 'saved', stale: ['departureShifted'] });
    });

    it('falls back to the estimate without a valid choice', () => {
      const estimate = resolveLeg(day, [], a, b).minutes;
      expect(resolveLeg(withRoute(saved()), [], a, b)).toMatchObject({ minutes: estimate, minutesSource: 'estimate' });
      expect(resolveLeg(withRoute(saved('bus:Gone')), [], a, b)).toMatchObject({ minutes: estimate, minutesSource: 'estimate' });
    });

    it('ignores the route while the leg is overridden to another mode', () => {
      const leg = resolveLeg(withRoute(saved('metro:Red'), { legModeOverrides: { 'a:b': 'taxi' } }), [], a, b);
      expect(leg.transit).toEqual({ status: 'ineligible' });
      expect(leg.minutesSource).toBe('estimate');
    });

    it('ignores the route inside a venue', () => {
      const leg = resolveLeg(withRoute(saved('metro:Red')), [cluster('inside', { travelMinutes: 4 })], a, b);
      expect(leg.minutes).toBe(4);
      expect(leg.minutesSource).toBe('cluster');
    });
  });
});
