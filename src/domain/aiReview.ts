import type { TripState } from '../types';

export const REVIEW_AREAS = ['Pacing', 'Travel time', 'Opening hours', 'Meals & rest', 'Weather fit'] as const;
export type ReviewArea = (typeof REVIEW_AREAS)[number];

export type SuggestionChange =
  | { kind: 'move-visit'; placeId: string; fromDayId: string; toDayId: string; afterPlaceId: string | null }
  | { kind: 'set-time'; placeId: string; dayId: string; startTime: string }
  | { kind: 'remove-visit'; placeId: string; dayId: string }
  | { kind: 'add-task'; dayId: string; text: string };

export interface ReviewSource { title: string; url: string }

export interface Suggestion {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  sources: ReviewSource[];
  changes: SuggestionChange[];
}

export interface ReviewNote { dayId?: string; text: string; sources: ReviewSource[] }

export interface AiReview {
  overall: number;
  scores: Record<ReviewArea, number>;
  summary: string;
  notes: ReviewNote[];
  suggestions: Suggestion[];
}

/** A Suggestion is out of date once a visit or day it names is gone from the Trip. */
export function isSuggestionCurrent(state: TripState, suggestion: Suggestion): boolean {
  // TODO(human)
  void state; void suggestion;
  return true;
}
