import { useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCloudCheck,
  IconCloudOff,
  IconCloudUpload,
  IconCopy,
  IconChevronDown,
  IconDownload,
  IconFileSpreadsheet,
  IconFileText,
  IconJson,
  IconLogout,
  IconMap2,
  IconPlus,
  IconRefresh,
  IconSparkles,
  IconSettings,
  IconUsers,
} from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import type { CurrentLocationState } from '../hooks/useCurrentLocation';
import { loadTripState } from '../lib/tripRepository';
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
    syncNow: onSyncNow,
    isReadOnly: readOnly,
    isOwner,
    switchPlan: onSwitchPlan,
    createPlan: onCreatePlan,
  } = useTrip();
  const { accessToken, user, isDemo } = useAuth();
  const { t } = useI18n();
  const [exporting, setExporting] = useState<'excel' | 'markdown' | null>(null);
  const syncFailed = syncStatus === 'error';
  const cloudExportReady = !isDemo && Boolean(activePlanId) && syncStatus === 'saved' && !exporting;
  const accountEmail = user.email;
  const tripName = state.tripName;
  const startDate = state.startDate;
  const placeCount = state.places.filter((place) => place.type !== 'placeholder').length;
  const dayCount = state.days.length;
  const canShare = isOwner;
  const liveLocationActive = location.isTracking && location.permission !== 'unsupported';

  async function exportCloudTrip(format: 'excel' | 'markdown') {
    if (!activePlanId) return;
    setExporting(format);
    try {
      const state = await loadTripState(accessToken, activePlanId);
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
              visibleFrom="lg"
              variant="light"
              color={syncFailed ? 'red' : syncStatus === 'saved' ? 'teal' : 'gray'}
              leftSection={syncFailed ? <IconCloudOff size={13} /> : <IconCloudCheck size={13} />}
            >
              {t({ loading: 'loading', saving: 'saving', saved: 'saved', error: 'syncFailed' }[syncStatus] as 'loading' | 'saving' | 'saved' | 'syncFailed')}
            </Badge>
          </Tooltip>
          <Tooltip label={isDemo ? t('demoHint') : syncError ?? t('cloudStatus', { status: t({ loading: 'loading', saving: 'saving', saved: 'saved', error: 'syncFailed' }[syncStatus] as 'loading' | 'saving' | 'saved' | 'syncFailed') })}>
            <ActionIcon
              hiddenFrom="lg"
              variant="light"
              color={syncFailed ? 'red' : syncStatus === 'saved' ? 'teal' : 'yellow'}
              size="lg"
              loading={syncStatus === 'saving'}
              disabled={isDemo || syncStatus === 'saving'}
              onClick={() => void onSyncNow()}
              aria-label={t('cloudStatus', { status: t({ loading: 'loading', saving: 'saving', saved: 'saved', error: 'syncFailed' }[syncStatus] as 'loading' | 'saving' | 'saved' | 'syncFailed') })}
            >
              {syncFailed ? <IconCloudOff size={18} /> : syncStatus === 'saved' ? <IconCloudCheck size={18} /> : <IconCloudUpload size={18} />}
            </ActionIcon>
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
            <ActionIcon color="violet" variant="light" size="lg" onClick={onOpenAiImport} aria-label="Import with AI">
              <IconSparkles size={18} />
            </ActionIcon>
          </Tooltip> : null}
          {!readOnly ? <Tooltip label={t('addPlace')}>
            <ActionIcon color="teal" size="lg" hiddenFrom="sm" onClick={onAddPlace} aria-label={t('addPlace')}>
              <IconPlus size={18} />
            </ActionIcon>
          </Tooltip> : null}
          {!readOnly ? <Tooltip label={t('tripSettings')}>
            <ActionIcon variant="default" size="lg" onClick={onOpenSettings} aria-label={t('tripSettings')}>
              <IconSettings size={18} />
            </ActionIcon>
          </Tooltip> : null}
          {readOnly ? <Badge color="gray" variant="light">Read-only</Badge> : null}
          {canShare ? <Tooltip label="Share trip"><ActionIcon variant="default" size="lg" onClick={onOpenShare} aria-label="Share trip"><IconUsers size={18} /></ActionIcon></Tooltip> : null}
          <Menu position="bottom-end" withinPortal shadow="md">
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label={t('moreActions')}>
                <IconDownload size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
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
              <Menu.Item leftSection={<IconLogout size={16} />} onClick={onSignOut}>
                {isDemo ? t('signInToSync') : t('signOut')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </Box>
  );
}
