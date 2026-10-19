import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchTransitousPlan, transitousPlanUrl } from './transitousClient.ts';

const query = { from: { lat: 25.034, lng: 121.5645 }, to: { lat: 25.0372, lng: 121.4999 }, departAt: new Date('2026-10-21T01:00:00Z') };

test('builds the MOTIS v5 plan URL with coordinates and a UTC departure', () => {
  assert.equal(
    transitousPlanUrl('https://api.transitous.org/', query),
    'https://api.transitous.org/api/v5/plan?fromPlace=25.034,121.5645&toPlace=25.0372,121.4999&time=2026-10-21T01:00:00Z&detailedTransfers=false',
  );
});

test('sends the policy User-Agent and returns the parsed body', async () => {
  let seen: { url: string; userAgent: string | null } | null = null;
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    seen = { url, userAgent: new Headers(init?.headers).get('User-Agent') };
    return new Response('{"itineraries":[]}', { status: 200 });
  }) as typeof fetch;
  assert.deepEqual(await fetchTransitousPlan('https://example.test', query, fakeFetch), { ok: true, body: { itineraries: [] } });
  assert.deepEqual(seen, {
    url: 'https://example.test/api/v5/plan?fromPlace=25.034,121.5645&toPlace=25.0372,121.4999&time=2026-10-21T01:00:00Z&detailedTransfers=false',
    userAgent: 'trip-planner/0.1 (+https://github.com/LihSheng/trip-planner)',
  });
});

test('classifies provider failures', async () => {
  const respond = (body: string, status: number) => (async () => new Response(body, { status })) as typeof fetch;
  assert.deepEqual(await fetchTransitousPlan('https://example.test', query, respond('slow down', 429)), { ok: false, reason: 'rateLimited', status: 429 });
  assert.deepEqual(await fetchTransitousPlan('https://example.test', query, respond('oops', 500)), { ok: false, reason: 'unavailable', status: 500 });
  assert.deepEqual(await fetchTransitousPlan('https://example.test', query, respond('<html>', 200)), { ok: false, reason: 'invalidJson', status: 200 });
  const offline = (async () => { throw new TypeError('network down'); }) as typeof fetch;
  assert.deepEqual(await fetchTransitousPlan('https://example.test', query, offline), { ok: false, reason: 'unavailable', status: null });
});

test('gives up after the timeout', async () => {
  const hang = ((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  })) as typeof fetch;
  assert.deepEqual(await fetchTransitousPlan('https://example.test', query, hang, 20), { ok: false, reason: 'unavailable', status: null });
});
