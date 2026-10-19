import assert from 'node:assert/strict';
import test from 'node:test';
import { formatInZone, isValidTimeZone, parseTransitRequest, resolveDeparture } from './transitRequest.ts';

const from = { lat: 25.034, lng: 121.5645 };
const to = { lat: 25.0372, lng: 121.4999 };

test('accepts now and planned departures', () => {
  assert.deepEqual(parseTransitRequest({ from, to, departure: { kind: 'now' } }), { ok: true, request: { from, to, departure: { kind: 'now' } } });
  assert.deepEqual(
    parseTransitRequest({ from, to, departure: { kind: 'planned', local: '2026-10-21T09:00' }, extra: true }),
    { ok: true, request: { from, to, departure: { kind: 'planned', local: '2026-10-21T09:00' } } },
  );
});

test('rejects bad bodies and coordinates', () => {
  for (const body of [
    null,
    [],
    'from=1',
    { to, departure: { kind: 'now' } },
    { from: { lat: 91, lng: 0 }, to, departure: { kind: 'now' } },
    { from: { lat: 0, lng: -180.5 }, to, departure: { kind: 'now' } },
    { from: { lat: '25.03', lng: 121.56 }, to, departure: { kind: 'now' } },
    { from: { lat: Number.NaN, lng: 121.56 }, to, departure: { kind: 'now' } },
  ]) assert.equal(parseTransitRequest(body).ok, false, JSON.stringify(body));
});

test('rejects departures that are not now or a real local yyyy-mm-ddTHH:mm', () => {
  for (const departure of [
    undefined,
    { kind: 'later' },
    { kind: 'planned' },
    { kind: 'planned', local: '2026-10-21 09:00' },
    { kind: 'planned', local: '2026-10-21T9:00' },
    { kind: 'planned', local: '2026-10-21T09:00:00' },
    { kind: 'planned', local: '2026-10-21T09:00+08:00' },
    { kind: 'planned', local: '2026-02-30T09:00' },
    { kind: 'planned', local: '2026-13-01T09:00' },
    { kind: 'planned', local: '2026-10-21T24:00' },
    { kind: 'planned', local: '2026-10-21T09:60' },
  ]) assert.equal(parseTransitRequest({ from, to, departure }).ok, false, JSON.stringify(departure));
});

const now = new Date('2026-10-19T06:02:30.500Z');

test('a planned time in Asia/Taipei is read as Taipei wall-clock time', () => {
  const instant = resolveDeparture({ kind: 'planned', local: '2026-10-21T09:00' }, 'Asia/Taipei', now);
  assert.equal(instant.toISOString(), '2026-10-21T01:00:00.000Z');
  assert.equal(formatInZone(instant, 'Asia/Taipei'), '2026-10-21T09:00:00+08:00');
});

test('a planned time in Europe/Paris follows daylight saving time', () => {
  const summer = resolveDeparture({ kind: 'planned', local: '2026-10-21T09:00' }, 'Europe/Paris', now);
  assert.equal(summer.toISOString(), '2026-10-21T07:00:00.000Z');
  assert.equal(formatInZone(summer, 'Europe/Paris'), '2026-10-21T09:00:00+02:00');
  const winter = resolveDeparture({ kind: 'planned', local: '2026-11-02T09:00' }, 'Europe/Paris', now);
  assert.equal(winter.toISOString(), '2026-11-02T08:00:00.000Z');
  assert.equal(formatInZone(winter, 'Europe/Paris'), '2026-11-02T09:00:00+01:00');
});

test('Paris times skipped or repeated by a clock change resolve to one instant', () => {
  const skipped = resolveDeparture({ kind: 'planned', local: '2027-03-28T02:30' }, 'Europe/Paris', now);
  assert.equal(formatInZone(skipped, 'Europe/Paris'), '2027-03-28T03:30:00+02:00');
  const repeated = resolveDeparture({ kind: 'planned', local: '2026-10-25T02:30' }, 'Europe/Paris', now);
  assert.equal(formatInZone(repeated, 'Europe/Paris'), '2026-10-25T02:30:00+01:00');
});

test('a past planned time clamps to now rounded up to five minutes', () => {
  const past = resolveDeparture({ kind: 'planned', local: '2026-10-19T09:00' }, 'Asia/Taipei', now);
  assert.equal(past.toISOString(), '2026-10-19T06:05:00.000Z');
  assert.equal(formatInZone(past, 'Asia/Taipei'), '2026-10-19T14:05:00+08:00');
});

test('a planned time just ahead of now is kept as planned', () => {
  const soon = resolveDeparture({ kind: 'planned', local: '2026-10-19T14:03' }, 'Asia/Taipei', now);
  assert.equal(soon.toISOString(), '2026-10-19T06:03:00.000Z');
});

test('now rounds up to the next five minutes, and an exact boundary stays put', () => {
  assert.equal(resolveDeparture({ kind: 'now' }, 'Asia/Taipei', now).toISOString(), '2026-10-19T06:05:00.000Z');
  assert.equal(resolveDeparture({ kind: 'now' }, 'Asia/Taipei', new Date('2026-10-19T06:10:00.000Z')).toISOString(), '2026-10-19T06:10:00.000Z');
});

test('formats negative and half-hour offsets', () => {
  const instant = new Date('2026-10-21T13:00:00Z');
  assert.equal(formatInZone(instant, 'America/New_York'), '2026-10-21T09:00:00-04:00');
  assert.equal(formatInZone(instant, 'Asia/Kolkata'), '2026-10-21T18:30:00+05:30');
  assert.equal(formatInZone(instant, 'Etc/GMT'), '2026-10-21T13:00:00+00:00');
});

test('recognises IANA zone names', () => {
  assert.equal(isValidTimeZone('Asia/Tokyo'), true);
  assert.equal(isValidTimeZone('Not/A_Zone'), false);
});
