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
import {
  IconCloudCheck,
  IconCloudOff,
  IconDownload,
  IconLogout,
  IconMap2,
  IconPlus,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-react';

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
  const syncFailed = syncStatus === 'error';

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
              <Menu.Label>Cloud status: {syncLabels[syncStatus]}</Menu.Label>
              <Menu.Divider />
              <Menu.Item leftSection={<IconDownload size={16} />} onClick={onExport}>
                Export trip JSON
              </Menu.Item>
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
