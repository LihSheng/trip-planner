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
  Indicator,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAlertTriangle, IconBike, IconBus, IconCalendar, IconCar, IconChevronDown, IconChevronUp, IconCircleCheckFilled, IconClock, IconCoffee, IconDots, IconGripVertical, IconListCheck, IconMapPinPlus, IconPlane, IconPlus, IconRoute, IconSun, IconToolsKitchen, IconTrash, IconWalk } from '@tabler/icons-react';
import type { DayTask, LocationCluster, PlaceholderKind, Place, StopSchedule, TravelMode, TripDay } from '../types';
import { formatTripDate } from '../utils/date';
import { PlaceCard } from './PlaceCard';
import { useI18n } from '../i18n';
import { dayWarnings, estimateTravelMinutes, scheduleFor } from '../utils/schedule';
import { routeLegKey } from '../utils/routing';
import { legGoogleMapsUrl } from '../utils/mapPresentation';
import { transportIcon } from './transportIcons';
import { isPlaceholder } from '../domain/place';
import { clusterForPlace, clusterMember } from '../domain/locationCluster';
import { BookingCard, type PlannerBookingCard } from './BookingCard';

interface DayColumnProps {
  readOnly?: boolean;
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
  onEditActivity: (place: Place) => void;
  onDeletePlace: (place: Place) => void;
  onVisitedChange: (placeId: string) => void;
  onDayScheduleChange: (dayId: string, updates: { travelMode?: TravelMode; startTime?: string; lodgingPlaceId?: string; timeManagementEnabled?: boolean }) => void;
  onStopScheduleChange: (dayId: string, placeId: string, updates: StopSchedule) => void;
  hotelPlaces: Place[];
  tripHotelId?: string;
  onLegModeChange: (dayId: string, fromPlaceId: string, toPlaceId: string, mode: TravelMode | 'default') => void;
  clusters?: LocationCluster[];
  tasks?: DayTask[];
  onOpenTasks: (dayId: string) => void;
  bookingCards?: PlannerBookingCard[];
  onEditBooking?: (card: PlannerBookingCard) => void;
  onAddFlight?: () => void;
  lodgingLabel?: string;
  showTransport?: boolean;
}

export function DayColumn({
  readOnly = false,
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
  onEditActivity,
  onDeletePlace,
  onVisitedChange,
  onDayScheduleChange,
  onStopScheduleChange,
  hotelPlaces,
  tripHotelId,
  onLegModeChange,
  clusters = [],
  tasks = [],
  onOpenTasks,
  bookingCards = [],
  onEditBooking,
  onAddFlight,
  lodgingLabel,
  showTransport = true,
}: DayColumnProps) {
  const { t, locale } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Place | null>(null);
  const [renameLabel, setRenameLabel] = useState('');
  const isDesktop = useMediaQuery('(min-width: 48em)');
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: `day:${day.id}`,
    data: { type: 'day', dayId: day.id },
    disabled: readOnly,
  });
  const { onPointerDown, onKeyDown } = listeners ?? {};
  const visitedCount = places.filter((place) => visitedPlaceIds.includes(place.id)).length;
  const allPlacesVisited = places.length > 0 && visitedCount === places.length;
  const warningsByPlace = day.timeManagementEnabled ? dayWarnings(day, places) : new Map<string, string[]>();
  const warningCount = [...warningsByPlace.values()].reduce((total, warnings) => total + warnings.length, 0);
  const incompleteTaskCount = tasks.filter((task) => !task.completed).length;

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



  return (
      <Paper
        ref={setNodeRef}
        withBorder
        radius="lg"
        className="day-column day-column--draggable"
        data-day-id={day.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...(isDesktop ? attributes : {})}
      onPointerDown={isDesktop ? handlePointerDown : undefined}
      onKeyDown={isDesktop ? onKeyDown as KeyboardEventHandler<HTMLDivElement> | undefined : undefined}
      data-over={isOver || undefined}
      data-dragging={isDragging || undefined}
    >
      <Box
        className={`day-column__header day-column__header--${index % 5}`}
        data-collapsible={!isDesktop || undefined}
        onClick={isDesktop ? undefined : toggleCollapsedFromHeader}
      >
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={3} style={{ flex: 1, minWidth: 0 }}>
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
            {!isDesktop && !readOnly ? (
              <Tooltip label={`Move ${t('day', { number: index + 1 })}`}>
                <ActionIcon
                  ref={setActivatorNodeRef}
                  {...attributes}
                  {...listeners}
                  variant="subtle"
                  color="gray"
                  className="day-column__drag-handle"
                  aria-label={`Move ${t('day', { number: index + 1 })}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <IconGripVertical size={18} />
                </ActionIcon>
              </Tooltip>
            ) : null}
            <Tooltip label="Day tasks">
              <Indicator
                label={incompleteTaskCount}
                size={16}
                disabled={incompleteTaskCount === 0}
                color="red"
                offset={3}
              >
                <ActionIcon
                  variant={tasks.length ? 'light' : 'subtle'}
                  color={tasks.length > 0 && incompleteTaskCount === 0 ? 'teal' : 'gray'}
                  size="sm"
                  aria-label={`${t('day', { number: index + 1 })} tasks`}
                  onClick={() => onOpenTasks(day.id)}
                >
                  {tasks.length > 0 && incompleteTaskCount === 0 ? <IconCircleCheckFilled size={16} /> : <IconListCheck size={16} />}
                </ActionIcon>
              </Indicator>
            </Tooltip>
            {allPlacesVisited ? (
              <Box className="day-column__completion-slot">
              <Tooltip label={t('allStopsVisited')}>
                <ThemeIcon color="teal" variant="light" radius="xl" size="sm" className="day-column__completion" aria-label={t('allStopsVisited')}>
                  <IconCircleCheckFilled size={16} />
                </ThemeIcon>
              </Tooltip>
              </Box>
            ) : null}
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
            {!readOnly ? <Tooltip label={t('removeDay')}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`${t('removeDay')} ${index + 1}`}
                onClick={() => onRemove(day.id)}
              >
                <IconTrash size={15} />
              </ActionIcon>
            </Tooltip> : null}
            {!readOnly ? <Tooltip label={day.timeManagementEnabled ? t('hideTimeManagement') : t('manageTimes')}>
              <ActionIcon
                variant="subtle"
                color={day.timeManagementEnabled ? 'teal' : 'gray'}
                size="sm"
                aria-label={day.timeManagementEnabled ? t('hideTimeManagement') : t('manageTimes')}
                onClick={() => onDayScheduleChange(day.id, { timeManagementEnabled: !day.timeManagementEnabled })}
              >
                <IconClock size={16} />
              </ActionIcon>
            </Tooltip> : null}
          </Group>
        </Group>
        {lodgingLabel ? <Text size="xs" fw={650} c="indigo" className="day-column__lodging">{locale === 'zh-TW' ? `住宿：${lodgingLabel}` : `Staying at ${lodgingLabel}`}</Text> : null}
        {!readOnly && !collapsed && day.timeManagementEnabled ? (
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
        {!readOnly && !collapsed ? (
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
            {bookingCards.map((card) => <BookingCard key={card.id} card={card} onEdit={readOnly ? undefined : onEditBooking} />)}
            {places.map((place, placeIndex) => {
              const cluster = clusterForPlace(clusters, place.id);
              const member = cluster ? clusterMember(cluster, place.id) : undefined;
              return (
              <Box
                key={place.id}
                className="planner-place"
                data-cluster-member={member ? member.relationship : undefined}
                data-cluster-anchor={cluster?.anchorPlaceId === place.id || undefined}
              >
              <PlaceCard
                key={place.id}
                place={place}
                selected={selectedId === place.id}
                dragDisabled={readOnly}
                visited={visitedPlaceIds.includes(place.id)}
                onSelect={onSelect}
                onEdit={readOnly ? undefined : onEditActivity}
                editLabel="Edit plan & schedule"
                onDelete={readOnly ? undefined : onDeletePlace}
                onReplace={!readOnly && isPlaceholder(place) ? onReplacePlaceholder : undefined}
                onRename={!readOnly && isPlaceholder(place) ? (target) => { setRenameTarget(target); setRenameLabel(target.name === target.placeholderKind ? '' : target.name); } : undefined}
                onVisitedChange={readOnly ? undefined : onVisitedChange}
                schedule={!readOnly && day.timeManagementEnabled && day.stopSchedules?.[place.id] ? scheduleFor(day, place) : undefined}
                travelMinutes={!readOnly && day.timeManagementEnabled && day.stopSchedules?.[place.id] && placeIndex > 0 && !isPlaceholder(place) && !isPlaceholder(places[placeIndex - 1]) ? estimateTravelMinutes(places[placeIndex - 1], place, day.travelMode) : undefined}
                warnings={readOnly ? undefined : warningsByPlace.get(place.id)}
                onScheduleChange={!readOnly && day.timeManagementEnabled ? (updates) => onStopScheduleChange(day.id, place.id, updates) : undefined}
                onEnableSchedule={!readOnly && day.timeManagementEnabled ? () => onStopScheduleChange(day.id, place.id, { durationMinutes: scheduleFor(day, place).durationMinutes }) : undefined}
                clusterLabel={cluster?.name}
                clusterRelationship={cluster ? member?.relationship ?? 'anchor' : undefined}
              />
              {showTransport && places[placeIndex + 1] ? (() => {
                const nextPlace = places[placeIndex + 1];
                const nextCluster = clusterForPlace(clusters, nextPlace.id);
                const sameCluster = cluster && nextCluster?.id === cluster.id;
                const nextMember = sameCluster ? clusterMember(cluster, nextPlace.id) : undefined;
                const connectionMember = sameCluster ? nextMember ?? clusterMember(cluster, place.id) : undefined;
                const relationship = connectionMember?.relationship === 'nearby' ? 'walkable' : connectionMember?.relationship;
                if (sameCluster && relationship !== 'same-area') {
                  const inside = relationship === 'inside';
                  return (
                    <Group className="route-leg route-leg--cluster" gap={6} justify="center">
                      <IconWalk size={15} />
                      <Text size="xs" fw={650}>
                        {inside ? 'Inside venue · no transport' : `${connectionMember?.travelMinutes ?? connectionMember?.walkMinutes ?? 'Short'} min walk`}
                      </Text>
                    </Group>
                  );
                }
                const key = routeLegKey(place.id, nextPlace.id);
                const mode = day.legModeOverrides?.[key] ?? 'default';
                const actualMode = mode === 'default'
                  ? relationship === 'same-area'
                    ? connectionMember?.travelMode ?? day.travelMode ?? 'public'
                    : day.travelMode ?? 'public'
                  : mode;
                const canOpenRoute = !isPlaceholder(place) && !isPlaceholder(nextPlace);
                return (
                  <Group className={`route-leg${relationship === 'same-area' ? ' route-leg--area' : ''}`} gap="xs" justify="center" wrap="nowrap">
                    {canOpenRoute ? <Tooltip label={t('openRoute')}><ActionIcon component="a" href={legGoogleMapsUrl(place, nextPlace, actualMode)} target="_blank" rel="noopener noreferrer" variant="subtle" color="gray" aria-label={t('openRoute')}><IconRoute size={15} /></ActionIcon></Tooltip> : <ActionIcon variant="subtle" color="gray" disabled aria-label={t('openRoute')}><IconRoute size={15} /></ActionIcon>}
                    {relationship === 'same-area' ? (
                      <Text size="xs" fw={650}>{connectionMember?.travelMinutes ? `${connectionMember.travelMinutes} min within area` : 'Transport within area'}</Text>
                    ) : null}
                    {!readOnly ? <Menu position="bottom-end" shadow="md" withinPortal>
                      <Menu.Target>
                        <Tooltip label={t('routeMode')}>
                          <ActionIcon variant="light" color="teal" aria-label={t('routeMode')}>
                            {transportIcon(actualMode)}
                          </ActionIcon>
                        </Tooltip>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={transportIcon(relationship === 'same-area' ? connectionMember?.travelMode ?? day.travelMode ?? 'public' : day.travelMode ?? 'public')} onClick={() => onLegModeChange(day.id, place.id, nextPlace.id, 'default')}>{relationship === 'same-area' ? 'Area default' : t('dayDefault')}</Menu.Item>
                        <Menu.Item leftSection={<IconBus size={16} />} onClick={() => onLegModeChange(day.id, place.id, nextPlace.id, 'public')}>{t('publicTransport')}</Menu.Item>
                        <Menu.Item leftSection={<IconWalk size={16} />} onClick={() => onLegModeChange(day.id, place.id, nextPlace.id, 'walk')}>{t('walk')}</Menu.Item>
                        <Menu.Item leftSection={<IconBike size={16} />} onClick={() => onLegModeChange(day.id, place.id, nextPlace.id, 'bike')}>{t('bike')}</Menu.Item>
                        <Menu.Item leftSection={<IconCar size={16} />} onClick={() => onLegModeChange(day.id, place.id, nextPlace.id, 'car')}>{t('car')}</Menu.Item>
                        <Menu.Item leftSection={<IconCar size={16} />} onClick={() => onLegModeChange(day.id, place.id, nextPlace.id, 'taxi')}>{t('taxi')}</Menu.Item>
                        <Menu.Item leftSection={<IconDots size={16} />} onClick={() => onLegModeChange(day.id, place.id, nextPlace.id, 'other')}>{t('otherTransport')}</Menu.Item>
                      </Menu.Dropdown>
                    </Menu> : <Tooltip label={t('routeMode')}><ActionIcon variant="light" color="teal" aria-label={t('routeMode')} disabled>{transportIcon(actualMode)}</ActionIcon></Tooltip>}
                  </Group>
                );
              })() : null}
              </Box>
            )})}
            {!readOnly ? <Group className="day-column__add-actions" gap="xs" justify="center">
              <Tooltip label={t('addPlace')}>
                <ActionIcon className="day-column__add-action" variant="light" color="teal" size="lg" onClick={onAddPlace} aria-label={t('addPlace')}>
                  <IconMapPinPlus size={18} />
                </ActionIcon>
              </Tooltip>
              <Menu position="top" shadow="md" withinPortal>
                <Menu.Target>
                  <Tooltip label={t('plannedStop')}>
                    <ActionIcon className="day-column__add-action" variant="light" color="gray" size="lg" aria-label={t('plannedStop')}>
                      <IconListCheck size={18} />
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconToolsKitchen size={15} />} onClick={() => onAddPlaceholder('meal')}>{t('lunchDinner')}</Menu.Item>
                  <Menu.Item leftSection={<IconCoffee size={15} />} onClick={() => onAddPlaceholder('coffee')}>{t('coffeeBreak')}</Menu.Item>
                  <Menu.Item leftSection={<IconSun size={15} />} onClick={() => onAddPlaceholder('free-time')}>{t('freeTime')}</Menu.Item>
                  <Menu.Item leftSection={<IconPlus size={15} />} onClick={() => onAddPlaceholder('custom')}>{t('customStop')}</Menu.Item>
                </Menu.Dropdown>
              </Menu>
              {onAddFlight ? <Tooltip label={locale === 'zh-TW' ? '新增航班' : 'Add flight'}>
                <ActionIcon className="day-column__add-action" variant="light" color="blue" size="lg" onClick={onAddFlight} aria-label={locale === 'zh-TW' ? '新增航班' : 'Add flight'}>
                  <IconPlane size={18} />
                </ActionIcon>
              </Tooltip> : null}
            </Group> : null}
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
