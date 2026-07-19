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
  IconDownload,
  IconFileSpreadsheet,
  IconFileText,
  IconJson,
  IconLogout,
  IconMap2,
  IconPlus,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import { loadTripState } from '../lib/tripRepository';
import { exportTripExcel, exportTripMarkdown } from '../utils/exportTrip';

interface AppHeaderProps {
  tripName: string;
  startDate: string;
  placeCount: number;
  dayCount: number;
  syncStatus: 'loading' | 'saving' | 'saved' | 'error';
  syncError: string | null;
  accountEmail?: string;
  onAddPlace: () => void;
  onOpenSettings: () => void;
  onExport: () => void;
  onReset: () => void;
  onSignOut: () => void;
}

const syncLabels = {
  loading: 'Loading',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Sync failed',
} as const;

export function AppHeader({
  tripName,
  startDate,
  placeCount,
  dayCount,
  syncStatus,
  syncError,
  accountEmail,
  onAddPlace,
  onOpenSettings,
  onExport,
  onReset,
  onSignOut,
}: AppHeaderProps) {
  const { accessToken, user, isDemo } = useAuth();
  const [exporting, setExporting] = useState<'excel' | 'markdown' | null>(null);
  const syncFailed = syncStatus === 'error';
  const cloudExportReady = !isDemo && syncStatus === 'saved' && !exporting;

  async function exportCloudTrip(format: 'excel' | 'markdown') {
    setExporting(format);
    try {
      const state = await loadTripState(accessToken, user.id);
      if (!state) throw new Error('No synchronized trip was found.');
      if (format === 'excel') exportTripExcel(state);
      else exportTripMarkdown(state);
      notifications.show({
        color: 'teal',
        title: format === 'excel' ? 'Excel itinerary exported' : 'Markdown note exported',
        message: 'The latest synchronized schedule was downloaded.',
      });
    } catch (reason) {
      notifications.show({
        color: 'red',
        title: 'Export failed',
        message: reason instanceof Error ? reason.message : 'Unable to export the itinerary.',
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
              Starts {startDate} · {dayCount} days · {placeCount} places
            </Text>
          </Stack>
        </Group>

        <Group gap="xs" wrap="nowrap">
          <Tooltip label={syncError ?? 'Your itinerary is synchronized with Supabase.'}>
            <Badge
              visibleFrom="sm"
              variant="light"
              color={syncFailed ? 'red' : syncStatus === 'saved' ? 'teal' : 'gray'}
              leftSection={syncFailed ? <IconCloudOff size={13} /> : <IconCloudCheck size={13} />}
            >
              {syncLabels[syncStatus]}
            </Badge>
          </Tooltip>
          <Button
            color="teal"
            leftSection={<IconPlus size={17} />}
            onClick={onAddPlace}
            visibleFrom="sm"
          >
            Add place
          </Button>
          <Tooltip label="Add place">
            <ActionIcon color="teal" size="lg" hiddenFrom="sm" onClick={onAddPlace} aria-label="Add place">
              <IconPlus size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Trip settings">
            <ActionIcon variant="default" size="lg" onClick={onOpenSettings} aria-label="Trip settings">
              <IconSettings size={18} />
            </ActionIcon>
          </Tooltip>
          <Menu position="bottom-end" withinPortal shadow="md">
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label="More trip actions">
                <IconDownload size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {accountEmail ? <Menu.Label>{accountEmail}</Menu.Label> : null}
              <Menu.Label>{isDemo ? 'Local demo data' : `Cloud status: ${syncLabels[syncStatus]}`}</Menu.Label>
              <Menu.Divider />
              <Menu.Label>Export itinerary</Menu.Label>
              <Menu.Item
                leftSection={<IconFileSpreadsheet size={16} />}
                disabled={!cloudExportReady}
                onClick={() => void exportCloudTrip('excel')}
              >
                {exporting === 'excel' ? 'Preparing Excel…' : 'Excel workbook (.xls)'}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconFileText size={16} />}
                disabled={!cloudExportReady}
                onClick={() => void exportCloudTrip('markdown')}
              >
                {exporting === 'markdown' ? 'Preparing note…' : 'Markdown note (.md)'}
              </Menu.Item>
              <Menu.Item leftSection={<IconJson size={16} />} onClick={onExport}>
                JSON backup (.json)
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconRefresh size={16} />} onClick={onReset}>
                Reset demo data
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item leftSection={<IconLogout size={16} />} onClick={onSignOut}>
                Sign out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </Box>
  );
}
