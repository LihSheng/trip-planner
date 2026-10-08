import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
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
  Switch,
  Text,
  TextInput,
  Select,
} from '@mantine/core';
import { IconAlertTriangle, IconBed, IconCircleCheckFilled, IconCoffee, IconDots, IconListCheck, IconMapPinPlus, IconPlane, IconPlus, IconSun, IconToolsKitchen, IconTrash } from '@tabler/icons-react';
import type { DayTask, LocationCluster, PlaceholderKind, Place, RouteLegMode, StopSchedule, TravelMode, TripDay } from '../types';
import { formatTripDate } from '../utils/date';
import { PlaceCard } from './PlaceCard';
import { useI18n } from '../i18n';
import { dayWarnings, estimateTravelMinutes, scheduleFor } from '../utils/schedule';
import { isExceptionLeg, routeLegKey } from '../utils/routing';
import { legGoogleMapsUrl } from '../utils/mapPresentation';
import { TransportLegChip } from './TransportLegChip';
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
  moveTargets?: { id: string; label: string }[];
  onMoveToPlace?: (placeId: string, containerId: string) => void;
}

/** The selected day in the planner: one day at a time, with room for times and routes. */
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
  moveTargets,
  onMoveToPlace,
}: DayColumnProps) {
  const { t } = useI18n();
  const [renameTarget, setRenameTarget] = useState<Place | null>(null);
  const [renameLabel, setRenameLabel] = useState('');
  // Dropping on empty space in the day appends to the end; the plain day id is what getDestination expects.
  const { setNodeRef, isOver } = useDroppable({ id: day.id, data: { type: 'day', dayId: day.id }, disabled: readOnly });
  const dayName = t('day', { number: index + 1 });
  const visitedCount = places.filter((place) => visitedPlaceIds.includes(place.id)).length;
  const allPlacesVisited = places.length > 0 && visitedCount === places.length;
  const warningsByPlace = day.timeManagementEnabled ? dayWarnings(day, places) : new Map<string, string[]>();
  const warningCount = [...warningsByPlace.values()].reduce((total, warnings) => total + warnings.length, 0);
  const incompleteTaskCount = tasks.filter((task) => !task.completed).length;

  const dayDefaultMode: TravelMode = day.travelMode ?? 'public';
  const [showAllLegs, setShowAllLegs] = useState(false);
  /** Resolve the transport leg between two consecutive stops: mode, minutes and context word. */
  const legInfo = (place: Place, nextPlace: Place) => {
    const cluster = clusterForPlace(clusters, place.id);
    const nextCluster = clusterForPlace(clusters, nextPlace.id);
    const sameCluster = Boolean(cluster && nextCluster?.id === cluster.id);
    const connectionMember = cluster && sameCluster ? clusterMember(cluster, nextPlace.id) ?? clusterMember(cluster, place.id) : undefined;
    const relationship = connectionMember?.relationship === 'nearby' ? 'walkable' : connectionMember?.relationship;
    const inside = relationship === 'inside';
    const legMode: RouteLegMode = day.legModeOverrides?.[routeLegKey(place.id, nextPlace.id)] ?? 'default';
    const mode: TravelMode = inside
      ? 'walk'
      : legMode !== 'default'
        ? legMode
        : relationship === 'same-area'
          ? connectionMember?.travelMode ?? dayDefaultMode
          : relationship === 'walkable'
            ? 'walk'
            : dayDefaultMode;
    const minutes = sameCluster
      ? connectionMember?.travelMinutes ?? connectionMember?.walkMinutes
      : !isPlaceholder(place) && !isPlaceholder(nextPlace) ? estimateTravelMinutes(place, nextPlace, mode) : undefined;
    const context = inside ? t('insideVenue') : relationship === 'same-area' ? t('inArea') : relationship === 'walkable' ? t('nearby') : undefined;
    return { legMode, mode, minutes, context, inside };
  };
  const legCount = Math.max(places.length - 1, 0);
  const totalLegMinutes = places.slice(1).reduce((total, place, i) => total + (legInfo(places[i], place).minutes ?? 0), 0);

  return (
    <Paper
      ref={setNodeRef}
      withBorder
      radius="lg"
      className="day-column day-column--focus"
      data-day-id={day.id}
      data-over={isOver || undefined}
    >
      <Box className="day-column__header">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text size="xs" fw={700} c="dimmed" className="day-column__eyebrow">
              {dayName} · {formatTripDate(startDate, index)}
            </Text>
            {readOnly ? (
              <Text fw={800} size="xl" lineClamp={1}>{day.label.trim() || dayName}</Text>
            ) : (
              <TextInput
                variant="unstyled"
                value={day.label}
                placeholder={t('untitledDay')}
                onChange={(event) => onLabelChange(day.id, event.currentTarget.value)}
                aria-label={t('dayTitle', { number: index + 1 })}
                classNames={{ input: 'day-column__title-input' }}
              />
            )}
            <Group gap={6} className="day-column__chips">
              {lodgingLabel ? (
                <Badge variant="light" color="indigo" tt="none" leftSection={<IconBed size={12} />}>
                  {t('stayingAt', { name: lodgingLabel })}
                </Badge>
              ) : null}
              <Button
                size="compact-xs"
                variant="light"
                radius="xl"
                color={incompleteTaskCount ? 'orange' : tasks.length ? 'teal' : 'gray'}
                leftSection={tasks.length > 0 && incompleteTaskCount === 0 ? <IconCircleCheckFilled size={13} /> : <IconListCheck size={13} />}
                onClick={() => onOpenTasks(day.id)}
              >
                {incompleteTaskCount ? t('openTasks', { count: incompleteTaskCount }) : t('checklist')}
              </Button>
              {allPlacesVisited ? (
                <Badge variant="light" color="teal" tt="none" leftSection={<IconCircleCheckFilled size={12} />}>
                  {t('allStopsVisited')}
                </Badge>
              ) : null}
            </Group>
          </Stack>
          {!readOnly ? (
            <Group gap="xs" wrap="nowrap">
              <Switch
                size="sm"
                label={t('times')}
                checked={Boolean(day.timeManagementEnabled)}
                onChange={(event) => onDayScheduleChange(day.id, { timeManagementEnabled: event.currentTarget.checked })}
              />
              <Menu position="bottom-end" shadow="md" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="default" aria-label={t('dayOptions', { day: dayName })}>
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconListCheck size={15} />} onClick={() => onOpenTasks(day.id)}>{t('checklist')}</Menu.Item>
                  <Menu.Divider />
                  <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={() => onRemove(day.id)}>{t('removeDay')}</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          ) : null}
        </Group>
        {!readOnly && day.timeManagementEnabled ? (
          <Group gap="xs" mt="sm" grow className="day-column__time-settings">
            <Select
              size="xs"
              value={day.travelMode ?? 'public'}
              aria-label={`Travel mode for ${dayName}`}
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
              aria-label={`Day start time for ${dayName}`}
              onChange={(event) => onDayScheduleChange(day.id, { startTime: event.currentTarget.value })}
            />
            {hotelPlaces.length ? (
              <Select
                size="xs"
                clearable
                placeholder={t('stayAt')}
                aria-label={t('stayAt')}
                value={day.lodgingPlaceId || tripHotelId || null}
                data={hotelPlaces.map((place) => ({ value: place.id, label: place.name }))}
                onChange={(value) => onDayScheduleChange(day.id, { lodgingPlaceId: value ?? '' })}
              />
            ) : null}
          </Group>
        ) : null}
        {places.length >= 2 ? (
          <Box className="day-column__transport-summary">
            <span>{t('mostly')}</span>
            <TransportLegChip
              mode={dayDefaultMode}
              dayDefaultMode={dayDefaultMode}
              isOverride={false}
              readOnly={readOnly}
              hideDefaultItem
              onChange={(mode) => { if (mode !== 'default') onDayScheduleChange(day.id, { travelMode: mode }); }}
            />
            <Text span size="xs" c="dimmed">· {t('legsSummary', { legs: legCount, minutes: totalLegMinutes })}</Text>
            <Button ml="auto" size="compact-xs" variant="subtle" color="gray" onClick={() => setShowAllLegs((value) => !value)}>
              {showAllLegs ? t('hideDefaultLegs') : t('showAllLegs')}
            </Button>
          </Box>
        ) : null}
        {day.timeManagementEnabled && warningCount ? (
          <Group gap={4} mt="xs">
            <IconAlertTriangle size={14} color="var(--mantine-color-orange-6)" />
            <Text size="xs" c="orange">{warningCount} schedule warning{warningCount === 1 ? '' : 's'}</Text>
          </Group>
        ) : null}
      </Box>

      <SortableContext items={day.placeIds} strategy={verticalListSortingStrategy}>
        <Stack gap="xs" className="day-column__body">
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
                  place={place}
                  selected={selectedId === place.id}
                  dragDisabled={readOnly}
                  visited={visitedPlaceIds.includes(place.id)}
                  currentContainerId={day.id}
                  moveTargets={moveTargets}
                  onMoveTo={onMoveToPlace ? (containerId) => onMoveToPlace(place.id, containerId) : undefined}
                  onSelect={onSelect}
                  onEdit={readOnly ? undefined : onEditActivity}
                  editLabel="Edit plan & schedule"
                  onDelete={readOnly ? undefined : onDeletePlace}
                  onReplace={!readOnly && isPlaceholder(place) ? onReplacePlaceholder : undefined}
                  onRename={!readOnly && isPlaceholder(place) ? (target) => { setRenameTarget(target); setRenameLabel(target.name === target.placeholderKind ? '' : target.name); } : undefined}
                  schedule={!readOnly && day.timeManagementEnabled && day.stopSchedules?.[place.id] ? scheduleFor(day, place) : undefined}
                  travelMinutes={!readOnly && day.timeManagementEnabled && day.stopSchedules?.[place.id] && placeIndex > 0 && !isPlaceholder(place) && !isPlaceholder(places[placeIndex - 1]) ? estimateTravelMinutes(places[placeIndex - 1], place, day.travelMode) : undefined}
                  warnings={readOnly ? undefined : warningsByPlace.get(place.id)}
                  onScheduleChange={!readOnly && day.timeManagementEnabled ? (updates) => onStopScheduleChange(day.id, place.id, updates) : undefined}
                  onEnableSchedule={!readOnly && day.timeManagementEnabled ? () => onStopScheduleChange(day.id, place.id, { durationMinutes: scheduleFor(day, place).durationMinutes }) : undefined}
                  clusterLabel={cluster?.name}
                  clusterRelationship={cluster ? member?.relationship ?? 'anchor' : undefined}
                />
                {places[placeIndex + 1] ? (() => {
                  const nextPlace = places[placeIndex + 1];
                  const leg = legInfo(place, nextPlace);
                  const showChip = showAllLegs || isExceptionLeg(leg.legMode, leg.mode, dayDefaultMode);
                  return (
                    <Group className={`route-leg${showChip ? '' : ' route-leg--collapsed'}`} gap="xs" justify="center" wrap="nowrap">
                      {!showChip ? null : leg.inside ? (
                        <Text size="xs" c="dimmed">{t('walk').toLowerCase()} · {t('insideVenue')}</Text>
                      ) : (
                        <TransportLegChip
                          mode={leg.mode}
                          dayDefaultMode={dayDefaultMode}
                          isOverride={leg.legMode !== 'default'}
                          minutes={leg.minutes}
                          context={leg.context}
                          readOnly={readOnly}
                          routeUrl={!isPlaceholder(place) && !isPlaceholder(nextPlace) ? legGoogleMapsUrl(place, nextPlace, leg.mode) : undefined}
                          onChange={(mode) => onLegModeChange(day.id, place.id, nextPlace.id, mode)}
                        />
                      )}
                    </Group>
                  );
                })() : null}
              </Box>
            );
          })}
          {places.length === 0 && bookingCards.length === 0 ? (
            <Box className="day-column__empty">
              <IconPlus size={22} className="day-column__empty-icon" />
              <Text size="sm" c="dimmed" ta="center">{t('emptyDayHint')}</Text>
            </Box>
          ) : null}
          {!readOnly ? (
            <Group className="day-column__add-actions" gap={4}>
              <Text size="xs" fw={600} c="dimmed" px={6}>{t('addToDay', { day: dayName })}</Text>
              <Button variant="subtle" color="gray" size="xs" leftSection={<IconMapPinPlus size={15} />} onClick={onAddPlace}>
                {t('addPlace')}
              </Button>
              <Menu position="top" shadow="md" withinPortal>
                <Menu.Target>
                  <Button variant="subtle" color="gray" size="xs" leftSection={<IconCoffee size={15} />}>{t('mealOrBreak')}</Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconToolsKitchen size={15} />} onClick={() => onAddPlaceholder('meal')}>{t('lunchDinner')}</Menu.Item>
                  <Menu.Item leftSection={<IconCoffee size={15} />} onClick={() => onAddPlaceholder('coffee')}>{t('coffeeBreak')}</Menu.Item>
                  <Menu.Item leftSection={<IconSun size={15} />} onClick={() => onAddPlaceholder('free-time')}>{t('freeTime')}</Menu.Item>
                  <Menu.Item leftSection={<IconPlus size={15} />} onClick={() => onAddPlaceholder('custom')}>{t('customStop')}</Menu.Item>
                </Menu.Dropdown>
              </Menu>
              {onAddFlight ? (
                <Button variant="subtle" color="gray" size="xs" leftSection={<IconPlane size={15} />} onClick={onAddFlight}>
                  {t('addFlight')}
                </Button>
              ) : null}
            </Group>
          ) : null}
        </Stack>
      </SortableContext>
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
