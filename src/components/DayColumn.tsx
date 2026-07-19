import { useState, type KeyboardEventHandler, type MouseEvent, type PointerEvent } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconCalendar, IconChevronDown, IconChevronUp, IconTrash } from '@tabler/icons-react';
import type { Place, TripDay } from '../types';
import { formatTripDate } from '../utils/date';
import { PlaceCard } from './PlaceCard';

interface DayColumnProps {
  day: TripDay;
  index: number;
  startDate: string;
  places: Place[];
  selectedId: string | null;
  visitedPlaceIds: string[];
  onSelect: (placeId: string) => void;
  onLabelChange: (dayId: string, label: string) => void;
  onRemove: (dayId: string) => void;
  onEditPlace: (place: Place) => void;
  onDeletePlace: (place: Place) => void;
  onVisitedChange: (placeId: string) => void;
}

export function DayColumn({
  day,
  index,
  startDate,
  places,
  selectedId,
  visitedPlaceIds,
  onSelect,
  onLabelChange,
  onRemove,
  onEditPlace,
  onDeletePlace,
  onVisitedChange,
}: DayColumnProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: `day:${day.id}`,
    data: { type: 'day', dayId: day.id },
  });
  const { onPointerDown, onKeyDown } = listeners ?? {};
  const visitedCount = places.filter((place) => visitedPlaceIds.includes(place.id)).length;

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('button, input, .place-card')) {
      return;
    }

    onPointerDown?.(event);
  }

  function toggleCollapsedFromHeader(event: MouseEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('button, input')) return;
    setCollapsed((value) => !value);
  }

  return (
    <Paper
      ref={setNodeRef}
      withBorder
      radius="lg"
      className="day-column day-column--draggable"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      onPointerDown={handlePointerDown}
      onKeyDown={onKeyDown as KeyboardEventHandler<HTMLDivElement> | undefined}
      data-over={isOver || undefined}
      data-dragging={isDragging || undefined}
    >
      <Box
        className={`day-column__header day-column__header--${index % 5}`}
        onClick={toggleCollapsedFromHeader}
      >
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
          <Group gap={2} wrap="nowrap">
            {collapsed ? <Badge size="sm" variant="light" color="teal">{places.length} stops · {visitedCount} visited</Badge> : null}
            <Tooltip label={collapsed ? 'Expand day' : 'Collapse day'}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`${collapsed ? 'Expand' : 'Collapse'} day ${index + 1}`}
                onClick={() => setCollapsed((value) => !value)}
              >
                {collapsed ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
              </ActionIcon>
            </Tooltip>
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
        </Group>
        {!collapsed ? (
          <TextInput
            mt="xs"
            value={day.label}
            onChange={(event) => onLabelChange(day.id, event.currentTarget.value)}
            size="xs"
            aria-label={`Day ${index + 1} title`}
          />
        ) : null}
      </Box>

      {!collapsed ? (
        <SortableContext items={day.placeIds} strategy={verticalListSortingStrategy}>
          <Stack gap="xs" p="sm" className="day-column__body">
            {places.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                selected={selectedId === place.id}
                visited={visitedPlaceIds.includes(place.id)}
                onSelect={onSelect}
                onEdit={onEditPlace}
                onDelete={onDeletePlace}
                onVisitedChange={onVisitedChange}
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
      ) : null}
    </Paper>
  );
}
