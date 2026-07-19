import type { Place, RouteLeg, TravelMode, TripDay } from '../types';
import { supabasePublishableKey, supabaseUrl } from './supabaseConfig';

interface RoutePlanResponse {
  placeIds?: string[];
  legs: RouteLeg[];
  routeError?: string;
}

export async function requestRoutePlan(accessToken: string, payload: {
  tripOwnerId: string; startDate: string; day: TripDay; places: Place[];
  operation: 'optimize' | 'leg'; fromPlaceId?: string; toPlaceId?: string; mode?: TravelMode;
}): Promise<RoutePlanResponse> {
  const response = await fetch(`${supabaseUrl}/functions/v1/route-plan`, {
    method: 'POST',
    headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error((await response.text()) || `Route request failed (${response.status})`);
  return response.json() as Promise<RoutePlanResponse>;
}
