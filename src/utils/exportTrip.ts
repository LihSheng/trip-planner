import type { Place, TripState } from '../types';
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

function addDays(date: string, offset: number): string {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
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

export function formatTripPlainText(state: TripState): string {
  const places = new Map(state.places.map((place) => [place.id, place]));
  const lines: string[] = [];

  state.days.forEach((day, dayIndex) => {
    lines.push(`Day ${dayIndex + 1}${day.label ? ` — ${day.label}` : ''}`);
    if (day.placeIds.length === 0) {
      lines.push('No places scheduled.');
    } else {
      day.placeIds.forEach((placeId, placeIndex) => {
        const place = places.get(placeId);
        if (!place) return;
        lines.push(`${placeIndex + 1}. ${place.name}`);
        if (place.notes.trim()) lines.push(`   ${place.notes.trim()}`);
      });
    }
    lines.push('');
  });

  if (state.unscheduledIds.length) {
    lines.push('Unscheduled');
    state.unscheduledIds.forEach((placeId, placeIndex) => {
      const place = places.get(placeId);
      if (!place) return;
      lines.push(`${placeIndex + 1}. ${place.name}`);
      if (place.notes.trim()) lines.push(`   ${place.notes.trim()}`);
    });
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
