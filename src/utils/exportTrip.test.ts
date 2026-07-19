import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import { formatTripPlainText } from './exportTrip';

describe('plain-text itinerary export', () => {
  it('includes day names and notes without coordinates', () => {
    const text = formatTripPlainText(createInitialState());

    expect(text).toContain('Day 1 — Taipei arrival');
    expect(text).toContain('1. Taipei 101');
    expect(text).toContain('   Observation deck and Xinyi district walk.');
    expect(text).not.toContain('25.033');
    expect(text).not.toContain('121.5654');
  });
});
