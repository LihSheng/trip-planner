import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../data/seed';
import { applyAiDraft } from './applyAiDraft';
import type { ConfirmedAiDraft } from '../types/aiImport';

vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'test-id') });

const confirmed: ConfirmedAiDraft = {
  preferences: { pace: 'balanced', mergeMode: 'new-days', travelMode: 'walk' },
  draft: { requestId: 'request', summary: '', warnings: [], provider: 'test', model: 'test', unscheduled: [], days: [{ tempId: 'day', label: 'Imported', places: [{ tempId: 'new', name: 'Museum', region: 'Taipei', category: 'Culture', latitude: 25, longitude: 121, notes: 'Source note', confidence: 1, sourceEvidence: 'Museum', resolution: 'resolved', included: true, suggestedStartTime: '10:00' }] }] },
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

  it('adds an unresolved candidate after the user supplies valid coordinates', () => {
    const draft = structuredClone(confirmed);
    draft.draft.days[0].places[0] = {
      ...draft.draft.days[0].places[0],
      resolution: 'not-found',
      latitude: 25.1,
      longitude: 121.5,
    };
    expect(applyAiDraft(createInitialState(), draft).places.at(-1)).toMatchObject({
      name: 'Museum',
      latitude: 25.1,
      longitude: 121.5,
    });
  });

  it('uses user-edited preview fields when the draft is approved', () => {
    const draft = structuredClone(confirmed);
    draft.draft.days[0].places[0] = {
      ...draft.draft.days[0].places[0],
      name: 'Edited Museum',
      region: 'New Taipei',
      notes: 'Edited before saving',
      latitude: 25.1,
      longitude: 121.5,
    };
    const result = applyAiDraft(createInitialState(), draft);
    expect(result.places.at(-1)).toMatchObject({
      name: 'Edited Museum',
      region: 'New Taipei',
      notes: 'Edited before saving',
      latitude: 25.1,
      longitude: 121.5,
    });
  });

  it('persists accommodation stay dates from the editable preview', () => {
    const draft = structuredClone(confirmed);
    draft.draft.days[0].places[0] = {
      ...draft.draft.days[0].places[0],
      category: 'Accommodation',
      stay: { checkInDate: '2026-11-14', checkOutDate: '2026-11-17' },
    };
    const result = applyAiDraft(createInitialState(), draft);
    expect(result.places.at(-1)).toMatchObject({
      category: 'Accommodation',
      stay: { checkInDate: '2026-11-14', checkOutDate: '2026-11-17' },
    });
  });

  it('reuses an existing place without overwriting its saved details', () => {
    const state = createInitialState();
    const draft = structuredClone(confirmed);
    draft.draft.days[0].places[0] = {
      ...draft.draft.days[0].places[0],
      name: 'AI replacement',
      category: 'Airport',
      resolution: 'existing-place',
      existingPlaceId: 'taipei-101',
    };
    const result = applyAiDraft(state, draft);
    expect(result.places).toEqual(state.places);
    expect(result.days.at(-1)?.placeIds).toEqual(['taipei-101']);
  });

  it('schedules a reviewed standalone imported location on a new day', () => {
    const draft = structuredClone(confirmed);
    draft.draft.days = [];
    draft.draft.unscheduled = [draft.draft.days[0]?.places[0] ?? confirmed.draft.days[0].places[0]];
    const result = applyAiDraft(createInitialState(), draft);
    expect(result.days).toHaveLength(createInitialState().days.length + 1);
    expect(result.days.at(-1)?.placeIds).toEqual(['place-test-id']);
    expect(result.unscheduledIds).not.toContain('place-test-id');
  });
});
