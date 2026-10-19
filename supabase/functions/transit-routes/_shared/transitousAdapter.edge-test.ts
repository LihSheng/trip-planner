import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AdapterShapeError, adaptTransitousPlan, kindForMode } from './transitousAdapter.ts';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/transitous-${name}.json`, import.meta.url), 'utf8'));
}

function rides(option: { steps: Array<{ kind: string; line?: string }> }) {
  return option.steps.filter((step) => step.kind !== 'walk').map((step) => `${step.kind}:${step.line}`);
}

test('Taipei 101 to Longshan Temple: five distinct routes, fastest first', () => {
  const { options, dropped } = adaptTransitousPlan(fixture('taipei101-longshan'));
  assert.equal(dropped, 0);
  assert.deepEqual(options.map((option) => option.minutes), [27, 28, 28, 28, 32]);
  assert.deepEqual(options[0], {
    minutes: 27,
    steps: [
      { kind: 'walk', minutes: 6, distanceMeters: 388 },
      { kind: 'bus', minutes: 8, line: '20', fromStop: '市政府(松壽)', toStop: '捷運西門站', stopCount: 20 },
      { kind: 'walk', minutes: 2 },
      { kind: 'bus', minutes: 1, line: '218', fromStop: '捷運西門站', toStop: '老松國小', stopCount: 2 },
      { kind: 'walk', minutes: 10, distanceMeters: 597 },
    ],
  });
  assert.deepEqual(options.map(rides), [
    ['bus:20', 'bus:218'],
    ['bus:信義幹線', 'bus:249', 'bus:重慶幹線'],
    ['bus:信義幹線', 'bus:羅斯福路幹線', 'bus:重慶幹線'],
    ['bus:88區', 'metro:大安－北投', 'bus:49'],
    ['bus:207', 'bus:624'],
  ]);
  assert.deepEqual(options[3].steps[3], { kind: 'metro', minutes: 1, line: '大安－北投', fromStop: '台大醫院', toStop: '台北車站', stopCount: 1 });
});

test('Taipei to Kaohsiung: the later THSR departure collapses into the faster one', () => {
  const { options } = adaptTransitousPlan(fixture('taipei-kaohsiung'));
  assert.deepEqual(options.map((option) => option.minutes), [119, 253, 286, 310]);
  assert.deepEqual(options[0], {
    minutes: 119,
    steps: [
      { kind: 'walk', minutes: 4, distanceMeters: 1091 },
      // The TDX feed tags THSR as REGIONAL_RAIL, so it reads as 'tra'.
      { kind: 'tra', minutes: 94, line: '南港-左營', fromStop: '台北', toStop: '左營', stopCount: 3 },
      { kind: 'walk', minutes: 2, distanceMeters: 583 },
      { kind: 'metro', minutes: 11, line: '紅線', fromStop: '左營', toStop: '高雄車站', stopCount: 5 },
      { kind: 'walk', minutes: 3, distanceMeters: 281 },
    ],
  });
  assert.deepEqual(options.slice(1).map(rides), [['tra:七堵-潮州'], ['tra:基隆-潮州'], ['bus:1838A']]);
  assert.equal(options[2].steps[1].stopCount, 18);
});

test('Shinjuku to Asakusa: eleven itineraries are capped at five, long-name-only lines keep a name', () => {
  const { options, dropped } = adaptTransitousPlan(fixture('tokyo-shinjuku-asakusa'));
  assert.equal(dropped, 0);
  assert.deepEqual(options.map((option) => option.minutes), [32, 33, 33, 34, 34]);
  assert.deepEqual(rides(options[0]), ['tra:JC', 'tra:9454341', 'tra:TX']);
  assert.deepEqual(rides(options[4]), ['tra:JC', 'tra:9957081', 'metro:浅草線', 'bus:都０８（Ｔ０８）']);
  assert.deepEqual(options[4].steps[5], { kind: 'metro', minutes: 2, line: '浅草線', fromStop: '浅草橋', toStop: '浅草', stopCount: 2 });
});

test('Eiffel Tower to the Louvre: three departures of bus 72 become one option', () => {
  const { options } = adaptTransitousPlan(fixture('paris-eiffel-louvre'));
  assert.deepEqual(options.map((option) => option.minutes), [27, 28, 29, 30]);
  assert.deepEqual(options[0], {
    minutes: 27,
    steps: [
      { kind: 'walk', minutes: 11, distanceMeters: 772 },
      { kind: 'bus', minutes: 12, line: '72', fromStop: "Musée d'Art Moderne - Palais de Tokyo", toStop: 'Pont des Arts', stopCount: 8 },
      { kind: 'walk', minutes: 4, distanceMeters: 253 },
    ],
  });
  assert.deepEqual(options.slice(1).map(rides), [
    ['bus:42', 'metro:1'],
    ['tra:C', 'metro:8', 'metro:1'],
    ['tra:C', 'metro:13', 'metro:1'],
  ]);
});

test('no itineraries is an empty answer, not an error', () => {
  assert.deepEqual(adaptTransitousPlan(fixture('kuala-lumpur-empty')), { options: [], dropped: 0 });
});

const bus = { mode: 'BUS', duration: 600, displayName: '307', from: { name: 'A' }, to: { name: 'B' }, intermediateStops: [{ name: 'X' }] };

test('consecutive walk legs merge before rounding', () => {
  const { options } = adaptTransitousPlan({
    itineraries: [{
      duration: 900,
      legs: [
        { mode: 'WALK', duration: 90, distance: 100 },
        { mode: 'WALK', duration: 90 },
        bus,
        { mode: 'WALK', duration: 120, distance: 0 },
      ],
    }],
  });
  assert.deepEqual(options[0].steps, [
    { kind: 'walk', minutes: 3, distanceMeters: 100 },
    { kind: 'bus', minutes: 10, line: '307', fromStop: 'A', toStop: 'B', stopCount: 2 },
    { kind: 'walk', minutes: 2 },
  ]);
});

test('a malformed itinerary is dropped and counted, the rest survive', () => {
  const result = adaptTransitousPlan({
    itineraries: [
      { duration: 600, legs: [bus] },
      { duration: 600, legs: [{ mode: 'BUS' }] },
      { legs: [bus] },
      'nonsense',
      { startTime: '2026-10-21T01:00:00Z', endTime: '2026-10-21T01:20:00Z', legs: [{ ...bus, displayName: '', routeShortName: '', routeLongName: 'Blue' }] },
    ],
  });
  assert.equal(result.dropped, 3);
  assert.deepEqual(result.options.map((option) => [option.minutes, ...rides(option)]), [[10, 'bus:307'], [20, 'bus:Blue']]);
});

test('throws AdapterShapeError only when nothing usable came back', () => {
  assert.throws(() => adaptTransitousPlan({ itineraries: [{ duration: 60, legs: [] }] }), AdapterShapeError);
  assert.throws(() => adaptTransitousPlan({ error: 'boom' }), (error) => error instanceof AdapterShapeError && error.sample === '{"error":"boom"}');
  assert.throws(() => adaptTransitousPlan(null), AdapterShapeError);
});

test('maps MOTIS modes through one table, unknown modes become other', () => {
  assert.deepEqual(
    ['WALK', 'BUS', 'COACH', 'SUBWAY', 'METRO', 'HIGHSPEED_RAIL', 'REGIONAL_RAIL', 'RAIL', 'LONG_DISTANCE', 'NIGHT_RAIL', 'REGIONAL_FAST_RAIL', 'SUBURBAN', 'TRAM', 'FERRY', 'AERIAL_LIFT', 'FUNICULAR', 'AIRPLANE', 'HOVERCRAFT', 'constructor'].map(kindForMode),
    ['walk', 'bus', 'bus', 'metro', 'metro', 'thsr', 'tra', 'tra', 'tra', 'tra', 'tra', 'tra', 'lightRail', 'ferry', 'cableCar', 'cableCar', 'other', 'other', 'other'],
  );
});
