import { useCallback, useEffect, useRef, useState } from 'react';

export type LocationPermissionState = PermissionState | 'unsupported' | 'unknown';

export interface CurrentLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface CurrentLocationState {
  location: CurrentLocation | null;
  error: string | null;
  permission: LocationPermissionState;
  isTracking: boolean;
  isLoading: boolean;
  startTracking: () => void;
  stopTracking: () => void;
}

function geolocationErrorMessage(error: GeolocationPositionError) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission was denied. Enable location access in your browser settings.';
    case error.POSITION_UNAVAILABLE:
      return 'Your current location is unavailable. Check your device location settings.';
    case error.TIMEOUT:
      return 'Location lookup timed out. Try again in an area with a clearer signal.';
    default:
      return 'Unable to determine your current location.';
  }
}

export function useCurrentLocation(): CurrentLocationState {
  const watchId = useRef<number | null>(null);
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<LocationPermissionState>(
    typeof navigator === 'undefined' || !('geolocation' in navigator) ? 'unsupported' : 'unknown',
  );
  const [isTracking, setIsTracking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const stopTracking = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsTracking(false);
    setIsLoading(false);
  }, []);

  const startTracking = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPermission('unsupported');
      setError('Live location is not supported by this browser.');
      return;
    }

    if (watchId.current !== null) return;

    setError(null);
    setIsLoading(true);
    setIsTracking(true);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
        setPermission('granted');
        setError(null);
        setIsLoading(false);
      },
      (positionError) => {
        if (positionError.code === positionError.PERMISSION_DENIED) setPermission('denied');
        setError(geolocationErrorMessage(positionError));
        setIsLoading(false);
        stopTracking();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15_000,
        timeout: 12_000,
      },
    );
  }, [stopTracking]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;

    let permissionStatus: PermissionStatus | undefined;
    let cancelled = false;

    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled) return;
        permissionStatus = status;
        setPermission(status.state);
        status.onchange = () => setPermission(status.state);
      })
      .catch(() => setPermission('unknown'));

    return () => {
      cancelled = true;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, []);

  useEffect(() => stopTracking, [stopTracking]);

  return {
    location,
    error,
    permission,
    isTracking,
    isLoading,
    startTracking,
    stopTracking,
  };
}
