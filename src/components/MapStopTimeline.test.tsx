import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { Place, TripDay } from '../types';
import type { ResolvedLeg } from '../utils/routing';
import { MapStopTimeline } from './MapStopTimeline';

const place = (id: string, name: string): Place => ({ id, name, region: 'Taipei', category: 'Landmark', latitude: 25, longitude: 121, notes: '' });
const places = [place('a', 'Alpha'), place('b', 'Bravo'), place('c', 'Charlie')];
const day = { id: 'd1', label: 'Day 1', placeIds: ['a', 'b', 'c'], stopSchedules: { a: { startTime: '09:00' } } } as unknown as TripDay;
const leg = (from: Place, to: Place, minutes: number): ResolvedLeg => ({ from, to, legMode: 'default', mode: 'walk', minutes, inside: false });
const legs = [leg(places[0], places[1], 12), leg(places[1], places[2], 25)];
const stop = (name: string) => screen.getByText(name).closest('button')!;

function setup(selectedId: string | null, visited: string[], onSelect = vi.fn()) {
  render(
    <MantineProvider env="test">
      <I18nProvider>
        <MapStopTimeline day={day} places={places} legs={legs} selectedId={selectedId} visitedPlaceIds={visited} onSelect={onSelect} />
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

  it('marks selected and visited stops', () => {
    setup('b', ['c']);
    expect(stop('Bravo').className).toContain('map-stop-timeline__stop--selected');
    expect(stop('Charlie').className).toContain('map-stop-timeline__stop--visited');
    expect(stop('Alpha').className).not.toContain('--selected');
  });
});
