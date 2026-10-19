export type TransitStepKindV1 = 'walk' | 'bus' | 'metro' | 'tra' | 'thsr' | 'lightRail' | 'ferry' | 'cableCar' | 'other';

export interface TransitStepV1 {
  kind: TransitStepKindV1;
  minutes: number;
  line?: string;
  fromStop?: string;
  toStop?: string;
  stopCount?: number;
  distanceMeters?: number;
}

export interface TransitOptionV1 {
  minutes: number;
  steps: TransitStepV1[];
}

export const MAX_TRANSIT_OPTIONS = 5;
const MAX_NAME_LENGTH = 200;
const SAMPLE_LENGTH = 2000;

export class AdapterShapeError extends Error {
  readonly sample: string;

  constructor(message: string, sample: string) {
    super(message);
    this.name = 'AdapterShapeError';
    this.sample = sample;
  }
}

// MOTIS v5 modes. Anything not listed, including modes added later, becomes 'other'.
const KIND_BY_MODE: Readonly<Record<string, TransitStepKindV1>> = {
  WALK: 'walk',
  BUS: 'bus',
  COACH: 'bus',
  SUBWAY: 'metro',
  METRO: 'metro',
  HIGHSPEED_RAIL: 'thsr',
  RAIL: 'tra',
  REGIONAL_RAIL: 'tra',
  REGIONAL_FAST_RAIL: 'tra',
  LONG_DISTANCE: 'tra',
  NIGHT_RAIL: 'tra',
  SUBURBAN: 'tra',
  TRAM: 'lightRail',
  FERRY: 'ferry',
  AERIAL_LIFT: 'cableCar',
  AREAL_LIFT: 'cableCar',
  CABLE_CAR: 'cableCar',
  FUNICULAR: 'cableCar',
};

export function kindForMode(mode: string): TransitStepKindV1 {
  return Object.hasOwn(KIND_BY_MODE, mode) ? KIND_BY_MODE[mode] : 'other';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function name(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_NAME_LENGTH) : undefined;
}

function seconds(record: Record<string, unknown>): number | null {
  const duration = nonNegativeNumber(record.duration);
  if (duration !== null) return duration;
  const start = typeof record.startTime === 'string' ? Date.parse(record.startTime) : NaN;
  const end = typeof record.endTime === 'string' ? Date.parse(record.endTime) : NaN;
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 1000 : null;
}

// displayName is MOTIS's own pick (the route short name, else the long name). Feeds disagree on the
// raw fields: Toei Asakusa has only a long name, and tripShortName holds train numbers or "RATP".
function lineName(leg: Record<string, unknown>): string | undefined {
  return name(leg.displayName) ?? name(leg.routeShortName) ?? name(leg.routeLongName);
}

interface ParsedLeg {
  kind: TransitStepKindV1;
  seconds: number;
  meters: number | null;
  line?: string;
  fromStop?: string;
  toStop?: string;
  stopCount?: number;
}

function parseLeg(leg: unknown): ParsedLeg | null {
  if (!isRecord(leg) || typeof leg.mode !== 'string') return null;
  const legSeconds = seconds(leg);
  if (legSeconds === null) return null;
  const kind = kindForMode(leg.mode);
  if (kind === 'walk') return { kind, seconds: legSeconds, meters: nonNegativeNumber(leg.distance) };
  const parsed: ParsedLeg = { kind, seconds: legSeconds, meters: null };
  const line = lineName(leg);
  if (line) parsed.line = line;
  const fromStop = isRecord(leg.from) ? name(leg.from.name) : undefined;
  if (fromStop) parsed.fromStop = fromStop;
  const toStop = isRecord(leg.to) ? name(leg.to.name) : undefined;
  if (toStop) parsed.toStop = toStop;
  if (Array.isArray(leg.intermediateStops)) parsed.stopCount = leg.intermediateStops.length + 1;
  return parsed;
}

function toStep(leg: ParsedLeg): TransitStepV1 {
  const step: TransitStepV1 = { kind: leg.kind, minutes: Math.round(leg.seconds / 60) };
  if (leg.line) step.line = leg.line;
  if (leg.fromStop) step.fromStop = leg.fromStop;
  if (leg.toStop) step.toStop = leg.toStop;
  if (leg.stopCount !== undefined) step.stopCount = leg.stopCount;
  if (leg.meters) step.distanceMeters = Math.round(leg.meters);
  return step;
}

function parseItinerary(itinerary: unknown): TransitOptionV1 | null {
  if (!isRecord(itinerary) || !Array.isArray(itinerary.legs) || itinerary.legs.length === 0) return null;
  const totalSeconds = seconds(itinerary);
  if (totalSeconds === null) return null;
  const legs: ParsedLeg[] = [];
  for (const raw of itinerary.legs) {
    const leg = parseLeg(raw);
    if (!leg) return null;
    const previous = legs.at(-1);
    // Summed before rounding so two 90-second walks become 3 minutes, not 4.
    if (leg.kind === 'walk' && previous?.kind === 'walk') {
      previous.seconds += leg.seconds;
      previous.meters = previous.meters === null && leg.meters === null ? null : (previous.meters ?? 0) + (leg.meters ?? 0);
    } else legs.push(leg);
  }
  return { minutes: Math.round(totalSeconds / 60), steps: legs.map(toStep) };
}

/** Same ride sequence as the client's option signature, so the server never spends a slot on a repeat. */
function rideSignature(option: TransitOptionV1): string {
  return option.steps.filter((step) => step.kind !== 'walk').map((step) => `${step.kind}:${step.line ?? '?'}`).join('>') || 'walk';
}

/**
 * MOTIS returns several departures of the same route inside its search window. Keeping only the
 * fastest of each ride sequence leaves room for genuinely different routes under the cap.
 */
export function adaptTransitousPlan(raw: unknown): { options: TransitOptionV1[]; dropped: number } {
  if (!isRecord(raw) || !Array.isArray(raw.itineraries)) {
    throw new AdapterShapeError('Response has no itineraries array.', sample(raw));
  }
  const parsed = raw.itineraries.map(parseItinerary).filter((option): option is TransitOptionV1 => option !== null);
  const dropped = raw.itineraries.length - parsed.length;
  if (raw.itineraries.length > 0 && parsed.length === 0) {
    throw new AdapterShapeError('No itinerary could be parsed.', sample(raw));
  }
  const seen = new Set<string>();
  const options = parsed
    .sort((a, b) => a.minutes - b.minutes)
    .filter((option) => {
      const signature = rideSignature(option);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .slice(0, MAX_TRANSIT_OPTIONS);
  return { options, dropped };
}

function sample(raw: unknown): string {
  return String(JSON.stringify(raw)).slice(0, SAMPLE_LENGTH);
}
