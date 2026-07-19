export type PlaceCategory =
  | 'Landmark'
  | 'Food'
  | 'Nature'
  | 'Culture'
  | 'Shopping'
  | 'Relaxation';

export type PlaceType = 'place' | 'hotel' | 'airport' | 'station' | 'transit';
export type TravelMode = 'public' | 'walk' | 'bike' | 'car';

export interface OpeningHours {
  opensAt: string;
  closesAt: string;
}

export interface StopSchedule {
  startTime?: string;
  durationMinutes?: number;
}

export interface Place {
  id: string;
  name: string;
  region: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  notes: string;
  type?: PlaceType;
  openingHours?: OpeningHours;
}

export interface TripDay {
  id: string;
  label: string;
  placeIds: string[];
  travelMode?: TravelMode;
  startTime?: string;
  stopSchedules?: Record<string, StopSchedule>;
  lodgingPlaceId?: string;
  timeManagementEnabled?: boolean;
}

export interface TripState {
  version: 1;
  tripName: string;
  startDate: string;
  places: Place[];
  unscheduledIds: string[];
  visitedPlaceIds: string[];
  days: TripDay[];
  hotelPlaceId?: string;
}

export type ContainerId = 'unscheduled' | string;
