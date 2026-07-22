export type PlaceCategory =
  | 'Landmark'
  | 'Food'
  | 'Nature'
  | 'Culture'
  | 'Shopping'
  | 'Relaxation';

export type PlaceType = 'place' | 'hotel' | 'airport' | 'station' | 'transit' | 'placeholder';
export type PlaceholderKind = 'meal' | 'coffee' | 'free-time' | 'custom';
export type TravelMode = 'public' | 'walk' | 'bike' | 'car' | 'taxi' | 'other';

export type RouteLegMode = TravelMode | 'default';

export interface RouteStep {
  instruction: string;
  durationMinutes?: number;
  distanceMeters?: number;
  transitLine?: string;
}

export interface RouteLeg {
  fromPlaceId: string;
  toPlaceId: string;
  mode: TravelMode;
  durationMinutes: number;
  distanceMeters: number;
  departureTime?: string;
  arrivalTime?: string;
  fare?: string;
  polyline?: string;
  steps?: RouteStep[];
}

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
  placeholderKind?: PlaceholderKind;
  openingHours?: OpeningHours;
}

export type ActivityDurationSource =
  | 'user'
  | 'imported'
  | 'category_estimate'
  | 'generic_estimate';

export interface ActivityBooking {
  isConfirmed: boolean;
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
  arrivalBufferMinutes: number;
  reference?: string;
  notes?: string;
}

export interface ActivityLock {
  lockDay: boolean;
  lockTime: boolean;
}

/**
 * Canonical planning entity. A place describes where something is; an activity
 * describes what the traveller intends to do and how it is scheduled.
 */
export interface Activity {
  id: string;
  tripId?: string;
  title: string;
  placeId?: string;
  dayId?: string;
  sortOrder: number;
  durationMinutes?: number;
  durationSource?: ActivityDurationSource;
  preferredStartTime?: string;
  notes?: string;
  category?: PlaceCategory;
  booking?: ActivityBooking;
  lock: ActivityLock;
  createdAt?: string;
  updatedAt?: string;
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
  routeLegs?: RouteLeg[];
  legModeOverrides?: Record<string, RouteLegMode>;
  routeUpdatedAt?: string;
  routeStale?: boolean;
  routeError?: string;
}

export type StopExecutionStatus = 'upcoming' | 'current' | 'completed' | 'skipped' | 'rescheduled';

export interface StopExecutionState {
  placeId: string;
  status: StopExecutionStatus;
  arrivedAt?: string;
  completedAt?: string;
  skippedAt?: string;
}

/** Execution data is intentionally separate from place and schedule planning fields. */
export interface DayExecutionState {
  dayId: string;
  selectedAt: string;
  stopStates: Record<string, StopExecutionState>;
  updatedAt: string;
}

export type ExpenseCategory = 'food' | 'transport' | 'ticket' | 'shopping' | 'accommodation' | 'other';

export interface TripExpense {
  id: string;
  dayId: string;
  placeId?: string;
  amount: number;
  currency: 'TWD';
  category: ExpenseCategory;
  note?: string;
  createdAt: string;
}

export interface TripState {
  version: 1;
  tripName: string;
  startDate: string;
  places: Place[];
  /**
   * Activity snapshot introduced by the activity-domain foundation. During the
   * compatibility period, legacy place/day arrays remain the UI persistence source.
   */
  activities?: Activity[];
  unscheduledIds: string[];
  visitedPlaceIds: string[];
  days: TripDay[];
  hotelPlaceId?: string;
  executionByDay?: Record<string, DayExecutionState>;
  expenses?: TripExpense[];
  displayCurrency?: CurrencyCode;
}

export type CurrencyCode = 'MYR' | 'SGD' | 'USD' | 'EUR' | 'JPY' | 'CNY' | 'AUD' | 'GBP';

export type ContainerId = 'unscheduled' | string;
