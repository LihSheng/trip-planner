import { describe, expect, it } from 'vitest';
import type { DayExecutionState, Place, TripDay } from '../types';
import {
  googleMapsRouteUrl,
  googleDirectionsUrl,
  googleSearchUrl,
  legGoogleMapsUrl,
  markerColors,
  navigationUrl,
  placeStatus,
  timeRange,
} from './mapPresentation';

const place = (overrides: Partial<Place> = {}): Place => ({
  id: 'p1',
  name: 'Taipei 101',
  region: 'Xinyi',
  category: 'Landmark',
  latitude: 25.033,
  longitude: 121.565,
  notes: '',
  ...overrides,
});

describe('markerColors', () => {
  it('has a colour for every category', () => {
    expect(Object.keys(markerColors)).toHaveLength(7);
    expect(markerColors.Landmark).toBe('#f08c46');
    expect(markerColors.Accommodation).toBe('#5f3dc4');
  });
});

describe('googleMapsRouteUrl', () => {
  it('returns null for an empty array', () => {
    expect(googleMapsRouteUrl([])).toBeNull();
  });

  it('returns a search URL for a single place', () => {
    const url = googleMapsRouteUrl([place()])!;
    expect(url).toContain('maps/search');
    expect(url).toContain('25.033');
  });

  it('returns a directions URL with waypoints for multiple places', () => {
    const places = [
      place({ id: 'a', latitude: 1, longitude: 2 }),
      place({ id: 'b', latitude: 3, longitude: 4 }),
      place({ id: 'c', latitude: 5, longitude: 6 }),
    ];
    const url = googleMapsRouteUrl(places)!;
    expect(url).toContain('maps/dir');
    expect(url).toContain('origin=1%2C2');
    expect(url).toContain('destination=5%2C6');
    expect(url).toContain('waypoints=3%2C4');
  });
});

describe('googleSearchUrl', () => {
  it('includes name and region', () => {
    const url = googleSearchUrl(place());
    expect(url).toContain('Taipei+101');
    expect(url).toContain('Xinyi');
  });
});

describe('googleDirectionsUrl', () => {
  it('sets only a destination when live location is unavailable', () => {
    const url = googleDirectionsUrl(place());
    expect(url).toContain('maps/dir');
    expect(url).toContain('destination=25.033%2C121.565');
    expect(url).not.toContain('origin=');
  });

  it('includes live coordinates as the origin', () => {
    const url = googleDirectionsUrl(place(), { latitude: 10, longitude: 20 });
    expect(url).toContain('origin=10%2C20');
  });
});

describe('legGoogleMapsUrl', () => {
  it('maps public to transit', () => {
    const url = legGoogleMapsUrl(
      place({ latitude: 1, longitude: 2 }),
      place({ latitude: 3, longitude: 4 }),
      'public',
    );
    expect(url).toContain('travelmode=transit');
  });

  it('maps walk to walking', () => {
    const url = legGoogleMapsUrl(place(), place(), 'walk');
    expect(url).toContain('travelmode=walking');
  });

  it('omits travelmode for other', () => {
    const url = legGoogleMapsUrl(place(), place(), 'other');
    expect(url).not.toContain('travelmode');
  });
});

describe('navigationUrl', () => {
  it('includes destination', () => {
    const url = navigationUrl(place());
    expect(url).toContain('destination=25.033');
    expect(url).toContain('travelmode=walking');
  });

  it('includes origin when provided', () => {
    const url = navigationUrl(place(), { latitude: 10, longitude: 20 });
    expect(url).toContain('origin=10%2C20');
  });
});

describe('placeStatus', () => {
  const day: TripDay = {
    id: 'day-1',
    label: 'Day 1',
    placeIds: ['p1', 'p2', 'p3'],
  };

  it('returns stored status when available', () => {
    const execution: DayExecutionState = {
      dayId: 'day-1',
      selectedAt: '',
      stopStates: { p2: { placeId: 'p2', status: 'skipped' } },
      updatedAt: '',
    };
    expect(placeStatus(day, execution, 'p2')).toBe('skipped');
  });

  it('returns current for the first eligible stop', () => {
    expect(placeStatus(day, undefined, 'p1')).toBe('current');
  });

  it('returns upcoming for later stops', () => {
    expect(placeStatus(day, undefined, 'p2')).toBe('upcoming');
  });
});

describe('timeRange', () => {
  const day: TripDay = {
    id: 'day-1',
    label: 'Day 1',
    placeIds: ['p1'],
    stopSchedules: {
      p1: { startTime: '09:00', durationMinutes: 90 },
      p2: { startTime: '14:00' },
    },
  };

  it('returns formatted range when both start and duration exist', () => {
    expect(timeRange(day, 'p1')).toBe('09:00–10:30');
  });

  it('returns just start time when no duration', () => {
    expect(timeRange(day, 'p2')).toBe('14:00');
  });

  it('returns fallback when no schedule exists', () => {
    expect(timeRange(day, 'p99')).toBe('No fixed time');
  });
});
