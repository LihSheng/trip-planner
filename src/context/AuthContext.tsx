import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Center,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconCloud, IconInfoCircle, IconMail } from '@tabler/icons-react';
import { hasSupabaseConfig } from '../lib/supabaseConfig';
import {
  refreshAuthSession,
  restoreSession,
  sendMagicLink,
  signOutSession,
  type AuthSession,
  type AuthUser,
} from '../lib/supabaseAuth';

interface AuthContextValue {
  user: AuthUser;
  accessToken: string;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthGate.');
  return value;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    restoreSession()
      .then((restored) => {
        if (active) setSession(restored);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to restore your session.');
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    const refreshInMs = Math.max(session.expiresAt * 1000 - Date.now() - 60_000, 1_000);
    const timeout = window.setTimeout(() => {
      refreshAuthSession(session.refreshToken)
        .then(setSession)
        .catch(() => {
          void signOutSession(session.accessToken);
          setSession(null);
          setError('Your session expired. Request a new sign-in link to continue.');
        });
    }, refreshInMs);

    return () => window.clearTimeout(timeout);
  }, [session]);

  const contextValue = useMemo<AuthContextValue | null>(() => {
    if (!session) return null;
    return {
      user: session.user,
      accessToken: session.accessToken,
      signOut: async () => {
        await signOutSession(session.accessToken);
        setSession(null);
        setSent(false);
      },
    };
  }, [session]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setSending(true);
    setError(null);
    try {
      await sendMagicLink(normalizedEmail);
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to send the sign-in link.');
    } finally {
      setSending(false);
    }
  }

  if (checking) {
    return (
      <Center mih="100vh">
        <Stack align="center" gap="sm">
          <Loader color="teal" />
          <Text size="sm" c="dimmed">Restoring your trip…</Text>
        </Stack>
      </Center>
    );
  }

  if (contextValue) {
    return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
  }

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder radius="xl" shadow="sm" p={{ base: 'lg', sm: 'xl' }} maw={440} w="100%">
        <Stack gap="lg">
          <Stack align="center" gap="xs" ta="center">
            <ThemeIcon size={54} radius="xl" color="teal" variant="light">
              <IconCloud size={28} />
            </ThemeIcon>
            <Title order={2}>Open your Taiwan trip</Title>
            <Text size="sm" c="dimmed">
              Sign in with the same email on your laptop and mobile to keep the itinerary synchronized.
            </Text>
          </Stack>

          {!hasSupabaseConfig ? (
            <Alert color="red" icon={<IconInfoCircle size={18} />} title="Supabase is not configured">
              Add the Vite Supabase environment variables before deploying the application.
            </Alert>
          ) : null}

          {error ? (
            <Alert color="red" icon={<IconInfoCircle size={18} />} title="Sign-in failed">
              {error}
            </Alert>
          ) : null}

          {sent ? (
            <Alert color="teal" icon={<IconMail size={18} />} title="Check your email">
              Open the sign-in link on this device. You can close this message after the planner opens.
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit}>
            <Stack>
              <TextInput
                label="Email address"
                placeholder="you@example.com"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                leftSection={<IconMail size={17} />}
                autoComplete="email"
              />
              <Button type="submit" color="teal" loading={sending} disabled={!hasSupabaseConfig}>
                Email me a sign-in link
              </Button>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Center>
  );
}
