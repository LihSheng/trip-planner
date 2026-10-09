import type { FlightLeg, Place, TripDay, TripState } from '../types';
import { expenseSources } from '../domain/expenses';
import { getCachedExchangeRate } from '../lib/exchangeRates';

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip';
}

function download(content: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function localDate(date: string, offset = 0): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day + offset);
}

// Formats from local parts: toISOString() would shift the date back a day east of UTC.
function addDays(date: string, offset: number): string {
  const value = localDate(date, offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function shortDate(date: string, offset = 0): string {
  return localDate(date, offset).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cell(value: unknown, type: 'String' | 'Number' = 'String'): string {
  return `<Cell><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`;
}

function row(values: Array<string | number>): string {
  return `<Row>${values.map((value) => cell(value, typeof value === 'number' ? 'Number' : 'String')).join('')}</Row>`;
}

function placeRows(state: TripState): Array<Array<string | number>> {
  const places = new Map(state.places.map((place) => [place.id, place]));
  return state.days.flatMap((day, dayIndex) =>
    day.placeIds.flatMap((placeId, stopIndex) => {
      const place = places.get(placeId);
      if (!place) return [];
      return [[
        addDays(state.startDate, dayIndex),
        dayIndex + 1,
        day.label,
        stopIndex + 1,
        place.name,
        place.region,
        place.category,
        place.notes,
        place.latitude,
        place.longitude,
      ]];
    }),
  );
}

function placeToMarkdown(place: Place, index?: number): string[] {
  const prefix = index === undefined ? '-' : `${index}.`;
  return [
    `${prefix} **${place.name}**`,
    `   - Region: ${place.region}`,
    `   - Category: ${place.category}`,
    `   - Notes: ${place.notes || '—'}`,
    `   - Coordinates: ${place.latitude}, ${place.longitude}`,
  ];
}

export function exportTripJson(state: TripState): void {
  download(JSON.stringify(state, null, 2), 'application/json', `${slugify(state.tripName)}.json`);
}

function cachedApproximateTotal(state: TripState): number | null {
  const currency = state.displayCurrency ?? 'MYR';
  const converted = expenseSources(state).map((expense) => {
    const rate = getCachedExchangeRate(expense.currency, currency);
    return rate === null ? null : expense.amount * rate;
  });
  return converted.some((value) => value === null) ? null : converted.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function cachedBudgetRemaining(state: TripState, total: number | null): number | null {
  if (!state.budget || total === null) return null;
  const rate = getCachedExchangeRate(state.budget.currency, state.displayCurrency ?? 'MYR');
  return rate === null ? null : state.budget.amount * rate - total;
}

const DIVIDER = '━━━━━━━━━━━━━━━━';
const TIME_GUTTER = '       ';

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours}h` : '', rest ? `${rest}m` : ''].filter(Boolean).join(' ');
}

function formatFlightLeg(label: string, leg: FlightLeg): string {
  const dayOffset = Math.round((localDate(leg.arrivalDate).getTime() - localDate(leg.departureDate).getTime()) / 86_400_000);
  const nextDay = dayOffset ? `${dayOffset > 0 ? '+' : ''}${dayOffset}` : '';
  const flight = [leg.airline, leg.flightNumber].filter(Boolean).join(' ');
  return `• ${label}: ${leg.departureAirport} → ${leg.arrivalAirport} · ${shortDate(leg.departureDate)} ${leg.departureTime} → ${leg.arrivalTime}${nextDay}${flight ? ` (${flight})` : ''}`;
}

function formatFlights(state: TripState): string[] {
  const bookings = state.flightBookings ?? [];
  if (!bookings.length) return [];
  return [
    '✈️ Flights',
    ...bookings.flatMap((booking) => [
      formatFlightLeg('Out', booking.outbound),
      ...(booking.return ? [formatFlightLeg('Back', booking.return)] : []),
    ]),
    '',
  ];
}

// Same precedence as the board: the day's own pick, then a booking covering that night, then the trip hotel.
function stayForDate(state: TripState, day: TripDay, date: string, places: Map<string, Place>): Place | undefined {
  const booking = (state.stayBookings ?? []).find((item) => item.checkInDate <= date && date < item.checkOutDate);
  const placeId = day.lodgingPlaceId || booking?.placeId || state.hotelPlaceId;
  return placeId ? places.get(placeId) : undefined;
}

function formatStop(day: TripDay, place: Place): string[] {
  const schedule = day.timeManagementEnabled ? day.stopSchedules?.[place.id] : undefined;
  const time = schedule?.startTime ? schedule.startTime.padEnd(5) : '—    ';
  const duration = schedule?.startTime && schedule.durationMinutes ? ` (${formatDuration(schedule.durationMinutes)})` : '';
  const lines = [`${time}  ${place.name}${duration}`];
  if (place.notes.trim()) lines.push(`${TIME_GUTTER}${place.notes.trim()}`);
  return lines;
}

function formatDay(state: TripState, day: TripDay, dayIndex: number, places: Map<string, Place>): string[] {
  const date = addDays(state.startDate, dayIndex);
  const lines = [DIVIDER, `📅 Day ${dayIndex + 1} · ${shortDate(state.startDate, dayIndex)}${day.label ? ` — ${day.label}` : ''}`];
  const stay = stayForDate(state, day, date, places);
  if (stay) lines.push(`🏨 Stay: ${stay.name}`);
  lines.push('');

  const stops = day.placeIds.flatMap((placeId) => places.get(placeId) ?? []);
  if (!stops.length) lines.push('No places scheduled.');
  stops.forEach((place) => lines.push(...formatStop(day, place)));

  const tasks = (state.dayTasks ?? []).filter((task) => task.dayId === day.id).sort((a, b) => a.sortOrder - b.sortOrder);
  if (tasks.length) {
    lines.push('');
    tasks.forEach((task) => lines.push(`${task.completed ? '☑️' : '⬜'} ${task.text}`));
  }
  lines.push('');
  return lines;
}

export function formatTripPlainText(state: TripState): string {
  const places = new Map(state.places.map((place) => [place.id, place]));
  const dayCount = state.days.length;
  const range = dayCount > 1 ? `${shortDate(state.startDate)} – ${shortDate(state.startDate, dayCount - 1)}` : shortDate(state.startDate);
  const lines = [
    `🧳 ${state.tripName}`,
    `${range} · ${dayCount} ${dayCount === 1 ? 'day' : 'days'}`,
    '',
    ...formatFlights(state),
    ...state.days.flatMap((day, dayIndex) => formatDay(state, day, dayIndex, places)),
  ];

  const unscheduled = state.unscheduledIds.flatMap((placeId) => places.get(placeId) ?? []);
  if (unscheduled.length) {
    lines.push(DIVIDER, '📌 Not scheduled yet');
    unscheduled.forEach((place) => lines.push(`• ${place.name}`));
  }

  return lines.join('\n').trim();
}

export function exportTripMarkdown(state: TripState): void {
  const places = new Map(state.places.map((place) => [place.id, place]));
  const lines = [
    `# ${state.tripName}`,
    '',
    `**Start date:** ${state.startDate}`,
    `**Days:** ${state.days.length}`,
    `**Places:** ${state.places.length}`,
    '',
  ];

  state.days.forEach((day, dayIndex) => {
    lines.push(`## Day ${dayIndex + 1} — ${day.label}`, '', `**Date:** ${addDays(state.startDate, dayIndex)}`, '');
    if (day.placeIds.length === 0) lines.push('_No places scheduled._');
    day.placeIds.forEach((placeId, stopIndex) => {
      const place = places.get(placeId);
      if (place) lines.push(...placeToMarkdown(place, stopIndex + 1), '');
    });
  });

  lines.push('## Unscheduled places', '');
  if (state.unscheduledIds.length === 0) lines.push('_None._');
  state.unscheduledIds.forEach((placeId) => {
    const place = places.get(placeId);
    if (place) lines.push(...placeToMarkdown(place), '');
  });

  lines.push('## Expenses', '');
  if (state.budget) lines.push(`**Whole-trip budget:** ${state.budget.currency} ${state.budget.amount}`, '');
  const expenseRows = expenseSources(state);
  const approximateTotal = cachedApproximateTotal(state);
  if (approximateTotal !== null) lines.push(`**Approximate total:** ≈ ${state.displayCurrency ?? 'MYR'} ${approximateTotal.toFixed(2)}`, '');
  const remaining = cachedBudgetRemaining(state, approximateTotal);
  if (remaining !== null) lines.push(`**${remaining < 0 ? 'Overspent' : 'Remaining'}:** ${state.displayCurrency ?? 'MYR'} ${Math.abs(remaining).toFixed(2)}`, '');
  const categoryTotals = expenseRows.reduce((totals, expense) => {
    const current = totals.get(expense.category) ?? [];
    totals.set(expense.category, [...current, `${expense.currency} ${expense.amount}`]);
    return totals;
  }, new Map<string, string[]>());
  if (categoryTotals.size) {
    lines.push('### Category subtotals', '');
    categoryTotals.forEach((amounts, category) => lines.push(`- ${category}: ${amounts.join(' + ')}`));
    lines.push('');
  }
  if (!expenseRows.length) lines.push('_None._');
  expenseRows.forEach((expense) => lines.push(`- **${expense.name}** — ${expense.currency} ${expense.amount} (${expense.category})`));
  if (state.flightBookings?.length) {
    lines.push('', '## Flights', '');
    state.flightBookings.forEach((booking) => {
      lines.push(`- **${booking.outbound.departureAirport} → ${booking.outbound.arrivalAirport}** — ${booking.outbound.departureDate} ${booking.outbound.departureTime}`);
      if (booking.return) lines.push(`  - Return: ${booking.return.departureAirport} → ${booking.return.arrivalAirport} — ${booking.return.departureDate} ${booking.return.departureTime}`);
    });
  }
  if (state.stayBookings?.length) {
    lines.push('', '## Stays', '');
    state.stayBookings.forEach((booking) => lines.push(`- **${places.get(booking.placeId)?.name ?? 'Accommodation'}** — ${booking.checkInDate} to ${booking.checkOutDate}${booking.cost ? ` — ${booking.cost.currency} ${booking.cost.amount}` : ''}`));
  }

  download(lines.join('\n'), 'text/markdown;charset=utf-8', `${slugify(state.tripName)}-itinerary.md`);
}

export function exportTripExcel(state: TripState): void {
  const places = new Map(state.places.map((place) => [place.id, place]));
  const itinerary = [
    ['Date', 'Day', 'Day label', 'Stop', 'Place', 'Region', 'Category', 'Notes', 'Latitude', 'Longitude'],
    ...placeRows(state),
  ];
  const unscheduled = [
    ['Place', 'Region', 'Category', 'Notes', 'Latitude', 'Longitude'],
    ...state.unscheduledIds.flatMap((id) => {
      const place = places.get(id);
      return place ? [[place.name, place.region, place.category, place.notes, place.latitude, place.longitude]] : [];
    }),
  ];
  const summary = [
    ['Field', 'Value'],
    ['Trip name', state.tripName],
    ['Start date', state.startDate],
    ['Days', state.days.length],
    ['Places', state.places.length],
    ['Budget', state.budget ? `${state.budget.currency} ${state.budget.amount}` : ''],
    ['Approximate total', (() => { const total = cachedApproximateTotal(state); return total === null ? 'Conversion unavailable' : `≈ ${state.displayCurrency ?? 'MYR'} ${total.toFixed(2)}`; })()],
    ['Remaining / overspent', (() => { const value = cachedBudgetRemaining(state, cachedApproximateTotal(state)); return value === null ? '' : `${value < 0 ? 'Overspent' : 'Remaining'} ${state.displayCurrency ?? 'MYR'} ${Math.abs(value).toFixed(2)}`; })()],
    ['Exported at', new Date().toISOString()],
  ];
  const expenses = [
    ['Source', 'Name', 'Category', 'Currency', 'Amount'],
    ...expenseSources(state).map((expense) => [expense.source, expense.name, expense.category, expense.currency, expense.amount]),
  ];
  const categorySubtotals = [
    ['Category', 'Currency', 'Amount'],
    ...[...expenseSources(state).reduce((totals, expense) => {
      const key = `${expense.category}:${expense.currency}`;
      totals.set(key, { category: expense.category, currency: expense.currency, amount: (totals.get(key)?.amount ?? 0) + expense.amount });
      return totals;
    }, new Map<string, { category: string; currency: string; amount: number }>()).values()].map((item) => [item.category, item.currency, item.amount]),
  ];
  const bookings = [
    ['Type', 'Name / route', 'Start / departure', 'End / arrival', 'Currency', 'Cost'],
    ...(state.stayBookings ?? []).map((booking) => ['Stay', places.get(booking.placeId)?.name ?? 'Accommodation', booking.checkInDate, booking.checkOutDate, booking.cost?.currency ?? '', booking.cost?.amount ?? '']),
    ...(state.flightBookings ?? []).map((booking) => ['Flight', `${booking.outbound.departureAirport} → ${booking.outbound.arrivalAirport}${booking.return ? ` / ${booking.return.departureAirport} → ${booking.return.arrivalAirport}` : ''}`, `${booking.outbound.departureDate} ${booking.outbound.departureTime}`, `${booking.outbound.arrivalDate} ${booking.outbound.arrivalTime}`, booking.totalCost?.currency ?? '', booking.totalCost?.amount ?? '']),
  ];

  const worksheet = (name: string, rows: Array<Array<string | number>>) =>
    `<Worksheet ss:Name="${xmlEscape(name)}"><Table>${rows.map(row).join('')}</Table></Worksheet>`;

  const workbook = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    worksheet('Itinerary', itinerary) + worksheet('Unscheduled Places', unscheduled) + worksheet('Expenses', expenses) + worksheet('Expense Subtotals', categorySubtotals) + worksheet('Bookings', bookings) + worksheet('Trip Summary', summary) +
    `</Workbook>`;

  download(workbook, 'application/vnd.ms-excel;charset=utf-8', `${slugify(state.tripName)}-itinerary.xls`);
}
