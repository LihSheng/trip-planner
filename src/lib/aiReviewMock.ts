import type { TripState } from '../types';
import type { AiReview, Suggestion } from '../domain/aiReview';
import { isPlaceholder } from '../domain/place';
import { isAccommodation } from '../utils/stay';

// Prototype stand-in for the ai-trip-review edge function. It builds a believable review from the
// real trip so Apply exercises real planner actions; delete it once the function is wired in.
export function mockAiReview(state: TripState): AiReview {
  const places = new Map(state.places.map((place) => [place.id, place]));
  const days = state.days.map((day) => ({
    day,
    visits: day.placeIds.filter((id) => { const place = places.get(id); return place && !isAccommodation(place); }),
  }));
  const busiest = [...days].sort((a, b) => b.visits.length - a.visits.length)[0];
  const lightest = [...days].sort((a, b) => a.visits.length - b.visits.length)[0];
  const suggestions: Suggestion[] = [];
  const weatherSource = { title: 'Central Weather Administration forecast (example)', url: 'https://www.cwa.gov.tw/' };

  if (busiest && lightest && busiest.day.id !== lightest.day.id && busiest.visits.length >= 2) {
    const placeId = busiest.visits[busiest.visits.length - 1];
    suggestions.push({
      id: 'move', severity: 'high',
      title: `${busiest.day.label} is overpacked. Move ${places.get(placeId)?.name} to ${lightest.day.label}.`,
      reason: `${busiest.day.label} has ${busiest.visits.length} stops and ${lightest.day.label} has ${lightest.visits.length}. Moving the last stop evens out the walking and travel time.`,
      sources: [],
      changes: [{ kind: 'move-visit', placeId, fromDayId: busiest.day.id, toDayId: lightest.day.id, afterPlaceId: lightest.visits[lightest.visits.length - 1] ?? null }],
    });
  }

  const timed = days.find(({ day, visits }) => day.timeManagementEnabled && visits.length > 0);
  if (timed) {
    const placeId = timed.visits[0];
    suggestions.push({
      id: 'time', severity: 'medium',
      title: `Start ${places.get(placeId)?.name} at 09:30`,
      reason: 'Popular sights in Taipei get crowded from late morning. An earlier start keeps the queue short.',
      sources: [],
      changes: [{ kind: 'set-time', placeId, dayId: timed.day.id, startTime: '09:30' }],
    });
  }

  const placeholderDay = days.find(({ visits }) => visits.some((id) => isPlaceholder(places.get(id)!)));
  const removal = placeholderDay
    ? { dayId: placeholderDay.day.id, label: placeholderDay.day.label, placeId: placeholderDay.visits.find((id) => isPlaceholder(places.get(id)!))! }
    : busiest && busiest.visits.length >= 2 ? { dayId: busiest.day.id, label: busiest.day.label, placeId: busiest.visits[0] } : null;
  if (removal) {
    suggestions.push({
      id: 'remove', severity: 'low',
      title: `Drop ${places.get(removal.placeId)?.name} on ${removal.label}`,
      reason: 'It is optional and overlaps with the next stop. Dropping it frees about an hour. It stays in your unscheduled places.',
      sources: [],
      changes: [{ kind: 'remove-visit', placeId: removal.placeId, dayId: removal.dayId }],
    });
  }

  if (days[0]) {
    suggestions.push({
      id: 'task', severity: 'low',
      title: `Book dinner for ${days[0].day.label}`,
      reason: 'Popular restaurants near your first-day stops often take reservations a few days ahead.',
      sources: [{ title: 'Restaurant booking page (example)', url: 'https://www.google.com/maps' }],
      changes: [{ kind: 'add-task', dayId: days[0].day.id, text: 'Book a dinner table for tonight' }],
    });
  }

  const wetDay = days[1] ?? days[0];
  const pacing = Math.max(3, 10 - Math.max(0, (busiest?.visits.length ?? 0) - 3));
  return {
    overall: 7,
    scores: { Pacing: pacing, 'Travel time': 6, 'Opening hours': 8, 'Meals & rest': 5, 'Weather fit': 7 },
    summary: `A solid ${state.days.length}-day plan. ${busiest ? `${busiest.day.label} carries the most stops,` : ''} and meals are not planned on most days.`,
    notes: wetDay ? [{ dayId: wetDay.day.id, text: 'Showers are likely in the afternoon. Keep an umbrella and an indoor option nearby.', sources: [weatherSource] }] : [],
    suggestions,
  };
}
