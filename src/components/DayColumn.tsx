import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  ActionIcon,
  Box,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconCalendar, IconTrash } from '@tabler/icons-react';
import type { Place, TripDay } from '../types';
import { formatTripDate } from '../utils/date';
import { PlaceCard } from './PlaceCard';

interface DayColumnProps {
  day: TripDay;
  index: number;
  startDate: string;
  places: Place[];
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onLabelChange: (dayId: string, label: string) => void;
  onRemove: (dayId: string) => void;
  onEditPlace: (place: Place) => void;
  onDeletePlace: (place: Place) => void;
}

export function DayColumn({
  day,
  index,
  startDate,
  places,
  selectedId,
  onSelect,
  onLabelChange,
  onRemove,
  onEditPlace,
  onDeletePlace,
}: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: day.id });

  return (
    <Paper
      ref={setNodeRef}
      withBorder
      radius="lg"
      className="day-column"
      data-over={isOver || undefined}
    >
      <Box className={`day-column__header day-column__header--${index % 5}`}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={3} style={{ flex: 1 }}>
            <Group gap={6}>
              <IconCalendar size={15} />
              <Text fw={750} size="sm">
                Day {index + 1}
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {formatTripDate(startDate, index)}
            </Text>
          </Stack>
          <Tooltip label="Remove day">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={`Remove day ${index + 1}`}
              onClick={() => onRemove(day.id)}
            >
              <IconTrash size={15} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <TextInput
          mt="xs"
          value={day.label}
          onChange={(event) => onLabelChange(day.id, event.currentTarget.value)}
          size="xs"
          aria-label={`Day ${index + 1} title`}
        />
      </Box>

      <SortableContext items={day.placeIds} strategy={verticalListSortingStrategy}>
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
                Drop a place here
              </Text>
            </Box>
          )}
        </Stack>
      </SortableContext>
    </Paper>
  );
}
