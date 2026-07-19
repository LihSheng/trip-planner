import type { Place, TripState } from '../types';

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
    ['Exported at', new Date().toISOString()],
  ];

  const worksheet = (name: string, rows: Array<Array<string | number>>) =>
    `<Worksheet ss:Name="${xmlEscape(name)}"><Table>${rows.map(row).join('')}</Table></Worksheet>`;

  const workbook = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    worksheet('Itinerary', itinerary) + worksheet('Unscheduled Places', unscheduled) + worksheet('Trip Summary', summary) +
    `</Workbook>`;

  download(workbook, 'application/vnd.ms-excel;charset=utf-8', `${slugify(state.tripName)}-itinerary.xls`);
}
