import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../data/seed';
import { latLngOf, routeLegKey } from '../domain/transit';
import { exportTripExcel, exportTripJson, exportTripMarkdown, formatDayPlainText, formatTripPlainText } from './exportTrip';

describe('plain-text itinerary export', () => {
  it('includes trip header, dated day names and notes without coordinates', () => {
    const text = formatTripPlainText(createInitialState());

    expect(text).toMatch(/^🧳 /);
    expect(text).toContain('📅 Day 1 · Sat 7 Nov — Taipei arrival');
    expect(text).toContain('—      Taipei 101');
    expect(text).toContain('       Observation deck and Xinyi district walk.');
    expect(text).not.toContain('25.033');
    expect(text).not.toContain('121.5654');
  });

  it('shows start time and duration in the time column when scheduled', () => {
    const state = createInitialState();
    const [firstId] = state.days[0].placeIds;
    state.days[0].stopSchedules = { [firstId]: { startTime: '09:00', durationMinutes: 90 } };
    state.days[0].timeManagementEnabled = true;

    expect(formatTripPlainText(state)).toMatch(/09:00  .+ \(1h 30m\)/);

    state.days[0].timeManagementEnabled = false;
    const hidden = formatTripPlainText(state);
    expect(hidden).not.toContain('09:00');
    expect(hidden).not.toContain('1h 30m');
  });

  it('leaves travel out unless asked, then puts each leg under the stop it leaves from', () => {
    const state = createInitialState();
    const [firstId, secondId] = state.days[0].placeIds;
    const first = state.places.find((place) => place.id === firstId)!;
    const second = state.places.find((place) => place.id === secondId)!;
    state.days[0].travelMode = 'public';
    state.days[0].transitByLeg = {
      [routeLegKey(firstId, secondId)]: {
        provider: 'mock',
        fetchedAt: '2026-10-21T02:00:00.000Z',
        basis: { from: latLngOf(first), to: latLngOf(second), departAt: '2026-11-07T10:30:00+08:00' },
        options: [{ signature: 'metro:BL>bus:307', minutes: 19, steps: [{ kind: 'walk', minutes: 3 }, { kind: 'metro', minutes: 10, line: 'BL' }, { kind: 'bus', minutes: 6, line: '307' }] }],
        chosen: 'metro:BL>bus:307',
      },
    };

    expect(formatTripPlainText(state)).not.toContain('↓');

    const lines = formatTripPlainText(state, { includeTravel: true }).split('\n');
    const firstLine = lines.findIndex((line) => line.endsWith(first.name));
    expect(lines.slice(firstLine + 1, firstLine + 3)).toContain('       ↓ 🚇 Metro BL → 🚌 Bus 307 · 19 min');
    expect(lines.some((line) => /^ {7}↓ .+ · ~\d+ min$/.test(line))).toBe(true);
  });

  it('copies one day with the trip name and only that day', () => {
    const state = createInitialState();
    const text = formatDayPlainText(state, state.days[1].id);

    expect(text.split('\n')[0]).toBe(`🧳 ${state.tripName}`);
    expect(text).toContain('📅 Day 2 · ');
    expect(text).not.toContain('📅 Day 1 · ');
    expect(text).not.toContain('📅 Day 3 · ');
    expect(formatDayPlainText(state, 'missing-day')).toBe('');
  });

  it('shows the real arrival-day offset for multi-day flights', () => {
    const state = createInitialState();
    state.flightBookings = [{
      id: 'f2',
      tripType: 'one-way',
      outbound: { airline: 'BR', departureAirport: 'JFK', departureDate: '2026-11-05', departureTime: '23:50', arrivalAirport: 'TPE', arrivalDate: '2026-11-07', arrivalTime: '05:30' },
    }];

    expect(formatTripPlainText(state)).toContain('→ 05:30+2 (BR)');
  });

  it('lists flights, the night stay and day tasks', () => {
    const state = createInitialState();
    const hotel = state.places[0];
    state.days[0].lodgingPlaceId = hotel.id;
    state.flightBookings = [{
      id: 'f1',
      tripType: 'one-way',
      outbound: { airline: 'CI', flightNumber: '722', departureAirport: 'KUL', departureDate: '2026-11-07', departureTime: '08:15', arrivalAirport: 'TPE', arrivalDate: '2026-11-07', arrivalTime: '13:05' },
    }];
    state.dayTasks = [{ id: 't1', dayId: state.days[0].id, text: 'Buy EasyCard', completed: false, sortOrder: 0 }];
    const text = formatTripPlainText(state);

    expect(text).toContain('• Out: KUL → TPE · Sat 7 Nov 08:15 → 13:05 (CI 722)');
    expect(text).toContain(`🏨 Stay: ${hotel.name}`);
    expect(text).toContain('⬜ Buy EasyCard');
  });

  it('shows a stay booking on check-in night but not on check-out day', () => {
    const state = createInitialState();
    state.hotelPlaceId = undefined;
    state.days.forEach((day) => { day.lodgingPlaceId = undefined; });
    state.places.push({ id: 'h1', name: 'Hotel Proverbs', region: 'Taipei', category: 'Accommodation', latitude: 0, longitude: 0, notes: '' });
    state.stayBookings = [{ id: 's1', placeId: 'h1', checkInDate: '2026-11-07', checkOutDate: '2026-11-09' }];
    const days = formatTripPlainText(state).split('📅 ').slice(1);

    expect(days[0]).toContain('🏨 Stay: Hotel Proverbs');
    expect(days[1]).toContain('🏨 Stay: Hotel Proverbs');
    expect(days[2]).not.toContain('🏨 Stay');
  });

  it('includes empty days and unscheduled places', () => {
    const state = createInitialState();
    state.days[0].placeIds = [];
    const text = formatTripPlainText(state);

    expect(text).toContain('No places scheduled.');
    expect(text).toContain('📌 Not scheduled yet');
    expect(text).toContain('• Alishan');
  });

  it('downloads JSON, Markdown, and Excel with safe filenames', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const state = { ...createInitialState(), tripName: 'Taiwan & Friends!' };

    exportTripJson(state);
    exportTripMarkdown(state);
    exportTripExcel(state);

    expect(click).toHaveBeenCalledTimes(3);
    expect(revoke).toHaveBeenCalledTimes(3);
  });
});
