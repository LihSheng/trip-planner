import { useEffect, useState, type KeyboardEventHandler, type MouseEvent, type PointerEvent } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ActionIcon,
  Badge,
  Button,
  Box,
  Group,
  Menu,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Select,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAlertTriangle, IconBike, IconBus, IconCalendar, IconCar, IconChevronDown, IconChevronUp, IconCircleCheckFilled, IconClock, IconCoffee, IconDots, IconPlus, IconRoute, IconSun, IconToolsKitchen, IconTrash, IconWalk } from '@tabler/icons-react';
import type { PlaceholderKind, Place, StopSchedule, TravelMode, TripDay } from '../types';
import { formatTripDate } from '../utils/date';
import { PlaceCard } from './PlaceCard';
import { useI18n } from '../i18n';
import { dayWarnings, estimateTravelMinutes, scheduleFor } from '../utils/schedule';
import { routeLegKey } from '../utils/routing';

interface DayColumnProps {
  day: TripDay;
  index: number;
  startDate: string;
  places: Place[];
  selectedId: string | null;
  visitedPlaceIds: string[];
  onSelect: (placeId: string) => void;
  onAddPlace: () => void;
  onAddPlaceholder: (kind: PlaceholderKind) => void;
  onReplacePlaceholder: (placeholderId: string) => void;
  onRenamePlaceholder: (place: Place, label: string) => void;
  onLabelChange: (dayId: string, label: string) => void;
  onRemove: (dayId: string) => void;
  onEditPlace: (place: Place) => void;
  onDeletePlace: (place: Place) => void;
  onVisitedChange: (placeId: string) => void;
  onDayScheduleChange: (dayId: string, updates: { travelMode?: TravelMode; startTime?: string; lodgingPlaceId?: string; timeManagementEnabled?: boolean }) => void;
  onStopScheduleChange: (dayId: string, placeId: string, updates: StopSchedule) => void;
  hotelPlaces: Place[];
  tripHotelId?: string;
  onLegModeChange: (dayId: string, fromPlaceId: string, toPlaceId: string, mode: TravelMode | 'default') => void;
}

export function DayColumn({
  day,
  index,
  startDate,
  places,
  selectedId,
  visitedPlaceIds,
  onSelect,
  onAddPlace,
  onAddPlaceholder,
  onReplacePlaceholder,
  onRenamePlaceholder,
  onLabelChange,
  onRemove,
  onEditPlace,
  onDeletePlace,
  onVisitedChange,
  onDayScheduleChange,
  onStopScheduleChange,
  hotelPlaces,
  tripHotelId,
  onLegModeChange,
}: DayColumnProps) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Place | null>(null);
  const [renameLabel, setRenameLabel] = useState('');
  const isDesktop = useMediaQuery('(min-width: 75em)');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: `day:${day.id}`,
    data: { type: 'day', dayId: day.id },
  });
  const { onPointerDown, onKeyDown } = listeners ?? {};
  const visitedCount = places.filter((place) => visitedPlaceIds.includes(place.id)).length;
  const allPlacesVisited = places.length > 0 && visitedCount === places.length;
  const warningsByPlace = day.timeManagementEnabled ? dayWarnings(day, places) : new Map<string, string[]>();
  const warningCount = [...warningsByPlace.values()].reduce((total, warnings) => total + warnings.length, 0);

  useEffect(() => {
    if (isDesktop) setCollapsed(false);
  }, [isDesktop]);

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

  function legMapUrl(from: Place, to: Place, mode: TravelMode) {
    const travelmode = mode === 'public' ? 'transit' : mode === 'walk' ? 'walking' : mode === 'bike' ? 'bicycling' : mode === 'other' ? undefined : 'driving';
    const params = new URLSearchParams({ api: '1', origin: `${from.latitude},${from.longitude}`, destination: `${to.latitude},${to.longitude}` });
    if (travelmode) params.set('travelmode', travelmode);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  function transportIcon(mode: TravelMode) {
    if (mode === 'walk') return <IconWalk size={16} />;
    if (mode === 'bike') return <IconBike size={16} />;
    if (mode === 'car') return <IconCar size={16} />;
    if (mode === 'taxi') return <IconCar size={16} />;
    if (mode === 'other') return <IconDots size={16} />;
    return <IconBus size={16} />;
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
        data-collapsible={!isDesktop || undefined}
        onClick={isDesktop ? undefined : toggleCollapsedFromHeader}
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
            <Box className="day-column__completion-slot">
              {allPlacesVisited ? (
              <Tooltip label={t('allStopsVisited')}>
                <ThemeIcon color="teal" variant="light" radius="xl" size="sm" className="day-column__completion" aria-label={t('allStopsVisited')}>
                  <IconCircleCheckFilled size={16} />
                </ThemeIcon>
              </Tooltip>
              ) : null}
            </Box>
            {!isDesktop ? (
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
            ) : null}
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
            <Tooltip label={day.timeManagementEnabled ? t('hideTimeManagement') : t('manageTimes')}>
              <ActionIcon
                variant="subtle"
                color={day.timeManagementEnabled ? 'teal' : 'gray'}
                size="sm"
                aria-label={day.timeManagementEnabled ? t('hideTimeManagement') : t('manageTimes')}
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
                  { value: 'public', label: t('publicTransport') },
                  { value: 'walk', label: t('walk') },
                  { value: 'bike', label: t('bike') },
                  { value: 'car', label: t('car') },
                  { value: 'taxi', label: t('taxi') },
                  { value: 'other', label: t('otherTransport') },
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
                label={t('stayAt')}
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
              <Box key={place.id}>
              <PlaceCard
                key={place.id}
                place={place}
                selected={selectedId === place.id}
                visited={visitedPlaceIds.includes(place.id)}
                onSelect={onSelect}
                onEdit={onEditPlace}
                onDelete={onDeletePlace}
                onReplace={place.type === 'placeholder' ? onReplacePlaceholder : undefined}
                onRename={place.type === 'placeholder' ? (target) => { setRenameTarget(target); setRenameLabel(target.name === target.placeholderKind ? '' : target.name); } : undefined}
                onVisitedChange={onVisitedChange}
                schedule={day.timeManagementEnabled && day.stopSchedules?.[place.id] ? scheduleFor(day, place) : undefined}
                travelMinutes={day.timeManagementEnabled && day.stopSchedules?.[place.id] && placeIndex > 0 && place.type !== 'placeholder' && places[placeIndex - 1].type !== 'placeholder' ? estimateTravelMinutes(places[placeIndex - 1], place, day.travelMode) : undefined}
                warnings={warningsByPlace.get(place.id)}
                onScheduleChange={day.timeManagementEnabled ? (updates) => onStopScheduleChange(day.id, place.id, updates) : undefined}
                onEnableSchedule={day.timeManagementEnabled ? () => onStopScheduleChange(day.id, place.id, { durationMinutes: scheduleFor(day, place).durationMinutes }) : undefined}
              />
              {places[placeIndex + 1] ? (() => {
                const nextPlace = places[placeIndex + 1];
                const key = routeLegKey(place.id, nextPlace.id);
                const mode = day.legModeOverrides?.[key] ?? 'default';
                const actualMode = mode === 'default' ? day.travelMode ?? 'public' : mode;
                const canOpenRoute = place.type !== 'placeholder' && nextPlace.type !== 'placeholder';
                return (
                  <Group className="route-leg" gap="xs" justify="center" wrap="nowrap">
                    {canOpenRoute ? <Tooltip label={t('openRoute')}><ActionIcon component="a" href={legMapUrl(place, nextPlace, actualMode)} target="_blank" rel="noopener noreferrer" variant="subtle" color="gray" aria-label={t('openRoute')}><IconRoute size={15} /></ActionIcon></Tooltip> : <ActionIcon variant="subtle" color="gray" disabled aria-label={t('openRoute')}><IconRoute size={15} /></ActionIcon>}
                    <Menu position="bottom-end" shadow="md" withinPortal>
                      <Menu.Target>
                        <Tooltip label={t('routeMode')}>
                          <ActionIcon variant="light" color="teal" aria-label={t('routeMode')}>
                            {transportIcon(actualMode)}
                          </ActionIcon>
                        </Tooltip>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={transportIcon(day.travelMode ?? 'public')} onClick={() => onLegModeChange(day.id, place.id, nextPlace.id, 'default')}>{t('dayDefault')}</Menu.Item>
                        <Menu.Item leftSection={<IconBus size={16} />} onClick={() => onLegModeChange(day.id, place.id, nextPlace.id, 'public')}>{t('publicTransport')}</Menu.Item>
                        <Menu.Item leftSection={<IconWalk size={16} />} onClick={() => onLegModeChange(day.id, place.id, nextPlace.id, 'walk')}>{t('walk')}</Menu.Item>
                        <Menu.Item leftSection={<IconBike size={16} />} onClick={() => onLegModeChange(day.id, place.id, nextPlace.id, 'bike')}>{t('bike')}</Menu.Item>
                        <Menu.Item leftSection={<IconCar size={16} />} onClick={() => onLegModeChange(day.id, place.id, nextPlace.id, 'car')}>{t('car')}</Menu.Item>
                        <Menu.Item leftSection={<IconCar size={16} />} onClick={() => onLegModeChange(day.id, place.id, nextPlace.id, 'taxi')}>{t('taxi')}</Menu.Item>
                        <Menu.Item leftSection={<IconDots size={16} />} onClick={() => onLegModeChange(day.id, place.id, nextPlace.id, 'other')}>{t('otherTransport')}</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                );
              })() : null}
              </Box>
            ))}
            <UnstyledButton className="add-place-placeholder" onClick={onAddPlace}>
              <IconPlus size={17} />
              <Text size="xs" fw={650}>
                {t('addPlace')}
              </Text>
            </UnstyledButton>
            <Menu position="top" shadow="md" withinPortal>
              <Menu.Target>
                <UnstyledButton className="planned-stop-placeholder">
                  <IconPlus size={17} />
                  <Text size="xs" fw={650}>{t('plannedStop')}</Text>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconToolsKitchen size={15} />} onClick={() => onAddPlaceholder('meal')}>{t('lunchDinner')}</Menu.Item>
                <Menu.Item leftSection={<IconCoffee size={15} />} onClick={() => onAddPlaceholder('coffee')}>{t('coffeeBreak')}</Menu.Item>
                <Menu.Item leftSection={<IconSun size={15} />} onClick={() => onAddPlaceholder('free-time')}>{t('freeTime')}</Menu.Item>
                <Menu.Item leftSection={<IconPlus size={15} />} onClick={() => onAddPlaceholder('custom')}>{t('customStop')}</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Stack>
        </SortableContext>
      ) : null}
      <Modal opened={Boolean(renameTarget)} onClose={() => setRenameTarget(null)} title={t('renamePlannedStop')} centered>
        <Stack>
          <TextInput value={renameLabel} placeholder={renameTarget?.placeholderKind === 'meal' ? t('lunchDinner') : renameTarget?.placeholderKind === 'coffee' ? t('coffeeBreak') : renameTarget?.placeholderKind === 'free-time' ? t('freeTime') : t('customStop')} onChange={(event) => setRenameLabel(event.currentTarget.value)} autoFocus />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRenameTarget(null)}>{t('cancel')}</Button>
            <Button color="teal" onClick={() => { if (renameTarget && renameLabel.trim()) onRenamePlaceholder(renameTarget, renameLabel.trim()); setRenameTarget(null); }}>{t('saveChanges')}</Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
