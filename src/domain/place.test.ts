import { describe, expect, it } from 'vitest';
import type { Place } from '../types';
import { isPlaceholder, normalizePlace, validatePlaceDetails } from './place';

const place: Place = {
  id: 'place',
  name: 'Test place',
  region: 'Taipei',
  category: 'Landmark',
  latitude: 25,
  longitude: 121,
  notes: '',
};

describe('place domain', () => {
  it.each([
    ['hotel', 'Accommodation'],
    ['airport', 'Airport'],
    ['station', 'Station'],
    ['transit', 'Transit'],
  ] as const)('normalizes legacy %s type into %s category', (type, category) => {
    const normalized = normalizePlace({ ...place, type } as Place & { type: typeof type });
    expect(normalized.category).toBe(category);
    expect(normalized).not.toHaveProperty('type');
  });

  it('identifies placeholders without a type discriminator', () => {
    expect(isPlaceholder({ placeholderKind: 'meal' })).toBe(true);
    expect(isPlaceholder({})).toBe(false);
  });

  it('shares validation for canonical place details', () => {
    expect(validatePlaceDetails({
      name: 'Hotel',
      region: 'Taipei',
      category: 'Accommodation',
      latitude: 25,
      longitude: 121,
      notes: '',
      opensAt: '',
      closesAt: '',
      checkInDate: '2026-11-17',
      checkOutDate: '2026-11-14',
    })).toMatchObject({ checkOutDate: 'Must be on or after check-in' });
  });
});
