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
  IconDownload,
  IconFileSpreadsheet,
  IconFileText,
  IconJson,
  IconLogout,
  IconMap2,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconUsers,
} from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import { loadTripState } from '../lib/tripRepository';
import { exportTripExcel, exportTripMarkdown } from '../utils/exportTrip';
import { LanguageToggle, useI18n } from '../i18n';

interface AppHeaderProps {
  tripName: string;
  startDate: string;
  placeCount: number;
  dayCount: number;
  syncStatus: 'loading' | 'saving' | 'saved' | 'error';
  syncError: string | null;
  onSyncNow: () => Promise<void>;
  accountEmail?: string;
  onAddPlace: () => void;
  onOpenSettings: () => void;
  canShare: boolean;
  onOpenShare: () => void;
  onExport: () => void;
  onCopyPlainText: () => Promise<void>;
  onReset: () => void;
  onSignOut: () => void;
}

export function AppHeader({
  tripName,
  startDate,
  placeCount,
  dayCount,
  syncStatus,
  syncError,
  onSyncNow,
  accountEmail,
  onAddPlace,
  onOpenSettings,
  canShare,
  onOpenShare,
  onExport,
  onCopyPlainText,
  onReset,
  onSignOut,
}: AppHeaderProps) {
  const { accessToken, user, isDemo } = useAuth();
  const { t } = useI18n();
  const [exporting, setExporting] = useState<'excel' | 'markdown' | null>(null);
  const syncFailed = syncStatus === 'error';
  const cloudExportReady = !isDemo && syncStatus === 'saved' && !exporting;

  async function exportCloudTrip(format: 'excel' | 'markdown') {
    setExporting(format);
    try {
      const state = await loadTripState(accessToken, user.id);
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

  return (
    <Box component="header" className="app-header">
      <Group justify="space-between" h="100%" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Avatar color="teal" variant="light" radius="md">
            <IconMap2 size={24} />
          </Avatar>
          <Stack gap={0} className="app-header__title">
            <Text fw={850} size="lg" lh={1.15} lineClamp={1}>
              {tripName}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {t('startsSummary', { date: startDate, days: dayCount, places: placeCount })}
            </Text>
          </Stack>
        </Group>

        <Group gap="xs" wrap="nowrap">
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
          <Button
            color="teal"
            leftSection={<IconPlus size={17} />}
            onClick={onAddPlace}
            visibleFrom="sm"
          >
            {t('addPlace')}
          </Button>
          <Tooltip label={t('addPlace')}>
            <ActionIcon color="teal" size="lg" hiddenFrom="sm" onClick={onAddPlace} aria-label={t('addPlace')}>
              <IconPlus size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t('tripSettings')}>
            <ActionIcon variant="default" size="lg" onClick={onOpenSettings} aria-label={t('tripSettings')}>
              <IconSettings size={18} />
            </ActionIcon>
          </Tooltip>
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
          <LanguageToggle />
        </Group>
      </Group>
    </Box>
  );
}
