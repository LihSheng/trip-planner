import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { Place, TripState } from '../types';
import { PlannerBoard } from './PlannerBoard';

// Real dnd-kit and real board components; only the layout is faked, since jsdom has none.
vi.mock('./TransitSheet', () => ({ useTransitSheet: () => ({ openTransit: vi.fn() }) }));
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
    markUndoPoint: vi.fn(),
    undo: vi.fn(),
    activityEvents: [],
  }),
}));

const place = (id: string, name: string): Place => ({ id, name, region: 'New Taipei', category: 'Culture', latitude: 25, longitude: 121.7, notes: '' });
const lunch: Place = { id: 'lunch', name: 'meal', region: '', category: 'Food', latitude: 25, longitude: 121.7, notes: '', placeholderKind: 'meal' };

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

// The desktop planner as the demo trip renders it at 1440px: rail on the left, the open day's full-width
// cards in the middle, Unscheduled on the right. The drag preview is a small chip at the card's top-left.
function layout(element: Element): DOMRect {
  const indexIn = (selector: string, target: Element = element) => [...document.querySelectorAll(selector)].indexOf(target);
  if (element.matches('.place-card--preview')) {
    const overlay = element.parentElement as HTMLElement;
    return rect(parseFloat(overlay.style.left), parseFloat(overlay.style.top), 250, 44);
  }
  if (element.matches('.day-rail__item')) return rect(40, 230 + 61 * indexIn('.day-rail__item'), 236, 57);
  if (element.matches('.day-column--unscheduled')) return rect(1160, 100, 230, 400);
  if (element.matches('.day-column--focus')) return rect(300, 100, 820, 760);
  // Each stop's card, or the timeline row wrapping it, is one full-width slot.
  const stop = element.matches('.place-card, .timeline-stop') ? element.closest('.day-column--focus .planner-place') : null;
  if (stop) return rect(314, 272 + 120 * indexIn('.day-column--focus .planner-place', stop), 788, 92);
  if (element.matches('.place-card-row')) return rect(1170, 140 + 40 * indexIn('.place-card-row'), 210, 32);
  return rect(0, 0, 0, 0);
}

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) { return layout(this); });
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  move.mockReset();
});

async function openDayTwo() {
  tripState = {
    version: 1,
    tripName: 'Taiwan',
    startDate: '2026-11-07',
    places: [place('shifen', 'Shifen Old Street'), place('jiufen', 'Jiufen Old Street'), lunch, place('alishan', 'Alishan')],
    unscheduledIds: ['alishan'],
    visitedPlaceIds: [],
    days: [
      { id: 'day-1', label: 'Taipei arrival', placeIds: [] },
      { id: 'day-2', label: 'Northern day trip', placeIds: ['shifen', 'jiufen', 'lunch'] },
      { id: 'day-3', label: 'Central Taiwan', placeIds: [] },
      { id: 'day-4', label: 'Tainan', placeIds: [] },
      { id: 'day-5', label: 'Kaohsiung', placeIds: [] },
    ],
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
  fireEvent.click(screen.getByText('Northern day trip', { selector: '.day-rail__title' }));
}

// Space picks the card up; the sensor starts listening for the next keys after a tick.
async function press(card: HTMLElement, ...codes: string[]) {
  for (const code of codes) {
    fireEvent.keyDown(card, { code, key: code === 'Space' ? ' ' : code });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}

function lunchCard() {
  return screen.getByText(/Lunch/).closest('.place-card') as HTMLElement;
}

describe('PlannerBoard keyboard drag', () => {
  it('moves a stop up within its day', async () => {
    await openDayTwo();

    await press(lunchCard(), 'Space', 'ArrowUp', 'Space');

    expect(move).toHaveBeenCalledOnce();
    expect(move).toHaveBeenCalledWith('lunch', 'day-2', 1);
  });

  it('moves a stop to another day through the day rail', async () => {
    await openDayTwo();

    // Left reaches the rail beside the stop (Kaohsiung), Up walks the rail to Tainan.
    await press(lunchCard(), 'Space', 'ArrowLeft', 'ArrowUp', 'Space');

    expect(move).toHaveBeenCalledOnce();
    expect(move).toHaveBeenCalledWith('lunch', 'day-4', 0);
  });
});
