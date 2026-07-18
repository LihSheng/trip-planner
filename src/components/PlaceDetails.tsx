import { ActionIcon, Badge, Group, Paper, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { IconEdit, IconMapPin, IconNotes } from '@tabler/icons-react';
import type { Place } from '../types';

interface PlaceDetailsProps {
  place?: Place;
  onEdit: (place: Place) => void;
}

export function PlaceDetails({ place, onEdit }: PlaceDetailsProps) {
  if (!place) {
    return (
      <Paper withBorder radius="lg" p="md" className="place-details place-details--empty">
        <Text size="sm" c="dimmed">
          Select a map marker or place card to see its notes.
        </Text>
      </Paper>
    );
  }

  return (
    <Paper withBorder radius="lg" p="md" className="place-details">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group align="flex-start" wrap="nowrap">
          <ThemeIcon color="teal" variant="light" radius="xl">
            <IconMapPin size={18} />
          </ThemeIcon>
          <Stack gap={3}>
            <Text fw={750}>{place.name}</Text>
            <Group gap={6}>
              <Text size="sm" c="dimmed">
                {place.region}
              </Text>
              <Badge variant="light" color="teal" size="sm">
                {place.category}
              </Badge>
            </Group>
          </Stack>
        </Group>
        <Tooltip label="Edit place">
          <ActionIcon variant="subtle" color="gray" onClick={() => onEdit(place)}>
            <IconEdit size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Group mt="md" gap="xs" align="flex-start" wrap="nowrap">
        <IconNotes size={16} color="var(--mantine-color-dimmed)" style={{ marginTop: 2 }} />
        <Text size="sm" c={place.notes ? undefined : 'dimmed'}>
          {place.notes || 'No notes added yet.'}
        </Text>
      </Group>
    </Paper>
  );
}
