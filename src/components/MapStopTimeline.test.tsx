import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { Place, TripDay } from '../types';
import { dayLegs, type ResolvedLeg } from '../utils/routing';
import { MapStopTimeline } from './MapStopTimeline';

const place = (id: string, name: string, latitude = 25, longitude = 121): Place => ({ id, name, region: 'Taipei', category: 'Landmark', latitude, longitude, notes: '' });
const places = [place('a', 'Alpha'), place('b', 'Bravo'), place('c', 'Charlie')];
const day = { id: 'd1', label: 'Day 1', placeIds: ['a', 'b', 'c'], stopSchedules: { a: { startTime: '09:00' } } } as unknown as TripDay;
const leg = (from: Place, to: Place, minutes: number): ResolvedLeg => ({ from, to, legMode: 'default', mode: 'walk', minutes, inside: false });
const legs = [leg(places[0], places[1], 12), leg(places[1], places[2], 25)];
const stop = (name: string) => screen.getByText(name).closest('button')!;

function setup(selectedId: string | null, visited: string[], onSelect = vi.fn(), props = { day, places, legs }) {
  render(
    <MantineProvider env="test">
      <I18nProvider>
        <MapStopTimeline {...props} selectedId={selectedId} visitedPlaceIds={visited} onSelect={onSelect} />
      </I18nProvider>
    </MantineProvider>,
  );
  return onSelect;
}

describe('MapStopTimeline', () => {
  it('renders stops and the minutes of each leg between them', () => {
    setup(null, []);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(document.querySelectorAll('.map-stop-timeline__leg')).toHaveLength(2);
    expect(screen.getByText('12 min')).toBeDefined();
    expect(screen.getByText('25 min')).toBeDefined();
    expect(screen.getByText('09:00')).toBeDefined();
  });

  it('calls onSelect with the clicked stop id', () => {
    const onSelect = setup(null, []);
    fireEvent.click(stop('Bravo'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('pairs each leg with its stops when the day has a hotel stay and a placeholder', () => {
    // The map passes every stop the day lists, so the legs are the planner's, not a route between markers.
    const hotel = place('hotel', 'Hotel', 25.0478, 121.517);
    const stay = { ...hotel, id: 'stay-1', assignmentOf: 'hotel' };
    const shifen = place('shifen', 'Shifen', 25.0477, 121.7756);
    const lunch: Place = { ...place('placeholder-lunch', 'Lunch', 0, 0), placeholderKind: 'meal' };
    const jiufen = place('jiufen', 'Jiufen', 25.1092, 121.8452);
    const stops = [stay, shifen, lunch, jiufen];
    const stopDay = { id: 'd2', label: 'Day 2', placeIds: stops.map((stop) => stop.id), travelMode: 'public' } as unknown as TripDay;
    const stopLegs = dayLegs(stopDay, new Map(stops.map((stop) => [stop.id, stop])), []);
    setup(null, [], vi.fn(), { day: stopDay, places: stops, legs: stopLegs });

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('1Hotel'), expect.stringContaining('2Shifen'), expect.stringContaining('3Lunch'), expect.stringContaining('4Jiufen'),
    ]);
    const legMinutes = [...document.querySelectorAll('.map-stop-timeline__leg')].map((node) => node.textContent);
    expect(legMinutes).toEqual([`${stopLegs[0].minutes} min`, '', '']);
    expect(stopLegs[0].minutes).toBeGreaterThan(0);
  });

  it('marks selected and visited stops', () => {
    setup('b', ['c']);
    expect(stop('Bravo').className).toContain('map-stop-timeline__stop--selected');
    expect(stop('Charlie').className).toContain('map-stop-timeline__stop--visited');
    expect(stop('Alpha').className).not.toContain('--selected');
  });
});
