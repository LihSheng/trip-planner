export interface LatLng {
  lat: number;
  lng: number;
}

export type DepartureRequest = { kind: 'now' } | { kind: 'planned'; local: string };

export interface TransitRoutesRequest {
  from: LatLng;
  to: LatLng;
  departure: DepartureRequest;
}

export type ParseResult = { ok: true; request: TransitRoutesRequest } | { ok: false; message: string };

const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const FIVE_MINUTES_MS = 5 * 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLatLng(value: unknown): LatLng | null {
  if (!isRecord(value)) return null;
  const { lat, lng } = value;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

interface LocalFields { year: number; month: number; day: number; hour: number; minute: number }

/** Parses 'yyyy-mm-ddTHH:mm', rejecting impossible dates such as 2026-02-30 or 24:00. */
export function parseLocalDateTime(value: unknown): LocalFields | null {
  if (typeof value !== 'string') return null;
  const match = LOCAL_TIME.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (hour > 23 || minute > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day, hour, minute };
}

export function parseTransitRequest(value: unknown): ParseResult {
  if (!isRecord(value)) return { ok: false, message: 'Request body must be a JSON object.' };
  const from = parseLatLng(value.from);
  const to = parseLatLng(value.to);
  if (!from || !to) return { ok: false, message: 'from and to need numeric lat (-90 to 90) and lng (-180 to 180).' };
  const departure = value.departure;
  if (isRecord(departure) && departure.kind === 'now') return { ok: true, request: { from, to, departure: { kind: 'now' } } };
  if (isRecord(departure) && departure.kind === 'planned' && typeof departure.local === 'string' && parseLocalDateTime(departure.local)) {
    return { ok: true, request: { from, to, departure: { kind: 'planned', local: departure.local } } };
  }
  return { ok: false, message: "departure must be { kind: 'now' } or { kind: 'planned', local: 'yyyy-mm-ddTHH:mm' }." };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function wallClock(epochMs: number, timeZone: string) {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
}

function offsetMinutes(epochMs: number, timeZone: string): number {
  const wall = wallClock(epochMs, timeZone);
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return Math.round((wallAsUtc - Math.floor(epochMs / 1000) * 1000) / 60_000);
}

/**
 * Wall-clock time in a zone to an instant. A time skipped by a DST jump lands after the jump;
 * a repeated time resolves to its later occurrence.
 */
export function zonedTimeToInstant(fields: LocalFields, timeZone: string): Date {
  const wallAsUtc = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute);
  const guess = wallAsUtc - offsetMinutes(wallAsUtc, timeZone) * 60_000;
  return new Date(wallAsUtc - offsetMinutes(guess, timeZone) * 60_000);
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/** ISO 8601 with the zone's offset, e.g. 2026-10-21T09:00:00+08:00. */
export function formatInZone(instant: Date, timeZone: string): string {
  const wall = wallClock(instant.getTime(), timeZone);
  const offset = offsetMinutes(instant.getTime(), timeZone);
  const sign = offset < 0 ? '-' : '+';
  const absolute = Math.abs(offset);
  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The departure instant: 'now', or a planned local time at the origin, never earlier than now rounded up to 5 minutes. */
export function resolveDeparture(departure: DepartureRequest, timeZone: string, now: Date): Date {
  const earliest = new Date(Math.ceil(now.getTime() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS);
  if (departure.kind === 'now') return earliest;
  const fields = parseLocalDateTime(departure.local);
  if (!fields) throw new Error('Unparsed local departure time.');
  const planned = zonedTimeToInstant(fields, timeZone);
  return planned.getTime() < now.getTime() ? earliest : planned;
}
