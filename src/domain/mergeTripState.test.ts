import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import { mergeTripStatesWithConflicts } from './mergeTripState';
import type { SavedLegTransit } from './transit';
import { normalizeTripState } from './tripRestoration';

describe('mergeTripStatesWithConflicts', () => {
  it('merges non-overlapping collaborator changes without a conflict', () => {
    const base = createInitialState();
    const local = { ...base, tripName: 'Local name' };
    const remote = { ...base, startDate: '2027-01-02' };

    const merged = mergeTripStatesWithConflicts(base, local, remote);

    expect(merged.conflicts).toEqual([]);
    expect(merged.state).toMatchObject({ tripName: 'Local name', startDate: '2027-01-02' });
  });

  it('reports same-field conflicts and applies an explicit resolution', () => {
    const base = createInitialState();
    const local = { ...base, tripName: 'Local name' };
    const remote = { ...base, tripName: 'Remote name' };

    const pending = mergeTripStatesWithConflicts(base, local, remote);
    expect(pending.conflicts).toEqual([{
      path: 'tripName',
      localValue: 'Local name',
      remoteValue: 'Remote name',
    }]);
    expect(mergeTripStatesWithConflicts(base, local, remote, { tripName: 'remote' }).state.tripName).toBe('Remote name');
  });

  it('merges transit routes saved on different legs of the same day without a conflict', () => {
    const route = (minutes: number): SavedLegTransit => ({
      provider: 'mock',
      fetchedAt: '2026-10-19T01:00:00.000Z',
      basis: { from: { lat: 25, lng: 121.5 }, to: { lat: 25.1, lng: 121.6 }, departAt: '2026-10-20T10:00:00+08:00' },
      options: [{ signature: 'bus:1', minutes, steps: [{ kind: 'bus', minutes, line: '1' }] }],
      chosen: 'bus:1',
    });
    const base = normalizeTripState(createInitialState());
    const withRoute = (key: string, minutes: number) => ({
      ...base,
      days: base.days.map((day) => day.id === 'day-1' ? { ...day, transitByLeg: { ...day.transitByLeg, [key]: route(minutes) } } : day),
    });

    const merged = mergeTripStatesWithConflicts(base, withRoute('taipei-101:ximending', 12), withRoute('ximending:taipei-101', 15));

    expect(merged.conflicts).toEqual([]);
    expect(merged.state.days[0].transitByLeg).toEqual({ 'taipei-101:ximending': route(12), 'ximending:taipei-101': route(15) });
  });

  it('reports delete-versus-edit conflicts for keyed domain records', () => {
    const base = createInitialState();
    const target = base.places[0];
    const local = { ...base, places: base.places.filter((place) => place.id !== target.id) };
    const remote = { ...base, places: base.places.map((place) => place.id === target.id ? { ...place, name: 'Remote edit' } : place) };

    const pending = mergeTripStatesWithConflicts(base, local, remote);

    expect(pending.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: `places.${target.id}`, localValue: undefined }),
    ]));
  });
});
