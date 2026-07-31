import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import { mergeTripStatesWithConflicts } from './mergeTripState';

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
