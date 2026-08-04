import { useState, type FormEvent } from 'react';
import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconCloudCheck,
  IconCloudOff,
  IconCopy,
  IconChevronDown,
  IconDotsVertical,
  IconFileSpreadsheet,
  IconFileText,
  IconJson,
  IconLogin,
  IconLogout,
  IconMail,
  IconMap2,
  IconPlus,
  IconRefresh,
  IconSparkles,
  IconSettings,
  IconUsers,
} from '@tabler/icons-react';
import { isPlaceholder } from '../domain/place';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import type { CurrentLocationState } from '../hooks/useCurrentLocation';
import { exportTripExcel, exportTripMarkdown } from '../utils/exportTrip';
import { useI18n } from '../i18n';

interface AppHeaderProps {
  onAddPlace: () => void;
  onOpenAiImport: () => void;
  onOpenSettings: () => void;
  onOpenShare: () => void;
  onExport: () => void;
  onCopyPlainText: () => Promise<void>;
  onReset: () => void;
  onSignOut: () => void;
  location: CurrentLocationState;
}

export function AppHeader({
  onAddPlace,
  onOpenAiImport,
  onOpenSettings,
  onOpenShare,
  onExport,
  onCopyPlainText,
  onReset,
  onSignOut,
  location,
}: AppHeaderProps) {
  const {
    state,
    planId: activePlanId,
    plans,
    syncStatus,
    syncError,
    isReadOnly: readOnly,
    isOwner,
    switchPlan: onSwitchPlan,
    createPlan: onCreatePlan,
    getSynchronizedState,
  } = useTrip();
  const { user, isDemo, isAuthenticated, requestMagicLink } = useAuth();
  const { t } = useI18n();
  const [exporting, setExporting] = useState<'excel' | 'markdown' | null>(null);
  const [signInOpened, setSignInOpened] = useState(false);
  const [signInEmail, setSignInEmail] = useState('');
  const [signInSending, setSignInSending] = useState(false);
  const [signInSent, setSignInSent] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const syncFailed = syncStatus === 'error';
  const cloudExportReady = !isDemo && Boolean(activePlanId) && syncStatus === 'saved' && !exporting;
  const accountEmail = user.email;
  const tripName = state.tripName;
  const startDate = state.startDate;
  const placeCount = state.places.filter((place) => !isPlaceholder(place)).length;
  const dayCount = state.days.length;
  const canShare = isOwner;
  const liveLocationActive = location.isTracking && location.permission !== 'unsupported';
  const isPhone = useMediaQuery('(max-width: 47.99em)');

  async function signInToEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = signInEmail.trim().toLowerCase();
    if (!email) return;
    setSignInSending(true);
    setSignInError(null);
    try {
      await requestMagicLink(email);
      setSignInSent(true);
    } catch (reason) {
      setSignInError(reason instanceof Error ? reason.message : 'Could not send the sign-in link.');
    } finally {
      setSignInSending(false);
    }
  }

  async function exportCloudTrip(format: 'excel' | 'markdown') {
    if (!activePlanId) return;
    setExporting(format);
    try {
      const state = getSynchronizedState();
      if (!state) throw new Error(t('noSynchronizedTrip'));
      if (format === 'excel') exportTripExcel(state);
      else exportTripMarkdown(state);
      notifications.show({
        color: 'teal',
        title: format === 'excel' ? t('excelExported') : t('markdownExported'),
        message: t('latestScheduleDownloaded'),
      });
    } catch (reason) {
      notifications.show({
        color: 'red',
        title: t('exportFailed'),
        message: reason instanceof Error ? reason.message : t('unableExport'),
      });
    } finally {
      setExporting(null);
    }
  }

  const ownedPlans = plans.filter((plan) => plan.isOwner);
  const sharedPlans = plans.filter((plan) => !plan.isOwner);

  return (
    <Box component="header" className="app-header">
      <Group justify="space-between" h="100%" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Avatar color="teal" variant="light" radius="md">
            <IconMap2 size={24} />
          </Avatar>
          <Menu position="bottom-start" withinPortal shadow="md" width={320} disabled={readOnly || isDemo}>
            <Menu.Target>
              <Button variant="subtle" color="gray" px="xs" rightSection={!readOnly && !isDemo ? <IconChevronDown size={16} /> : undefined} className="app-header__plan-button">
                <Stack gap={0} className="app-header__title">
                  <Text fw={850} size="lg" lh={1.15} lineClamp={1}>
                    {tripName}
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {t('startsSummary', { date: startDate, days: dayCount, places: placeCount })}
                  </Text>
                </Stack>
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>My plans</Menu.Label>
              {ownedPlans.map((plan) => (
                <Menu.Item key={plan.id} disabled={plan.id === activePlanId} onClick={() => void onSwitchPlan(plan.id)}>
                  <Text size="sm" fw={plan.id === activePlanId ? 750 : 600} lineClamp={1}>{plan.tripName}</Text>
                  <Text size="xs" c="dimmed" lineClamp={1}>Starts {plan.startDate}</Text>
                </Menu.Item>
              ))}
              {!ownedPlans.length ? <Menu.Item disabled>No owned plans</Menu.Item> : null}
              <Menu.Divider />
              <Menu.Item leftSection={<IconPlus size={16} />} onClick={() => void onCreatePlan()}>
                New blank plan
              </Menu.Item>
              {sharedPlans.length ? <>
                <Menu.Divider />
                <Menu.Label>Shared with me</Menu.Label>
                {sharedPlans.map((plan) => (
                  <Menu.Item key={plan.id} disabled={plan.id === activePlanId} onClick={() => void onSwitchPlan(plan.id)}>
                    <Text size="sm" fw={plan.id === activePlanId ? 750 : 600} lineClamp={1}>{plan.tripName}</Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>Starts {plan.startDate}</Text>
                  </Menu.Item>
                ))}
              </> : null}
            </Menu.Dropdown>
          </Menu>
        </Group>

        <Group gap="xs" wrap="nowrap">
          {liveLocationActive ? (
            <Tooltip label="Using your live location for navigation origins" withArrow>
              <span className="app-header__live-location" aria-label="Live location active">
                <span className="app-header__live-location-dot" />
              </span>
            </Tooltip>
          ) : null}
          <Tooltip label={syncError ?? t('syncDescription')}>
            <Badge
              variant="light"
              color={syncFailed ? 'red' : syncStatus === 'saved' ? 'teal' : 'gray'}
              leftSection={syncFailed ? <IconCloudOff size={13} /> : <IconCloudCheck size={13} />}
            >
              {t({ loading: 'loading', saving: 'saving', saved: 'saved', error: 'syncFailed' }[syncStatus] as 'loading' | 'saving' | 'saved' | 'syncFailed')}
            </Badge>
          </Tooltip>
          {!readOnly ? <Button
            color="teal"
            leftSection={<IconPlus size={17} />}
            onClick={onAddPlace}
            visibleFrom="sm"
          >
            {t('addPlace')}
          </Button> : null}
          {!readOnly ? <Tooltip label="Import a Google Maps link, itinerary, or travel notes with AI">
            <ActionIcon color="violet" variant="subtle" size="lg" visibleFrom="sm" onClick={onOpenAiImport} aria-label="Import with AI">
              <IconSparkles size={18} />
            </ActionIcon>
          </Tooltip> : null}
          {!readOnly ? <Tooltip label={t('addPlace')}>
            <ActionIcon color="teal" size="lg" hiddenFrom="sm" onClick={onAddPlace} aria-label={t('addPlace')}>
              <IconPlus size={18} />
            </ActionIcon>
          </Tooltip> : null}
          {!readOnly ? <Tooltip label={t('tripSettings')}>
            <ActionIcon variant="subtle" size="lg" visibleFrom="sm" onClick={onOpenSettings} aria-label={t('tripSettings')}>
              <IconSettings size={18} />
            </ActionIcon>
          </Tooltip> : null}
          {readOnly && !isAuthenticated ? <>
            <Button color="teal" leftSection={<IconLogin size={17} />} visibleFrom="sm" onClick={() => setSignInOpened(true)}>
              Sign in to edit
            </Button>
            <Tooltip label="Sign in to edit">
              <ActionIcon color="teal" size="lg" hiddenFrom="sm" onClick={() => setSignInOpened(true)} aria-label="Sign in to edit">
                <IconLogin size={18} />
              </ActionIcon>
            </Tooltip>
          </> : null}
          {readOnly ? <Badge color="gray" variant="light">Read-only</Badge> : null}
          {canShare ? <Tooltip label="Share trip"><ActionIcon variant="subtle" size="lg" visibleFrom="sm" onClick={onOpenShare} aria-label="Share trip"><IconUsers size={18} /></ActionIcon></Tooltip> : null}
          <Menu position="bottom-end" withinPortal shadow="md">
            <Menu.Target>
              <ActionIcon variant="subtle" size="lg" aria-label={t('moreActions')}>
                <IconDotsVertical size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {isPhone && !readOnly ? <>
                <Menu.Item leftSection={<IconSparkles size={16} />} onClick={onOpenAiImport}>Import with AI</Menu.Item>
                <Menu.Item leftSection={<IconSettings size={16} />} onClick={onOpenSettings}>{t('tripSettings')}</Menu.Item>
                {canShare ? <Menu.Item leftSection={<IconUsers size={16} />} onClick={onOpenShare}>Share trip</Menu.Item> : null}
                <Menu.Divider />
              </> : null}
              {accountEmail ? <Menu.Label>{accountEmail}</Menu.Label> : null}
              <Menu.Label>{isDemo ? t('localDemoData') : t('cloudStatus', { status: t({ loading: 'loading', saving: 'saving', saved: 'saved', error: 'syncFailed' }[syncStatus] as 'loading' | 'saving' | 'saved' | 'syncFailed') })}</Menu.Label>
              <Menu.Divider />
              <Menu.Label>{t('exportItinerary')}</Menu.Label>
              <Menu.Item leftSection={<IconCopy size={16} />} onClick={() => void onCopyPlainText()}>
                {t('copyItineraryText')}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconFileSpreadsheet size={16} />}
                disabled={!cloudExportReady}
                onClick={() => void exportCloudTrip('excel')}
              >
                {exporting === 'excel' ? t('preparingExcel') : t('excelWorkbook')}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconFileText size={16} />}
                disabled={!cloudExportReady}
                onClick={() => void exportCloudTrip('markdown')}
              >
                {exporting === 'markdown' ? t('preparingNote') : t('markdownNote')}
              </Menu.Item>
              <Menu.Item leftSection={<IconJson size={16} />} onClick={onExport}>
                {t('jsonBackup')}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconRefresh size={16} />} onClick={onReset}>
                {t('resetDemoData')}
              </Menu.Item>
              <Menu.Divider />
              {readOnly && !isAuthenticated ? (
                <Menu.Item leftSection={<IconLogin size={16} />} onClick={() => setSignInOpened(true)}>Sign in to edit</Menu.Item>
              ) : (
                <Menu.Item leftSection={<IconLogout size={16} />} onClick={onSignOut}>
                  {isDemo ? t('signInToSync') : t('signOut')}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      <Modal opened={signInOpened} onClose={() => setSignInOpened(false)} title="Sign in to edit this trip" centered>
        <form onSubmit={(event) => void signInToEdit(event)}>
          <Stack>
            <Text size="sm" c="dimmed">Use the email address the trip owner invited. Other accounts will open their own plans.</Text>
            {signInError ? <Alert color="red">{signInError}</Alert> : null}
            {signInSent ? <Alert color="teal" icon={<IconMail size={17} />}>Check your email, then open the sign-in link on this device.</Alert> : null}
            <TextInput
              label="Email address"
              placeholder="you@example.com"
              type="email"
              required
              value={signInEmail}
              onChange={(event) => setSignInEmail(event.currentTarget.value)}
              leftSection={<IconMail size={17} />}
              autoComplete="email"
            />
            <Button type="submit" color="teal" loading={signInSending}>Email me a sign-in link</Button>
          </Stack>
        </form>
      </Modal>
    </Box>
  );
}
