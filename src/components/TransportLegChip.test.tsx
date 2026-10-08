import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { TransportLegChip } from './TransportLegChip';

describe('TransportLegChip', () => {
  it('changes transport mode and resets to the day default', async () => {
    const onChange = vi.fn();
    render(
      <MantineProvider env="test">
        <I18nProvider>
          <TransportLegChip mode="walk" dayDefaultMode="public" isOverride onChange={onChange} />
        </I18nProvider>
      </MantineProvider>,
    );

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
    render(
      <MantineProvider env="test">
        <I18nProvider>
          <TransportLegChip mode="walk" dayDefaultMode="public" isOverride minutes={12} readOnly onChange={onChange} />
        </I18nProvider>
      </MantineProvider>,
    );

    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('· 12 min')).toBeDefined();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
