import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TripProvider } from './context/TripContext';
import { I18nProvider } from './i18n';

vi.mock('./context/AuthContext', () => ({
  useAuth: () => ({
    accessToken: '',
    user: { id: 'demo', email: 'Demo mode' },
    isDemo: true,
    isAuthenticated: false,
    signOut: vi.fn(),
  }),
}));
vi.mock('./components/TaiwanMap', () => ({ TaiwanMap: () => null }));

import App from './App';

function renderApp() {
  return render(
    <MantineProvider>
      <I18nProvider>
        <TripProvider>
          <App />
        </TripProvider>
      </I18nProvider>
    </MantineProvider>,
  );
}

describe('App workspace navigation', () => {
  it('renders five labelled tabs in the mobile bottom nav', () => {
    renderApp();
    const nav = screen.getByRole('navigation', { name: 'Trip planner navigation' });
    for (const label of ['Today', 'Map', 'Places', 'Planner', 'Expenses']) {
      expect(within(nav).getByRole('button', { name: label }).textContent).toBe(label);
      expect(within(nav).getByText(label).hidden).toBe(false);
    }
    expect(within(nav).getAllByRole('button')).toHaveLength(5);
  });

  it('marks the selected view as current', () => {
    renderApp();
    const nav = screen.getByRole('navigation', { name: 'Trip planner navigation' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Planner' }));
    expect(within(nav).getByRole('button', { name: 'Planner' }).getAttribute('aria-current')).toBe('page');
  });
});
