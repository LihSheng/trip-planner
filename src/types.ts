export type PlaceCategory =
  | 'Landmark'
  | 'Food'
  | 'Nature'
  | 'Culture'
  | 'Shopping'
  | 'Relaxation';

export interface Place {
  id: string;
  name: string;
  region: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  notes: string;
}

export interface TripDay {
  id: string;
  label: string;
  placeIds: string[];
}

export interface TripState {
  version: 1;
  tripName: string;
  startDate: string;
  places: Place[];
  unscheduledIds: string[];
  visitedPlaceIds: string[];
  days: TripDay[];
}

export type ContainerId = 'unscheduled' | string;
