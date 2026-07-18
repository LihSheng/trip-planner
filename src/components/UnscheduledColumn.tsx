import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Badge, Box, Group, Paper, Stack, Text } from '@mantine/core';
import { IconInbox } from '@tabler/icons-react';
import type { Place } from '../types';
import { PlaceCard } from './PlaceCard';

interface UnscheduledColumnProps {
  places: Place[];
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onEditPlace: (place: Place) => void;
  onDeletePlace: (place: Place) => void;
}

export function UnscheduledColumn({
  places,
  selectedId,
  onSelect,
  onEditPlace,
  onDeletePlace,
}: UnscheduledColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled' });

  return (
    <Paper
      ref={setNodeRef}
      withBorder
      radius="lg"
      className="day-column day-column--unscheduled"
      data-over={isOver || undefined}
    >
      <Box className="day-column__header day-column__header--unscheduled">
        <Group justify="space-between">
          <Group gap="xs">
            <IconInbox size={17} />
            <Text fw={750} size="sm">
              Unscheduled
            </Text>
          </Group>
          <Badge variant="light" color="gray">
            {places.length}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed" mt={4}>
          Ideas ready to be placed into a day
        </Text>
      </Box>

      <SortableContext items={places.map((place) => place.id)} strategy={verticalListSortingStrategy}>
        <Stack gap="xs" p="sm" className="day-column__body">
          {places.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              selected={selectedId === place.id}
              onSelect={onSelect}
              onEdit={onEditPlace}
              onDelete={onDeletePlace}
            />
          ))}
          {places.length === 0 && (
            <Box className="drop-placeholder">
              <Text size="xs" c="dimmed" ta="center">
                Drop places here to plan them later
              </Text>
            </Box>
          )}
        </Stack>
      </SortableContext>
    </Paper>
  );
}
