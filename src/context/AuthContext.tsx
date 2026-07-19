import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Center,
  Loader,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconCloud, IconInfoCircle, IconMail } from '@tabler/icons-react';
import { hasSupabaseConfig } from '../lib/supabaseConfig';
import { LanguageToggle, useI18n } from '../i18n';
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
  isDemo: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthGate.');
  return value;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

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
  }, [demoMode, session]);

  const contextValue = useMemo<AuthContextValue | null>(() => {
    if (demoMode) {
      return {
        user: { id: 'demo', email: 'Demo mode' },
        accessToken: '',
        isDemo: true,
        signOut: async () => {
          setDemoMode(false);
          setSent(false);
        },
      };
    }
    if (!session) return null;
    return {
      user: session.user,
      accessToken: session.accessToken,
      isDemo: false,
      signOut: async () => {
        await signOutSession(session.accessToken);
        setSession(null);
        setSent(false);
      },
    };
  }, [demoMode, session]);

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
          <Text size="sm" c="dimmed">{t('restoringTrip')}</Text>
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
            <Group justify="space-between" w="100%"><Title order={2}>{t('openTaiwanTrip')}</Title><LanguageToggle /></Group>
            <Text size="sm" c="dimmed">
              {t('signInHint')}
            </Text>
          </Stack>

          {!hasSupabaseConfig ? (
            <Alert color="red" icon={<IconInfoCircle size={18} />} title={t('supabaseMissing')}>
              {t('supabaseMissingHint')}
            </Alert>
          ) : null}

          {error ? (
            <Alert color="red" icon={<IconInfoCircle size={18} />} title={t('signInFailed')}>
              {error}
            </Alert>
          ) : null}

          {sent ? (
            <Alert color="teal" icon={<IconMail size={18} />} title={t('checkEmail')}>
              {t('checkEmailHint')}
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit}>
            <Stack>
              <TextInput
                label={t('emailAddress')}
                placeholder="you@example.com"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                leftSection={<IconMail size={17} />}
                autoComplete="email"
              />
              <Button type="submit" color="teal" loading={sending} disabled={!hasSupabaseConfig}>
                {t('emailSignIn')}
              </Button>
              <Button type="button" variant="light" color="teal" onClick={() => setDemoMode(true)}>
                {t('demoMode')}
              </Button>
              <Text size="xs" c="dimmed" ta="center">
                {t('demoHint')}
              </Text>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Center>
  );
}
