import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { Place, TripDay } from '../types';
import { projectDay, timingLabel } from '../utils/dayProjection';
import { legOnwardFrom } from '../utils/routing';
import { MapPlaceCard } from './MapPlaceCard';

const place = (id: string, name: string, latitude: number, longitude: number, extra: Partial<Place> = {}): Place => ({
  id, name, region: 'New Taipei', category: 'Landmark', latitude, longitude, notes: '', ...extra,
});
const shifen = place('shifen', 'Shifen', 25.0477, 121.7756);
const lunch = place('lunch', 'meal', 0, 0, { region: '', placeholderKind: 'meal' });
const jiufen = place('jiufen', 'Jiufen', 25.1092, 121.8452);
const day: TripDay = { id: 'd1', label: '', placeIds: ['shifen', 'lunch', 'jiufen'], travelMode: 'public' };

describe('MapPlaceCard', () => {
  it('names the next real stop and the bridged minutes, not the placeholder, with the projected time', () => {
    // As TaiwanMap wires it: the card reads the same projection as the strip and the planner.
    const { stops, legs } = projectDay(day, [shifen, lunch, jiufen], []);
    render(
      <MantineProvider env="test">
        <I18nProvider>
          <MapPlaceCard
            place={shifen} stopNumber={1} isUnscheduled={false} visited={false} currentLocation={null} readOnly
            timeLabel={timingLabel(stops[0].timing)} nextLeg={legOnwardFrom(legs, 0)}
            onClose={vi.fn()} onEditPlace={vi.fn()}
          />
        </I18nProvider>
      </MantineProvider>,
    );

    expect(screen.getByText('~09:00–10:30')).toBeDefined();
    expect(screen.getByText(`Next: Jiufen · ${legs[1].minutes} min`)).toBeDefined();
    expect(screen.queryByText(/Next: meal/)).toBeNull();
  });
});
