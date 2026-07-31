const candidateKeys = new Set(['name', 'region', 'category', 'notes', 'suggestedStartTime', 'durationMinutes', 'confidence', 'sourceEvidence', 'dayLabel']);
const modelResultKeys = new Set(['summary', 'destination', 'places']);

export type ParsedModelCandidate = {
  tempId: string;
  name: string;
  region: string;
  category: string;
  notes: string;
  suggestedStartTime?: string;
  durationMinutes?: number;
  confidence: number;
  sourceEvidence: string;
  dayLabel?: string;
};

export type ParsedModelDraft = {
  summary: string;
  destination?: string;
  places: ParsedModelCandidate[];
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

export function boundedString(value: unknown, maximum: number, required = true) {
  if (typeof value !== 'string' || value.length > maximum) return null;
  const normalized = value.trim();
  return required && !normalized ? null : normalized;
}

function parseCandidate(value: unknown, index: number, allowedCategories: ReadonlySet<string>): ParsedModelCandidate | null {
  if (!isRecord(value) || !hasOnlyKeys(value, candidateKeys)) return null;
  const name = boundedString(value.name, 200);
  const region = boundedString(value.region, 160, false);
  const notes = boundedString(value.notes, 1000, false);
  const sourceEvidence = boundedString(value.sourceEvidence, 500);
  const dayLabel = value.dayLabel === undefined ? undefined : boundedString(value.dayLabel, 120);
  const category = typeof value.category === 'string' ? value.category : '';
  const confidence = typeof value.confidence === 'number' ? value.confidence : Number.NaN;
  const suggestedStartTime = value.suggestedStartTime === undefined
    ? undefined
    : typeof value.suggestedStartTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.suggestedStartTime) ? value.suggestedStartTime : null;
  const durationMinutes = value.durationMinutes === undefined
    ? undefined
    : typeof value.durationMinutes === 'number' && Number.isInteger(value.durationMinutes) && value.durationMinutes > 0 && value.durationMinutes <= 720 ? value.durationMinutes : null;
  if (!name || region === null || notes === null || !sourceEvidence || dayLabel === null || !allowedCategories.has(category) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 || suggestedStartTime === null || durationMinutes === null) return null;
  return { tempId: `candidate-${index}`, name, region, category, notes, sourceEvidence, confidence, suggestedStartTime, durationMinutes, dayLabel };
}

export function parseModelDraft(content: string, allowedCategories: ReadonlySet<string>): ParsedModelDraft | null {
  let value: unknown;
  try { value = JSON.parse(content); } catch { return null; }
  if (!isRecord(value) || !hasOnlyKeys(value, modelResultKeys) || !Array.isArray(value.places) || value.places.length < 1 || value.places.length > 30) return null;
  const summary = boundedString(value.summary, 500, false);
  const destination = value.destination === undefined ? undefined : boundedString(value.destination, 160, false);
  const places = value.places.map((candidate, index) => parseCandidate(candidate, index, allowedCategories));
  if (summary === null || destination === null || places.some((item) => item === null)) return null;
  return { summary, destination, places: places as ParsedModelCandidate[] };
}
