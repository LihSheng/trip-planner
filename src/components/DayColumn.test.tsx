import { MantineProvider } from '@mantine/core';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { Place, TripDay } from '../types';
import { DayColumn } from './DayColumn';

let dragActive = false;
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    useDndContext: () => ({ ...actual.useDndContext(), active: dragActive ? { id: 'first' } : null }),
  };
});

const first: Place = { id: 'first', name: 'First', region: 'Taipei', category: 'Landmark', latitude: 25.03, longitude: 121.56, notes: '' };
const second: Place = { id: 'second', name: 'Second', region: 'Taipei', category: 'Food', latitude: 25.04, longitude: 121.57, notes: '' };
const day: TripDay = { id: 'day-1', label: 'Seeded', placeIds: ['first', 'second'], travelMode: 'walk', stopSchedules: { second: { startTime: '11:00' } } };

function renderDay() {
  return render(
    <MantineProvider env="test">
      <I18nProvider>
        <DayColumn
          day={day}
          index={0}
          startDate="2026-10-10"
          places={[first, second]}
          selectedId={null}
          visitedPlaceIds={[]}
          onSelect={vi.fn()}
          onAddPlace={vi.fn()}
          onAddPlaceholder={vi.fn()}
          onReplacePlaceholder={vi.fn()}
          onRenamePlaceholder={vi.fn()}
          onLabelChange={vi.fn()}
          onRemove={vi.fn()}
          onEditActivity={vi.fn()}
          onDeletePlace={vi.fn()}
          onDayScheduleChange={vi.fn()}
          onStopScheduleChange={vi.fn()}
          hotelPlaces={[]}
          onLegModeChange={vi.fn()}
          onOpenTasks={vi.fn()}
        />
      </I18nProvider>
    </MantineProvider>,
  );
}

afterEach(() => {
  cleanup();
  dragActive = false;
});

describe('DayColumn timeline', () => {
  it('shows projected times in the gutter and minutes and mode on the leg row', () => {
    const { container } = renderDay();
    const gutters = [...container.querySelectorAll('.timeline-stop__time')].map((gutter) => ({
      start: gutter.querySelector('.timeline-stop__start')?.textContent,
      end: gutter.querySelector('.timeline-stop__end')?.textContent,
      estimated: gutter.hasAttribute('data-estimated'),
    }));
    expect(gutters).toEqual([
      { start: '~09:00', end: '10:30', estimated: true },
      { start: '11:00', end: '12:00', estimated: false },
    ]);
    const legs = [...container.querySelectorAll('.timeline-leg')].map((leg) => leg.textContent);
    expect(legs).toEqual(['23 min ·walk']);
  });

  it('hides leg rows while a drag is active', () => {
    dragActive = true;
    const { container } = renderDay();
    expect(container.querySelectorAll('.timeline-stop')).toHaveLength(2);
    expect(container.querySelectorAll('.timeline-leg')).toHaveLength(0);
  });
});
