import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AiResolvedPlace } from '../types/aiImport';
import { CandidateList, isCandidateValid } from './AiImportDrawer';

const candidate: AiResolvedPlace = {
  tempId: 'candidate',
  name: 'Taipei 101',
  region: 'Taipei',
  category: 'Landmark',
  latitude: 25.033,
  longitude: 121.5654,
  notes: '',
  confidence: 1,
  sourceEvidence: 'Taipei 101',
  resolution: 'resolved',
  included: true,
};

function CandidateHarness() {
  const [place, setPlace] = useState(candidate);
  return (
    <CandidateList
      places={[place]}
      onIncluded={vi.fn()}
      onChange={(_id, updates) => setPlace((current) => ({ ...current, ...updates }))}
    />
  );
}

describe('AI import editable preview validation', () => {
  it('accepts complete editable place fields', () => {
    expect(isCandidateValid(candidate)).toBe(true);
  });

  it('requires valid place coordinates and identifying fields', () => {
    expect(isCandidateValid({ ...candidate, name: '' })).toBe(false);
    expect(isCandidateValid({ ...candidate, region: '' })).toBe(false);
    expect(isCandidateValid({ ...candidate, latitude: undefined })).toBe(false);
    expect(isCandidateValid({ ...candidate, longitude: 181 })).toBe(false);
  });

  it('accepts empty accommodation dates but rejects partial or reversed stays', () => {
    const accommodation = { ...candidate, category: 'Accommodation' as const };
    expect(isCandidateValid(accommodation)).toBe(true);
    expect(isCandidateValid({ ...accommodation, stay: { checkInDate: '2026-11-14', checkOutDate: '' } })).toBe(false);
    expect(isCandidateValid({ ...accommodation, stay: { checkInDate: '2026-11-17', checkOutDate: '2026-11-14' } })).toBe(false);
    expect(isCandidateValid({ ...accommodation, stay: { checkInDate: '2026-11-14', checkOutDate: '2026-11-17' } })).toBe(true);
  });

  it('accepts every canonical category without a separate place type', () => {
    expect(isCandidateValid({ ...candidate, category: 'Airport' })).toBe(true);
    expect(isCandidateValid({ ...candidate, category: 'Station' })).toBe(true);
    expect(isCandidateValid({ ...candidate, category: 'Transit' })).toBe(true);
  });

  it('selects Accommodation in one native change and renders stay fields', () => {
    render(
      <MantineProvider>
        <CandidateHarness />
      </MantineProvider>,
    );
    const category = screen.getByLabelText('Category');
    expect(category.tagName).toBe('SELECT');
    fireEvent.change(category, { target: { value: 'Accommodation' } });
    expect(screen.getByLabelText('Check-in date')).not.toBeNull();
    expect(screen.getByLabelText('Check-out date')).not.toBeNull();
    expect(screen.getByLabelText('Start time')).not.toBeNull();
    expect(screen.queryByLabelText('Place type')).toBeNull();
  });
});
