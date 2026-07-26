import { Drawer, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCalendar, IconEdit, IconMapPin, IconTrash } from '@tabler/icons-react';
import type { TripActivityEvent } from '../types';

const labels: Record<TripActivityEvent['type'], string> = {
  place_added: 'added',
  place_updated: 'updated',
  place_removed: 'removed',
  place_moved: 'moved',
  day_added: 'added',
  day_updated: 'updated',
  day_removed: 'removed',
};

function eventIcon(type: TripActivityEvent['type']) {
  if (type.includes('removed')) return <IconTrash size={16} />;
  if (type.includes('day')) return <IconCalendar size={16} />;
  if (type.includes('updated')) return <IconEdit size={16} />;
  return <IconMapPin size={16} />;
}

function shortAuthor(email: string) {
  const [local] = email.split('@');
  return local || email;
}

export function TripActivityDrawer({ opened, onClose, events }: { opened: boolean; onClose: () => void; events: TripActivityEvent[] }) {
  return <Drawer opened={opened} onClose={onClose} title="Activity" position="right" size="md">
    <Stack gap="sm">
      {events.length ? events.map((event) => <Group key={event.id} align="flex-start" wrap="nowrap">
        <ThemeIcon variant="light" color={event.type.includes('removed') ? 'red' : 'teal'} radius="xl" mt={2}>{eventIcon(event.type)}</ThemeIcon>
        <Stack gap={1} style={{ flex: 1 }}>
          <Text size="sm"><Text component="span" fw={700}>{shortAuthor(event.actorEmail)}</Text> {labels[event.type]} <Text component="span" fw={650}>{event.targetName}</Text>.</Text>
          {event.detail ? <Text size="xs" c="dimmed">{event.detail}</Text> : null}
          <Text size="xs" c="dimmed">{new Date(event.createdAt).toLocaleString()}</Text>
        </Stack>
      </Group>) : <Text size="sm" c="dimmed">No activity in the last 90 days.</Text>}
    </Stack>
  </Drawer>;
}
