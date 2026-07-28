import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import type { FlightBooking, StayBooking, TripExpense } from '../types';
import { expenseSources, normalizeExpenseState } from './expenses';

describe('trip expenses', () => {
  it('migrates legacy hotel dates and expenses idempotently', () => {
    const state = createInitialState();
    state.places[0] = {
      ...state.places[0],
      category: 'Accommodation',
      stay: { checkInDate: '2026-11-07', checkOutDate: '2026-11-09' },
    };
    state.expenses = [{
      id: 'legacy',
      dayId: 'day-1',
      amount: 500,
      currency: 'TWD',
      category: 'food',
      createdAt: '2026-01-01T00:00:00.000Z',
    }];

    const once = normalizeExpenseState(state);
    const twice = normalizeExpenseState(once);

    expect(once.stayBookings).toEqual([expect.objectContaining({
      placeId: state.places[0].id,
      checkInDate: '2026-11-07',
      checkOutDate: '2026-11-09',
    })]);
    expect(once.stayBookings?.[0]).not.toHaveProperty('cost');
    expect(twice.stayBookings).toEqual(once.stayBookings);
    expect(twice.expenses).toEqual(once.expenses);

    const edited = {
      ...once,
      stayBookings: once.stayBookings?.map((booking) => ({ ...booking, checkOutDate: '2026-11-10' })),
    };
    expect(normalizeExpenseState(edited).stayBookings).toHaveLength(1);
  });

  it('counts each booking once despite multiple planner presentations', () => {
    const stay: StayBooking = {
      id: 'stay-1',
      placeId: 'taipei-101',
      checkInDate: '2026-11-07',
      checkOutDate: '2026-11-09',
      cost: { amount: 600, currency: 'MYR' },
    };
    const flight: FlightBooking = {
      id: 'flight-1',
      tripType: 'round-trip',
      totalCost: { amount: 1200, currency: 'MYR' },
      outbound: {
        airline: 'AirAsia', flightNumber: 'D7378',
        departureAirport: 'KUL', departureDate: '2026-11-07', departureTime: '10:00',
        arrivalAirport: 'TPE', arrivalDate: '2026-11-07', arrivalTime: '14:50',
      },
      return: {
        airline: 'AirAsia', flightNumber: 'D7379',
        departureAirport: 'TPE', departureDate: '2026-11-14', departureTime: '15:30',
        arrivalAirport: 'KUL', arrivalDate: '2026-11-14', arrivalTime: '20:20',
      },
    };
    const manual: TripExpense = {
      id: 'expense-1', name: 'Taipei 101 ticket', amount: 600, currency: 'TWD',
      category: 'ticket', createdAt: '2026-01-01T00:00:00.000Z',
    };

    expect(expenseSources({ ...createInitialState(), stayBookings: [stay], flightBookings: [flight], expenses: [manual] }))
      .toEqual([
        expect.objectContaining({ id: 'stay:stay-1', amount: 600 }),
        expect.objectContaining({ id: 'flight:flight-1', amount: 1200 }),
        expect.objectContaining({ id: 'manual:expense-1', amount: 600 }),
      ]);
  });

  it('creates one booking when a hotel appears on multiple planner days', () => {
    const state = createInitialState();
    const source = {
      ...state.places[0],
      id: 'hotel-source',
      category: 'Accommodation' as const,
      stay: { checkInDate: '2026-11-14', checkOutDate: '2026-11-17' },
    };
    const occurrence = { ...source, id: 'hotel-day-2', assignmentOf: source.id };

    const normalized = normalizeExpenseState({ ...state, places: [source, occurrence], stayBookings: [] });

    expect(normalized.stayBookings).toEqual([
      expect.objectContaining({ placeId: source.id, checkInDate: '2026-11-14', checkOutDate: '2026-11-17' }),
    ]);
  });

  it('consolidates saved duplicate stays and preserves their entered cost', () => {
    const state = createInitialState();
    const source = { ...state.places[0], id: 'hotel-source', category: 'Accommodation' as const, stay: undefined };
    const occurrence = { ...source, id: 'hotel-day-2', assignmentOf: source.id };

    const normalized = normalizeExpenseState({
      ...state,
      places: [source, occurrence],
      stayBookings: [
        { id: 'source-booking', placeId: source.id, checkInDate: '2026-11-14', checkOutDate: '2026-11-17' },
        { id: 'duplicate-with-cost', placeId: occurrence.id, checkInDate: '2026-11-14', checkOutDate: '2026-11-17', cost: { amount: 480, currency: 'MYR' } },
        { id: 'different-reservation', placeId: source.id, checkInDate: '2026-11-19', checkOutDate: '2026-11-20' },
      ],
    });

    expect(normalized.stayBookings).toHaveLength(2);
    expect(normalized.stayBookings).toContainEqual(expect.objectContaining({
      placeId: source.id,
      checkInDate: '2026-11-14',
      checkOutDate: '2026-11-17',
      cost: { amount: 480, currency: 'MYR' },
    }));
  });
});
