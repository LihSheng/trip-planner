import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { SavedLegTransit } from '../domain/transit';
import type { Place, TripDay } from '../types';
import { dayTravelMinutes } from '../utils/routing';
import { DayColumn } from './DayColumn';

let dragActive = false;
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    useDndContext: () => ({ ...actual.useDndContext(), active: dragActive ? { id: 'first' } : null }),
  };
});

const openTransit = vi.fn();
vi.mock('./TransitSheet', () => ({ useTransitSheet: () => ({ openTransit }) }));

const first: Place = { id: 'first', name: 'First', region: 'Taipei', category: 'Landmark', latitude: 25.03, longitude: 121.56, notes: '' };
const second: Place = { id: 'second', name: 'Second', region: 'Taipei', category: 'Food', latitude: 25.04, longitude: 121.57, notes: '' };
const lunch: Place = { id: 'lunch', name: 'meal', region: '', category: 'Food', latitude: 0, longitude: 0, notes: '', placeholderKind: 'meal' };
const planned: TripDay = { id: 'day-1', label: 'Seeded', placeIds: ['first', 'second'], travelMode: 'walk', stopSchedules: { second: { startTime: '11:00' } } };

function renderDay(day: TripDay, places: Place[], readOnly = false) {
  return render(
    <MantineProvider env="test">
      <I18nProvider>
        <DayColumn
          readOnly={readOnly}
          day={day}
          index={0}
          startDate="2026-10-10"
          places={places}
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

function gutters(container: HTMLElement) {
  return [...container.querySelectorAll('.timeline-stop__time')].map((gutter) => ({
    start: gutter.querySelector('.timeline-stop__start')?.textContent,
    end: gutter.querySelector('.timeline-stop__end')?.textContent,
    estimated: gutter.hasAttribute('data-estimated'),
  }));
}

afterEach(() => {
  cleanup();
  dragActive = false;
  openTransit.mockReset();
});

describe('DayColumn timeline', () => {
  it('shows projected times in the gutter and the leg on the row between stops', () => {
    const { container } = renderDay(planned, [first, second]);
    expect(gutters(container)).toEqual([
      { start: '~09:00', end: '10:30', estimated: true },
      { start: '11:00', end: '12:00', estimated: false },
    ]);
    expect([...container.querySelectorAll('.timeline-leg')].map((leg) => leg.textContent)).toEqual(['walk· 23 min']);
  });

  it('shows the shortfall inline on the stop', () => {
    renderDay({ ...planned, stopSchedules: { second: { startTime: '10:40' } } }, [first, second]);
    expect(screen.getByText('13 min short for travel')).toBeDefined();
  });

  it('bridges a placeholder: the header total, the map total and the timeline agree', () => {
    const day: TripDay = { id: 'day-1', label: '', placeIds: ['first', 'lunch', 'second'], travelMode: 'walk' };
    const { container } = renderDay(day, [first, lunch, second]);
    expect(screen.getByText('· 2 legs · 23 min travel')).toBeDefined();
    expect(dayTravelMinutes(day, new Map([first, lunch, second].map((place) => [place.id, place])), [])).toBe(23);
    expect(gutters(container).map((gutter) => gutter.start)).toEqual(['~09:00', '~10:30', '~11:53']);
    const legs = [...container.querySelectorAll('.timeline-leg')];
    expect(legs.map((leg) => leg.classList.contains('timeline-leg--quiet'))).toEqual([true, false]);
    expect(legs[1].textContent).toBe('walk· 23 minfrom First');
  });

  it('opens transit from the leg minutes, also for viewers, with the chosen mark', () => {
    const route: SavedLegTransit = {
      provider: 'mock',
      fetchedAt: '2026-10-19T01:00:00.000Z',
      basis: { from: { lat: first.latitude, lng: first.longitude }, to: { lat: second.latitude, lng: second.longitude }, departAt: '2026-10-10T10:30:00+08:00' },
      options: [{ signature: 'metro:Red', minutes: 31, steps: [{ kind: 'metro', minutes: 31, line: 'Red' }] }],
      chosen: 'metro:Red',
    };
    const day: TripDay = { id: 'day-1', label: '', placeIds: ['first', 'second'], travelMode: 'public', transitByLeg: { 'first:second': route } };
    const { container } = renderDay(day, [first, second], true);
    expect(gutters(container).map((gutter) => gutter.start)).toEqual(['~09:00', '~11:01']);
    fireEvent.click(screen.getByRole('button', { name: '31 min, show transit options, chosen route' }));
    expect(openTransit).toHaveBeenCalledWith({ dayId: 'day-1', fromPlaceId: 'first', toPlaceId: 'second' });
  });

  it('opens transit for a bridged leg between the two real stops', () => {
    const day: TripDay = { id: 'day-1', label: '', placeIds: ['first', 'lunch', 'second'], travelMode: 'public' };
    renderDay(day, [first, lunch, second]);
    fireEvent.click(screen.getByRole('button', { name: /show transit options/ }));
    expect(openTransit).toHaveBeenCalledWith({ dayId: 'day-1', fromPlaceId: 'first', toPlaceId: 'second' });
  });

  it('hides leg rows while a drag is active', () => {
    dragActive = true;
    const { container } = renderDay(planned, [first, second]);
    expect(container.querySelectorAll('.timeline-stop')).toHaveLength(2);
    expect(container.querySelectorAll('.timeline-leg')).toHaveLength(0);
  });
});
