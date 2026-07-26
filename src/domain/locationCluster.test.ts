import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import type { Place } from '../types';
import { assignPlaceToCluster, distanceMeters, normalizeLocationClusters } from './locationCluster';
import { mergeTripStates } from './mergeTripState';

const cafe: Place = {
  id: 'simple-kaffa',
  name: 'Simple Kaffa',
  region: 'Taipei',
  category: 'Food',
  latitude: 25.0331,
  longitude: 121.5655,
  notes: '',
};

describe('location clusters', () => {
  it('creates one anchored cluster and changes a member relationship', () => {
    const state = { ...createInitialState(), places: [...createInitialState().places, cafe] };
    const grouped = assignPlaceToCluster(state, cafe.id, {
      targetPlaceId: 'taipei-101',
      relationship: 'inside',
    });
    const updated = assignPlaceToCluster(grouped, cafe.id, {
      targetPlaceId: 'taipei-101',
      relationship: 'nearby',
      walkMinutes: 4,
    });

    expect(updated.locationClusters).toHaveLength(1);
    expect(updated.locationClusters?.[0]).toMatchObject({
      anchorPlaceId: 'taipei-101',
      members: [{ placeId: cafe.id, relationship: 'nearby', walkMinutes: 4 }],
    });
  });

  it('drops missing and duplicate memberships during normalization', () => {
    const state = {
      ...createInitialState(),
      locationClusters: [
        { id: 'one', name: 'Taipei', anchorPlaceId: 'taipei-101', members: [{ placeId: 'ximending', relationship: 'nearby' as const }] },
        { id: 'two', name: 'Duplicate', anchorPlaceId: 'jiufen', members: [{ placeId: 'ximending', relationship: 'inside' as const }, { placeId: 'missing', relationship: 'nearby' as const }] },
      ],
    };

    expect(normalizeLocationClusters(state)).toEqual([
      expect.objectContaining({ id: 'one', members: [expect.objectContaining({ placeId: 'ximending' })] }),
    ]);
  });

  it('measures close coordinates for grouping suggestions', () => {
    expect(distanceMeters(createInitialState().places[0], cafe)).toBeLessThan(25);
  });

  it('preserves concurrent additions to the same cluster', () => {
    const base = {
      ...createInitialState(),
      locationClusters: [{
        id: 'taipei-cluster',
        name: 'Taipei 101 area',
        anchorPlaceId: 'taipei-101',
        members: [{ placeId: 'ximending', relationship: 'nearby' as const, walkMinutes: 8 }],
      }],
    };
    const local = {
      ...base,
      locationClusters: [{
        ...base.locationClusters[0],
        members: [...base.locationClusters[0].members, { placeId: 'jiufen', relationship: 'nearby' as const, walkMinutes: 7 }],
      }],
    };
    const remote = {
      ...base,
      locationClusters: [{
        ...base.locationClusters[0],
        members: [...base.locationClusters[0].members, { placeId: 'shifen', relationship: 'inside' as const }],
      }],
    };

    expect(mergeTripStates(base, local, remote).locationClusters?.[0].members.map((member) => member.placeId)).toEqual([
      'ximending',
      'shifen',
      'jiufen',
    ]);
  });
});
