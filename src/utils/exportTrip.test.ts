import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../data/seed';
import { exportTripExcel, exportTripJson, exportTripMarkdown, formatTripPlainText } from './exportTrip';

describe('plain-text itinerary export', () => {
  it('includes day names and notes without coordinates', () => {
    const text = formatTripPlainText(createInitialState());

    expect(text).toContain('Day 1 — Taipei arrival');
    expect(text).toContain('1. Taipei 101');
    expect(text).toContain('   Observation deck and Xinyi district walk.');
    expect(text).not.toContain('25.033');
    expect(text).not.toContain('121.5654');
  });

  it('includes empty days and unscheduled places', () => {
    const state = createInitialState();
    state.days[0].placeIds = [];
    const text = formatTripPlainText(state);

    expect(text).toContain('No places scheduled.');
    expect(text).toContain('Unscheduled');
    expect(text).toContain('Alishan');
  });

  it('downloads JSON, Markdown, and Excel with safe filenames', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const state = { ...createInitialState(), tripName: 'Taiwan & Friends!' };

    exportTripJson(state);
    exportTripMarkdown(state);
    exportTripExcel(state);

    expect(click).toHaveBeenCalledTimes(3);
    expect(revoke).toHaveBeenCalledTimes(3);
  });
});
