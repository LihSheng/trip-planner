import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Center, createTheme, Loader, MantineProvider, Stack, Text } from '@mantine/core';
import { notifications, Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './workspace-layout.css';
import App from './App';
import { AuthGate, useAuth } from './context/AuthContext';
import { I18nProvider } from './i18n';
import { acceptTripInvitations, loadEditableTripPlanIdByShareToken } from './lib/tripRepository';

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

function SharedTripRoute({ token }: { token: string }) {
  const { accessToken, isAuthenticated } = useAuth();
  const [destination, setDestination] = useState('shared');
  const [checkingAccess, setCheckingAccess] = useState(isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    let active = true;
    setCheckingAccess(true);
    void acceptTripInvitations(accessToken)
      .then(() => loadEditableTripPlanIdByShareToken(accessToken, token))
      .then((editablePlanId) => {
        if (!active) return;
        const url = new URL(window.location.href);
        url.searchParams.delete('share');
        if (editablePlanId) {
          url.searchParams.set('plan', editablePlanId);
          setDestination(editablePlanId);
        } else {
          url.searchParams.delete('plan');
          setDestination('personal');
          notifications.show({
            color: 'orange',
            title: 'Read-only access',
            message: 'This account was not invited to edit. Your own plans are open instead.',
          });
        }
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setDestination('shared');
        notifications.show({
          color: 'red',
          title: 'Could not verify edit access',
          message: reason instanceof Error ? reason.message : 'Please try signing in again.',
        });
      })
      .finally(() => {
        if (active) setCheckingAccess(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, isAuthenticated, token]);

  if (checkingAccess) {
    return <Center mih="100vh"><Stack align="center" gap="sm"><Loader color="teal" /><Text size="sm" c="dimmed">Checking edit access…</Text></Stack></Center>;
  }
  if (destination === 'shared') return <TripProvider shareToken={token}><App /></TripProvider>;
  return <TripProvider requestedPlanId={destination === 'personal' ? undefined : destination}><App /></TripProvider>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" />
      <I18nProvider>
        {shareToken ? (
          <AuthGate allowGuest><SharedTripRoute token={shareToken} /></AuthGate>
        ) : (
          <AuthGate><TripProvider requestedPlanId={planId}><App /></TripProvider></AuthGate>
        )}
      </I18nProvider>
    </MantineProvider>
  </StrictMode>,
);
