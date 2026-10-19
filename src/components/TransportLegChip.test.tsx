import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { Place, TripDay } from '../types';
import { resolveLeg } from '../utils/routing';
import { LegMinutesButton, TransportLegChip } from './TransportLegChip';

const stop = (id: string, latitude: number): Place => ({ id, name: id, region: 'Taipei', category: 'Landmark', latitude, longitude: 121.5, notes: '' });
const from = stop('from', 25.0);
const to = stop('to', 25.005);
const day = (extra: Partial<TripDay> = {}): TripDay => ({ id: 'day-1', label: '', placeIds: ['from', 'to'], travelMode: 'public', ...extra });

const wrap = (children: ReactNode) => render(<MantineProvider env="test"><I18nProvider>{children}</I18nProvider></MantineProvider>);

describe('TransportLegChip', () => {
  it('changes transport mode and resets to the day default', async () => {
    const onChange = vi.fn();
    const leg = resolveLeg(day({ legModeOverrides: { 'from:to': 'walk' } }), [], from, to);
    wrap(<TransportLegChip leg={leg} dayDefaultMode="public" onChange={onChange} />);

    const chip = screen.getByRole('button');
    fireEvent.click(chip);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Driving' }));
    expect(onChange).toHaveBeenCalledWith('car');

    fireEvent.click(chip);
    fireEvent.click(await screen.findByRole('menuitem', { name: /Use day default/ }));
    expect(onChange).toHaveBeenLastCalledWith('default');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('disables editing for read-only trips while displaying travel time', () => {
    const onChange = vi.fn();
    const leg = resolveLeg(day({ legModeOverrides: { 'from:to': 'walk' } }), [], from, to);
    wrap(<TransportLegChip leg={leg} dayDefaultMode="public" readOnly onChange={onChange} />);

    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('· 9 min')).toBeDefined();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers transit from the menu and from the minutes', async () => {
    const onOpenTransit = vi.fn();
    const leg = resolveLeg(day(), [], from, to);
    wrap(<TransportLegChip leg={leg} dayDefaultMode="public" onChange={vi.fn()} onOpenTransit={onOpenTransit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Transport mode' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Transit options' }));
    fireEvent.click(screen.getByRole('button', { name: '5 min, show transit options' }));
    expect(onOpenTransit).toHaveBeenCalledTimes(2);
  });

  it('keeps the minutes tappable on a read-only trip', () => {
    const onOpenTransit = vi.fn();
    const leg = resolveLeg(day(), [], from, to);
    wrap(<TransportLegChip leg={leg} dayDefaultMode="public" readOnly onChange={vi.fn()} onOpenTransit={onOpenTransit} />);

    expect(screen.getByRole('button', { name: 'Transport mode' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '5 min, show transit options' }));
    expect(onOpenTransit).toHaveBeenCalledTimes(1);
  });
});

describe('LegMinutesButton', () => {
  it('names a chosen route and a stale one', () => {
    const transitByLeg = {
      'from:to': {
        provider: 'transitous' as const,
        fetchedAt: '2026-10-19T02:00:00.000Z',
        basis: { from: { lat: 25.0, lng: 121.5 }, to: { lat: 25.01, lng: 121.5 }, departAt: '2026-10-21T10:00:00+08:00' },
        options: [{ signature: 'bus:307', minutes: 17, steps: [{ kind: 'bus' as const, minutes: 17, line: '307' }] }],
        chosen: 'bus:307',
      },
    };
    const leg = resolveLeg(day({ transitByLeg }), [], from, to);
    wrap(<LegMinutesButton leg={leg} onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: '17 min, show transit options, chosen route, needs refresh' })).toBeDefined();
  });
});
