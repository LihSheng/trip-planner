import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../data/seed';
import { applyAiDraft } from './applyAiDraft';
import type { ConfirmedAiDraft } from '../types/aiImport';

vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'test-id') });

const confirmed: ConfirmedAiDraft = {
  preferences: { pace: 'balanced', mergeMode: 'new-days', travelMode: 'walk' },
  draft: { requestId: 'request', summary: '', warnings: [], provider: 'test', model: 'test', unscheduled: [], days: [{ tempId: 'day', label: 'Imported', places: [{ tempId: 'new', name: 'Museum', region: 'Taipei', category: 'Culture', type: 'place', latitude: 25, longitude: 121, notes: 'Source note', confidence: 1, sourceEvidence: 'Museum', resolution: 'resolved', included: true, suggestedStartTime: '10:00' }] }] },
};

describe('applyAiDraft', () => {
  it('adds reviewed resolved places without changing existing state', () => {
    const state = createInitialState();
    const result = applyAiDraft(state, confirmed);
    expect(result.places).toHaveLength(state.places.length + 1);
    expect(result.days).toHaveLength(state.days.length + 1);
    expect(result.days.at(-1)?.stopSchedules).toEqual({ 'place-test-id': { startTime: '10:00', durationMinutes: undefined } });
    expect(state.places).toHaveLength(8);
  });

  it('does not add unresolved candidates', () => {
    const draft = structuredClone(confirmed);
    draft.draft.days[0].places[0] = { ...draft.draft.days[0].places[0], resolution: 'not-found', latitude: undefined, longitude: undefined };
    expect(applyAiDraft(createInitialState(), draft).places).toHaveLength(8);
  });
});
