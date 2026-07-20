import type { PlaceCategory, PlaceType, TravelMode, TripState } from '../types';

export type AiImportSource = { type: 'text'; content: string } | { type: 'url'; url: string };
export type AiPlaceResolution = 'resolved' | 'ambiguous' | 'not-found' | 'existing-place';

export interface AiPlaceAlternative {
  id: string;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
}

export interface AiResolvedPlace {
  tempId: string;
  name: string;
  region: string;
  category: PlaceCategory;
  type: Exclude<PlaceType, 'placeholder'>;
  latitude?: number;
  longitude?: number;
  notes: string;
  suggestedStartTime?: string;
  durationMinutes?: number;
  confidence: number;
  sourceEvidence: string;
  resolution: AiPlaceResolution;
  existingPlaceId?: string;
  alternatives?: AiPlaceAlternative[];
  included: boolean;
}

export interface AiDraftDay {
  tempId: string;
  label: string;
  places: AiResolvedPlace[];
}

export interface AiItineraryDraft {
  requestId: string;
  sourceTitle?: string;
  sourceUrl?: string;
  summary: string;
  destination?: string;
  days: AiDraftDay[];
  unscheduled: AiResolvedPlace[];
  warnings: string[];
  provider: string;
  model: string;
}

export interface AiImportRequest {
  source: AiImportSource;
  preferences: { requestedDays?: number; pace: 'relaxed' | 'balanced' | 'packed'; travelMode?: TravelMode; mergeMode: 'new-days' | 'unscheduled' };
  existingTrip: Pick<TripState, 'tripName' | 'startDate'> & { places: Array<Pick<TripState['places'][number], 'id' | 'name' | 'region' | 'latitude' | 'longitude'>> };
}

export interface ConfirmedAiDraft {
  draft: AiItineraryDraft;
  preferences: AiImportRequest['preferences'];
}
