import type { ExpenseCategory, Money, TripExpense, TripState } from '../types';

export type ExpenseSource = {
  id: string;
  source: 'stay' | 'flight' | 'manual';
  sourceId: string;
  name: string;
  category: ExpenseCategory | 'flight';
  amount: number;
  currency: Money['currency'];
};

function legacyStayId(placeId: string, checkInDate: string, checkOutDate: string) {
  return `legacy-stay:${placeId}:${checkInDate}:${checkOutDate}`;
}

export function normalizeExpenseState(state: TripState): TripState {
  const placesById = new Map(state.places.map((place) => [place.id, place]));
  const rootPlaceId = (placeId: string) => placesById.get(placeId)?.assignmentOf ?? placeId;
  const consolidated = new Map<string, { booking: NonNullable<TripState['stayBookings']>[number]; canonical: boolean }>();
  for (const rawBooking of Array.isArray(state.stayBookings) ? state.stayBookings : []) {
    const placeId = rootPlaceId(rawBooking.placeId);
    const key = `${placeId}:${rawBooking.checkInDate}:${rawBooking.checkOutDate}`;
    const candidate = { ...rawBooking, placeId };
    const candidateCanonical = rawBooking.placeId === placeId;
    const current = consolidated.get(key);
    if (!current) {
      consolidated.set(key, { booking: candidate, canonical: candidateCanonical });
      continue;
    }
    if (candidateCanonical && !current.canonical) {
      consolidated.set(key, {
        booking: { ...candidate, cost: candidate.cost ?? current.booking.cost },
        canonical: true,
      });
    } else if (!current.booking.cost && candidate.cost) {
      consolidated.set(key, { ...current, booking: { ...current.booking, cost: candidate.cost } });
    }
  }
  const existing = [...consolidated.values()].map(({ booking }) => booking);
  const existingIds = new Set(existing.map((booking) => booking.id));
  const migrated = state.places.flatMap((place) => {
    if (place.assignmentOf || place.category !== 'Accommodation' || !place.stay?.checkInDate || !place.stay.checkOutDate) return [];
    const id = legacyStayId(place.id, place.stay.checkInDate, place.stay.checkOutDate);
    const alreadyMigrated = existingIds.has(id) || existing.some((booking) => booking.placeId === place.id && (
      booking.id.startsWith(`legacy-stay:${place.id}:`)
      || (booking.checkInDate === place.stay?.checkInDate && booking.checkOutDate === place.stay?.checkOutDate)
    ));
    return alreadyMigrated ? [] : [{
      id,
      placeId: place.id,
      checkInDate: place.stay.checkInDate,
      checkOutDate: place.stay.checkOutDate,
    }];
  });
  return {
    ...state,
    stayBookings: [...existing, ...migrated],
    flightBookings: Array.isArray(state.flightBookings) ? state.flightBookings : [],
    expenses: (Array.isArray(state.expenses) ? state.expenses : []).map((expense) => ({
      ...expense,
      name: expense.name ?? expense.note ?? 'Expense',
      currency: expense.currency ?? 'TWD',
    })),
  };
}

export function expenseSources(state: TripState): ExpenseSource[] {
  const places = new Map(state.places.map((place) => [place.id, place]));
  return [
    ...(state.stayBookings ?? []).flatMap((booking) => booking.cost ? [{
      id: `stay:${booking.id}`,
      source: 'stay' as const,
      sourceId: booking.id,
      name: `${places.get(booking.placeId)?.name ?? 'Accommodation'} · ${booking.checkInDate}–${booking.checkOutDate}`,
      category: 'accommodation' as const,
      ...booking.cost,
    }] : []),
    ...(state.flightBookings ?? []).flatMap((booking) => booking.totalCost ? [{
      id: `flight:${booking.id}`,
      source: 'flight' as const,
      sourceId: booking.id,
      name: `${booking.outbound.departureAirport} → ${booking.outbound.arrivalAirport}${booking.tripType === 'round-trip' ? ' round trip' : ''}`,
      category: 'flight' as const,
      ...booking.totalCost,
    }] : []),
    ...(state.expenses ?? []).map((expense: TripExpense) => ({
      id: `manual:${expense.id}`,
      source: 'manual' as const,
      sourceId: expense.id,
      name: expense.name ?? expense.note ?? 'Expense',
      category: expense.category,
      amount: expense.amount,
      currency: expense.currency,
    })),
  ];
}
