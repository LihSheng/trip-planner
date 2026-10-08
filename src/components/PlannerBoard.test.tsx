import { MantineProvider } from '@mantine/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { Place, TripState } from '../types';
import { PlannerBoard } from './PlannerBoard';

// Real pointer drags are unreliable in jsdom, so capture the board's drop handler and call it directly.
let dragEnd: ((event: DragEndEvent) => void) | undefined;
vi.mock('@dnd-kit/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dnd-kit/core')>()),
  DndContext: ({ children, onDragEnd }: { children: ReactNode; onDragEnd?: (event: DragEndEvent) => void }) => {
    dragEnd = onDragEnd;
    return <>{children}</>;
  },
  DragOverlay: () => null,
}));

vi.mock('./DayRail', () => ({ DayRail: () => null }));
vi.mock('./DayColumn', () => ({ DayColumn: () => null }));
vi.mock('./TripOverview', () => ({ TripOverview: () => null }));
vi.mock('./UnscheduledColumn', () => ({ UnscheduledColumn: () => null }));
vi.mock('./TripActivityDrawer', () => ({ TripActivityDrawer: () => null }));
vi.mock('./DayTasksModal', () => ({ DayTasksModal: () => null }));
vi.mock('./BookingModals', () => ({ FlightBookingModal: () => null, StayBookingModal: () => null }));

const move = vi.fn();
let tripState: TripState;
vi.mock('../context/TripContext', () => ({
  useTrip: () => ({
    state: tripState,
    placesById: new Map(tripState.places.map((place) => [place.id, place])),
    isReadOnly: false,
    move,
    activityEvents: [],
  }),
}));

const temple: Place = { id: 'temple', name: 'Longshan Temple', region: 'Taipei', category: 'Culture', latitude: 25.037, longitude: 121.4999, notes: '' };
const hotel: Place = {
  id: 'hotel',
  name: 'Harbour Hotel',
  region: 'Kaohsiung',
  category: 'Accommodation',
  latitude: 22.62,
  longitude: 120.28,
  notes: '',
  // Day 1 is 2026-10-10, before check-in.
  stay: { checkInDate: '2026-10-12', checkOutDate: '2026-10-14' },
};

function renderBoard() {
  tripState = {
    version: 1,
    tripName: 'Taiwan',
    startDate: '2026-10-10',
    places: [temple, hotel],
    unscheduledIds: [temple.id, hotel.id],
    visitedPlaceIds: [],
    days: [{ id: 'day-1', label: '', placeIds: [] }],
  };
  render(
    <MantineProvider env="test">
      <I18nProvider>
        <PlannerBoard
          selectedId={null}
          onSelect={vi.fn()}
          onEditActivity={vi.fn()}
          onDeletePlace={vi.fn()}
          onAddPlaceToDay={vi.fn()}
          onReplacePlaceholder={vi.fn()}
        />
      </I18nProvider>
    </MantineProvider>,
  );
}

function drop(activeId: string, overId: string) {
  act(() => dragEnd?.({ active: { id: activeId }, over: { id: overId } } as unknown as DragEndEvent));
}

afterEach(() => {
  cleanup();
  dragEnd = undefined;
});

describe('PlannerBoard drag and drop', () => {
  it('moves a dropped place exactly once', () => {
    renderBoard();

    drop(temple.id, 'day:day-1');

    expect(move).toHaveBeenCalledOnce();
    expect(move).toHaveBeenCalledWith(temple.id, 'day-1', 0);
  });

  it('waits for confirmation before assigning an accommodation outside its stay dates', () => {
    renderBoard();

    drop(hotel.id, 'day:day-1');

    expect(screen.getByText('Assign accommodation outside stay dates?')).not.toBeNull();
    expect(move).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Assign anyway' }));

    expect(move).toHaveBeenCalledOnce();
    expect(move).toHaveBeenCalledWith(hotel.id, 'day-1', 0);
  });
});
