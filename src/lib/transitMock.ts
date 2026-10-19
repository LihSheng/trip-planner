import { distanceMeters } from '../domain/locationCluster';
import type { LatLng, RawTransitOption, TransitDeparture, TransitStep } from '../domain/transit';

const BUS_LINES = ['307', '262', 'G1', 'R30', 'BL5'];
const METRO_LINES = ['Red line', 'Blue line', 'Green line', 'Brown line'];

/** Stable small number per leg so the mock gives the same answer every time. */
function legSeed(from: LatLng, to: LatLng) {
  return [...`${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}`]
    .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function walk(minutes: number): TransitStep {
  return { kind: 'walk', minutes, distanceMeters: Math.round(minutes * 75) };
}

function option(steps: TransitStep[]): RawTransitOption {
  return { minutes: steps.reduce((total, step) => total + step.minutes, 0), steps };
}

/** Plausible but fake options derived from straight-line distance. */
export function mockTransitOptions(from: LatLng, to: LatLng): RawTransitOption[] {
  const km = distanceMeters({ latitude: from.lat, longitude: from.lng }, { latitude: to.lat, longitude: to.lng }) / 1000;
  const seed = legSeed(from, to);
  const firstWalk = 3 + (seed % 5);
  const lastWalk = 2 + (seed % 4);

  if (km < 0.8) return [option([walk(Math.max(3, Math.round(km * 1.2 / 4.5 * 60)))])];

  const busStops = Math.max(2, Math.round(km * 2.2));
  const bus = option([
    walk(firstWalk),
    { kind: 'bus', line: BUS_LINES[seed % BUS_LINES.length], fromStop: 'Mock stop A', toStop: 'Mock stop B', stopCount: busStops, minutes: 5 + Math.round(km * 1.3 / 18 * 60) },
    walk(lastWalk),
  ]);
  if (km < 2.5) return [bus];

  const metroStops = Math.max(2, Math.round(km / 1.1));
  const metro = option([
    walk(firstWalk + 2),
    { kind: 'metro', line: METRO_LINES[seed % METRO_LINES.length], fromStop: 'Mock station A', toStop: 'Mock station B', stopCount: metroStops, minutes: 4 + Math.round(km * 1.2 / 32 * 60) },
    walk(lastWalk + 1),
  ]);
  return [metro, bus];
}

function offsetSuffix(date: Date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0');
  return `${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

/** The ISO instant the mock pretends it queried, in the browser's own zone like the server would use the origin's. */
export function mockDepartAt(departure: TransitDeparture, now: Date): string {
  if (departure.kind === 'planned') return `${departure.local}:00${offsetSuffix(new Date(`${departure.local}:00`))}`;
  const rounded = new Date(Math.ceil(now.getTime() / 300_000) * 300_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  const local = `${rounded.getFullYear()}-${pad(rounded.getMonth() + 1)}-${pad(rounded.getDate())}T${pad(rounded.getHours())}:${pad(rounded.getMinutes())}:00`;
  return `${local}${offsetSuffix(rounded)}`;
}
