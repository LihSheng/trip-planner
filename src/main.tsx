import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createTheme, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './workspace-layout.css';
import App from './App';
import { AuthGate, ReadOnlyAuthProvider } from './context/AuthContext';
import { I18nProvider } from './i18n';

import { TripProvider } from './context/TripContext';

const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'md',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeight: '750',
  },
  colors: {
    teal: [
      '#edfcf8',
      '#d7f5ed',
      '#abe9da',
      '#7bddc6',
      '#54d2b5',
      '#3acbab',
      '#2bc8a6',
      '#1daf8f',
      '#119c7f',
      '#00876d',
    ],
  },
});

const shareToken = new URLSearchParams(window.location.search).get('share') ?? undefined;
const planId = shareToken ? undefined : new URLSearchParams(window.location.search).get('plan') ?? undefined;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" />
      <I18nProvider>
        {shareToken ? (
          <ReadOnlyAuthProvider><TripProvider shareToken={shareToken}><App /></TripProvider></ReadOnlyAuthProvider>
        ) : (
          <AuthGate><TripProvider requestedPlanId={planId}><App /></TripProvider></AuthGate>
        )}
      </I18nProvider>
    </MantineProvider>
  </StrictMode>,
);
