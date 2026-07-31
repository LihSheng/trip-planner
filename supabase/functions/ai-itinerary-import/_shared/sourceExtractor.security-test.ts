import assert from 'node:assert/strict';
import test from 'node:test';
import { parseModelDraft } from './modelDraft.ts';
import { isAllowedUrlHost, isPublicIpAddress, SourceError, validatePublicUrl } from './sourceExtractor.ts';

const categories = new Set(['Landmark', 'Food']);

test('rejects local, reserved, and IPv4-mapped IP addresses', () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '100.64.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '198.18.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:7f00:1',
    '[::ffff:a9fe:a9fe]',
  ]) assert.equal(isPublicIpAddress(address), false, address);
});

test('accepts globally routable IP addresses', () => {
  assert.equal(isPublicIpAddress('8.8.8.8'), true);
  assert.equal(isPublicIpAddress('2606:4700:4700::1111'), true);
});

test('matches only exact approved domains and their subdomains', () => {
  const allowed = ['google.com', 'goo.gl'];
  assert.equal(isAllowedUrlHost('google.com', allowed), true);
  assert.equal(isAllowedUrlHost('maps.google.com', allowed), true);
  assert.equal(isAllowedUrlHost('maps.app.goo.gl', allowed), true);
  assert.equal(isAllowedUrlHost('google.com.attacker.example', allowed), false);
  assert.equal(isAllowedUrlHost('attacker-google.com', allowed), false);
});

test('rejects mapped loopback literals even when explicitly allowlisted', async () => {
  await assert.rejects(
    validatePublicUrl('http://[::ffff:127.0.0.1]/', ['::ffff:7f00:1']),
    (error) => error instanceof SourceError && error.code === 'INVALID_SOURCE',
  );
});

test('accepts a complete, bounded model draft', () => {
  const result = parseModelDraft(JSON.stringify({
    summary: 'Two places',
    destination: 'Taipei',
    places: [{
      name: 'Taipei 101',
      region: 'Taipei',
      category: 'Landmark',
      notes: '',
      confidence: 0.95,
      sourceEvidence: 'Visit Taipei 101',
      suggestedStartTime: '10:30',
      durationMinutes: 90,
    }],
  }), categories);
  assert.equal(result?.places[0].tempId, 'candidate-0');
});

test('rejects partial, oversized, or schema-expanded model output', () => {
  const base = {
    summary: 'One place',
    places: [{
      name: 'Taipei 101',
      region: 'Taipei',
      category: 'Landmark',
      notes: '',
      confidence: 0.95,
      sourceEvidence: 'Visit Taipei 101',
    }],
  };
  assert.equal(parseModelDraft(JSON.stringify({ ...base, extra: true }), categories), null);
  assert.equal(parseModelDraft(JSON.stringify({ ...base, places: [{ ...base.places[0], name: 'x'.repeat(201) }] }), categories), null);
  assert.equal(parseModelDraft(JSON.stringify({ ...base, places: [...base.places, { name: 'Missing required fields' }] }), categories), null);
  assert.equal(parseModelDraft(JSON.stringify({ ...base, places: [{ ...base.places[0], durationMinutes: 1.5 }] }), categories), null);
});
