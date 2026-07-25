import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCurrentLocation } from './useCurrentLocation';

describe('useCurrentLocation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks a location and clears the browser watcher', () => {
    const clearWatch = vi.fn();
    const watchPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 3.139,
          longitude: 101.6869,
          accuracy: 12,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: 123,
        toJSON: () => ({}),
      });
      return 7;
    });

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition, clearWatch },
    });

    const { result, unmount } = renderHook(() => useCurrentLocation());

    act(() => result.current.startTracking());

    expect(result.current.location).toMatchObject({
      latitude: 3.139,
      longitude: 101.6869,
      accuracy: 12,
    });
    expect(result.current.permission).toBe('granted');

    act(() => result.current.stopTracking());
    expect(clearWatch).toHaveBeenCalledWith(7);

    unmount();
  });

  it('exposes a useful error when permission is denied', () => {
    const watchPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
      error({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
      return 3;
    });

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition, clearWatch: vi.fn() },
    });

    const { result } = renderHook(() => useCurrentLocation());

    act(() => result.current.startTracking());

    expect(result.current.permission).toBe('denied');
    expect(result.current.error).toContain('Location permission was denied');
    expect(result.current.isTracking).toBe(false);
  });
});
