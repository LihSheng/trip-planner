import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, type Context, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as tripContext from '../context/TripContext';
import type { SavedLegTransit } from '../domain/transit';
import { useTripState } from '../hooks/useTripState';
import { I18nProvider } from '../i18n';
import { resetTransitSessionCache } from '../lib/transitClient';
import type { Place, TripState } from '../types';
import { dayLegs } from '../utils/routing';
import { TransportLegChip } from './TransportLegChip';
import { TransitSheetProvider, useTransitSheet } from './TransitSheet';

vi.mock('../context/TripContext', async () => {
  const React = await import('react');
  const TestTripContext = React.createContext<unknown>(null);
  return { TestTripContext, useTrip: () => React.useContext(TestTripContext) };
});

let auth: { isAuthenticated: boolean; user: { id: string }; accessToken: string };
vi.mock('../context/AuthContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../context/AuthContext')>(),
  useAuth: () => auth,
}));

const TestTripContext = (tripContext as unknown as { TestTripContext: Context<unknown> }).TestTripContext;

const stop = (id: string, latitude: number): Place => ({ id, name: id, region: 'Taipei', category: 'Landmark', latitude, longitude: 121.5, notes: '' });
const a = stop('Taipei 101', 25.0);
const b = stop('Longshan', 25.05);

const saved: SavedLegTransit = {
  provider: 'transitous',
  fetchedAt: '2026-10-19T02:00:00.000Z',
  basis: { from: { lat: 25.0, lng: 121.5 }, to: { lat: 25.05, lng: 121.5 }, departAt: '2026-10-21T10:00:00+08:00' },
  options: [
    { signature: 'metro:BL', minutes: 22, steps: [{ kind: 'metro', minutes: 22, line: 'BL', stopCount: 5 }] },
    { signature: 'bus:307', minutes: 35, steps: [{ kind: 'bus', minutes: 35, line: '307', fromStop: 'Stop A', toStop: 'Stop B' }] },
  ],
};

const trip = (transitByLeg: TripState['days'][number]['transitByLeg'] = {}): TripState => ({
  version: 1, tripName: 'Transit', startDate: '2026-10-21', places: [a, b], unscheduledIds: [], visitedPlaceIds: [],
  days: [{ id: 'day-1', label: '', placeIds: [a.id, b.id], travelMode: 'public', transitByLeg }],
});

function Trip({ initial, readOnly, children }: { initial: TripState; readOnly: boolean; children: ReactNode }) {
  const tripState = useTripState(readOnly);
  const { setState } = tripState;
  useEffect(() => { setState(initial); }, [initial, setState]);
  return <TestTripContext.Provider value={{ ...tripState, isReadOnly: readOnly }}>{children}</TestTripContext.Provider>;
}

function FirstLeg() {
  const { state, placesById, isReadOnly } = tripContext.useTrip();
  const { openTransit } = useTransitSheet();
  const leg = dayLegs(state.days[0], placesById, [])[0];
  if (!leg || leg.from.id !== a.id) return null;
  return (
    <TransportLegChip
      leg={leg}
      dayDefaultMode="public"
      readOnly={isReadOnly}
      onChange={vi.fn()}
      onOpenTransit={() => openTransit({ dayId: 'day-1', fromPlaceId: a.id, toPlaceId: b.id })}
    />
  );
}

function renderLeg(initial: TripState, readOnly: boolean) {
  return render(
    <MantineProvider env="test">
      <I18nProvider>
        <Trip initial={initial} readOnly={readOnly}>
          <TransitSheetProvider><FirstLeg /></TransitSheetProvider>
        </Trip>
      </I18nProvider>
    </MantineProvider>,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  resetTransitSessionCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TransitSheet', () => {
  it('opens from a read-only chip and shows the saved route without editing', async () => {
    auth = { isAuthenticated: false, user: { id: 'shared-trip-viewer' }, accessToken: '' };
    renderLeg(trip({ 'Taipei 101:Longshan': saved }), true);

    fireEvent.click(await screen.findByRole('button', { name: '18 min, show transit options' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Option 1')).toBeDefined();
    expect(within(dialog).getByText('Metro BL · 5 stops · 22 min')).toBeDefined();
    expect(within(dialog).getByText('Stop A → Stop B')).toBeDefined();
    expect(within(dialog).queryByRole('button', { name: 'Choose' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Refresh' })).toBeNull();
    expect(within(dialog).getByRole('link', { name: 'Routes: Transitous · data sources' }).getAttribute('href')).toBe('https://transitous.org/sources/');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tells a viewer when nothing is saved and still offers Open route', async () => {
    auth = { isAuthenticated: false, user: { id: 'shared-trip-viewer' }, accessToken: '' };
    renderLeg(trip(), true);

    fireEvent.click(await screen.findByRole('button', { name: '18 min, show transit options' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('No saved route yet.')).toBeDefined();
    expect(within(dialog).getByRole('link', { name: 'Open route' })).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets an editor choose a route, which then sets the leg minutes', async () => {
    auth = { isAuthenticated: true, user: { id: 'user-1' }, accessToken: 'token' };
    renderLeg(trip({ 'Taipei 101:Longshan': saved }), false);

    fireEvent.click(await screen.findByRole('button', { name: '18 min, show transit options' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Choose' })[1]);

    expect(await screen.findByRole('button', { name: '35 min, show transit options, chosen route' })).toBeDefined();
    expect(within(dialog).getByText('Chosen')).toBeDefined();
    expect(within(dialog).getAllByRole('button', { name: 'Choose' })).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('looks up once on open when nothing is saved and says when there are no routes', async () => {
    auth = { isAuthenticated: true, user: { id: 'user-1' }, accessToken: 'token' };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      version: 1, provider: 'transitous', departAt: '2026-10-19T10:05:00+08:00', timeZone: 'Asia/Taipei', fetchedAt: '2026-10-19T02:00:00.000Z', options: [],
    }), { status: 200 }));
    renderLeg(trip(), false);

    fireEvent.click(await screen.findByRole('button', { name: '18 min, show transit options' }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('No transit routes found for this place or date.')).toBeDefined();
    expect(within(dialog).getByRole('link', { name: 'Open route' })).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).departure).toEqual({ kind: 'now' });
  });

  it('shows the busy message when the shared limit is hit', async () => {
    auth = { isAuthenticated: true, user: { id: 'user-1' }, accessToken: 'token' };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'TRANSIT_BUSY', message: 'Busy', requestId: 'r', retryable: true }), { status: 503 }));
    renderLeg(trip(), false);

    fireEvent.click(await screen.findByRole('button', { name: '18 min, show transit options' }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Busy, try again in a minute.')).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'Find routes' })).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
