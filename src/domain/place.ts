import type { CurrencyCode, Place, PlaceCategory } from '../types';

export const PLACE_CATEGORIES: readonly PlaceCategory[] = [
  'Landmark',
  'Food',
  'Nature',
  'Culture',
  'Shopping',
  'Relaxation',
  'Accommodation',
  'Airport',
  'Station',
  'Transit',
];

const PLACE_CATEGORY_SET = new Set<string>(PLACE_CATEGORIES);

type LegacyPlaceType = 'place' | 'hotel' | 'airport' | 'station' | 'transit' | 'placeholder';
type LegacyPlace = Place & { type?: LegacyPlaceType };

const LEGACY_TYPE_CATEGORY: Partial<Record<LegacyPlaceType, PlaceCategory>> = {
  hotel: 'Accommodation',
  airport: 'Airport',
  station: 'Station',
  transit: 'Transit',
};

export function isPlaceCategory(value: unknown): value is PlaceCategory {
  return typeof value === 'string' && PLACE_CATEGORY_SET.has(value);
}

export function isPlaceholder(place: Pick<Place, 'placeholderKind'>) {
  return Boolean(place.placeholderKind);
}

/** Converts legacy place.type into category and removes type from canonical state. */
export function normalizePlace(place: LegacyPlace): Place {
  const { type, ...canonical } = place;
  const legacyCategory = type ? LEGACY_TYPE_CATEGORY[type] : undefined;
  return {
    ...canonical,
    category: legacyCategory ?? (isPlaceCategory(place.category) ? place.category : 'Landmark'),
  };
}

export interface PlaceDetailsValues {
  name: string;
  region: string;
  category: PlaceCategory;
  latitude: number | string;
  longitude: number | string;
  notes: string;
  opensAt: string;
  closesAt: string;
  checkInDate: string;
  checkOutDate: string;
  stayCost?: number | string;
  stayCurrency?: CurrencyCode;
}

export type PlaceDetailsErrors = Partial<Record<keyof PlaceDetailsValues, string>>;

export function validatePlaceDetails(values: PlaceDetailsValues): PlaceDetailsErrors {
  const errors: PlaceDetailsErrors = {};
  if (values.name.trim().length < 2) errors.name = 'Enter a place name';
  if (values.region.trim().length < 2) errors.region = 'Enter a region or city';
  if (typeof values.latitude !== 'number' || values.latitude < -90 || values.latitude > 90) errors.latitude = 'Use a valid latitude';
  if (typeof values.longitude !== 'number' || values.longitude < -180 || values.longitude > 180) errors.longitude = 'Use a valid longitude';
  if (values.category === 'Accommodation') {
    if (values.checkInDate && !values.checkOutDate) errors.checkOutDate = 'Enter a check-out date';
    if (!values.checkInDate && values.checkOutDate) errors.checkInDate = 'Enter a check-in date';
    if (values.checkInDate && values.checkOutDate && values.checkOutDate < values.checkInDate) errors.checkOutDate = 'Must be on or after check-in';
  }
  return errors;
}
