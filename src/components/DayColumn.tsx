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
  Select,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconCalendar, IconChevronDown, IconChevronUp, IconCircleCheckFilled, IconClock, IconTrash } from '@tabler/icons-react';
import type { Place, StopSchedule, TravelMode, TripDay } from '../types';
import { formatTripDate } from '../utils/date';
import { PlaceCard } from './PlaceCard';
import { useI18n } from '../i18n';
import { dayWarnings, estimateTravelMinutes, scheduleFor } from '../utils/schedule';

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
  onDayScheduleChange: (dayId: string, updates: { travelMode?: TravelMode; startTime?: string; lodgingPlaceId?: string; timeManagementEnabled?: boolean }) => void;
  onStopScheduleChange: (dayId: string, placeId: string, updates: StopSchedule) => void;
  hotelPlaces: Place[];
  tripHotelId?: string;
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
  onDayScheduleChange,
  onStopScheduleChange,
  hotelPlaces,
  tripHotelId,
}: DayColumnProps) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: `day:${day.id}`,
    data: { type: 'day', dayId: day.id },
  });
  const { onPointerDown, onKeyDown } = listeners ?? {};
  const visitedCount = places.filter((place) => visitedPlaceIds.includes(place.id)).length;
  const allPlacesVisited = places.length > 0 && visitedCount === places.length;
  const warningsByPlace = day.timeManagementEnabled ? dayWarnings(day, places) : new Map<string, string[]>();
  const warningCount = [...warningsByPlace.values()].reduce((total, warnings) => total + warnings.length, 0);

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
                {t('day', { number: index + 1 })}
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {formatTripDate(startDate, index)}
            </Text>
            {collapsed ? (
              <Badge size="sm" variant="light" color="teal" className="day-column__status">
                {t('stopsVisited', { stops: places.length, visited: visitedCount })}
              </Badge>
            ) : null}
          </Stack>
          <Group gap={2} wrap="nowrap">
            {allPlacesVisited ? (
              <Tooltip label={t('allStopsVisited')}>
                <ThemeIcon color="teal" variant="light" radius="xl" size="lg" className="day-column__completion" aria-label={t('allStopsVisited')}>
                  <IconCircleCheckFilled size={22} />
                </ThemeIcon>
              </Tooltip>
            ) : null}
            <Tooltip label={collapsed ? t('expandDay') : t('collapseDay')}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`${collapsed ? t('expandDay') : t('collapseDay')} ${index + 1}`}
                onClick={() => setCollapsed((value) => !value)}
              >
                {collapsed ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('removeDay')}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`${t('removeDay')} ${index + 1}`}
                onClick={() => onRemove(day.id)}
              >
                <IconTrash size={15} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={day.timeManagementEnabled ? 'Hide time management' : 'Manage times'}>
              <ActionIcon
                variant="subtle"
                color={day.timeManagementEnabled ? 'teal' : 'gray'}
                size="sm"
                aria-label={day.timeManagementEnabled ? 'Hide time management' : 'Manage times'}
                onClick={() => onDayScheduleChange(day.id, { timeManagementEnabled: !day.timeManagementEnabled })}
              >
                <IconClock size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        {!collapsed && day.timeManagementEnabled ? (
          <Stack gap="xs" mt="xs" onClick={(event) => event.stopPropagation()}>
            <Group gap="xs" grow>
              <Select
                size="xs"
                value={day.travelMode ?? 'public'}
                aria-label={`Travel mode for ${t('day', { number: index + 1 })}`}
                data={[
                  { value: 'public', label: 'Public transport' },
                  { value: 'walk', label: 'Walk' },
                  { value: 'bike', label: 'Bike' },
                  { value: 'car', label: 'Car' },
                ]}
                allowDeselect={false}
                onChange={(value) => onDayScheduleChange(day.id, { travelMode: (value ?? 'public') as TravelMode })}
              />
              <TextInput
                type="time"
                size="xs"
                value={day.startTime ?? '09:00'}
                aria-label={`Day start time for ${t('day', { number: index + 1 })}`}
                onChange={(event) => onDayScheduleChange(day.id, { startTime: event.currentTarget.value })}
              />
            </Group>
            {hotelPlaces.length ? (
              <Select
                size="xs"
                clearable
                label="Stay at"
                value={day.lodgingPlaceId || tripHotelId || null}
                data={hotelPlaces.map((place) => ({ value: place.id, label: place.name }))}
                onChange={(value) => onDayScheduleChange(day.id, { lodgingPlaceId: value ?? '' })}
              />
            ) : null}
          </Stack>
        ) : null}
        {day.timeManagementEnabled && warningCount ? (
          <Group gap={4} mt="xs">
            <IconAlertTriangle size={14} color="var(--mantine-color-orange-6)" />
            <Text size="xs" c="orange">{warningCount} schedule warning{warningCount === 1 ? '' : 's'}</Text>
          </Group>
        ) : null}
        {!collapsed ? (
          <TextInput
            mt="xs"
            value={day.label}
            onChange={(event) => onLabelChange(day.id, event.currentTarget.value)}
            size="xs"
            aria-label={t('dayTitle', { number: index + 1 })}
          />
        ) : null}
      </Box>

      {!collapsed ? (
        <SortableContext items={day.placeIds} strategy={verticalListSortingStrategy}>
          <Stack gap="xs" p="sm" className="day-column__body">
            {places.map((place, placeIndex) => (
              <PlaceCard
                key={place.id}
                place={place}
                selected={selectedId === place.id}
                visited={visitedPlaceIds.includes(place.id)}
                onSelect={onSelect}
                onEdit={onEditPlace}
                onDelete={onDeletePlace}
                onVisitedChange={onVisitedChange}
                schedule={day.timeManagementEnabled && day.stopSchedules?.[place.id] ? scheduleFor(day, place) : undefined}
                travelMinutes={day.timeManagementEnabled && day.stopSchedules?.[place.id] && placeIndex > 0 ? estimateTravelMinutes(places[placeIndex - 1], place, day.travelMode) : undefined}
                warnings={warningsByPlace.get(place.id)}
                onScheduleChange={day.timeManagementEnabled ? (updates) => onStopScheduleChange(day.id, place.id, updates) : undefined}
                onEnableSchedule={day.timeManagementEnabled ? () => onStopScheduleChange(day.id, place.id, { durationMinutes: scheduleFor(day, place).durationMinutes }) : undefined}
              />
            ))}
            {places.length === 0 && (
              <Box className="drop-placeholder">
                <Text size="xs" c="dimmed" ta="center">
                  {t('dropPlace')}
                </Text>
              </Box>
            )}
          </Stack>
        </SortableContext>
      ) : null}
    </Paper>
  );
}
