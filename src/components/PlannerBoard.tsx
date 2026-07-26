import { useState } from 'react';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Button, Group, Modal, ScrollArea, Stack, Text } from '@mantine/core';
import { IconHistory, IconPlus } from '@tabler/icons-react';
import type { ContainerId, PlaceholderKind, Place, StopSchedule, TravelMode, TripState } from '../types';
import { findContainer, getContainerItems } from '../utils/itinerary';
import { DayColumn } from './DayColumn';
import { PlaceCardPreview } from './PlaceCard';
import { UnscheduledColumn } from './UnscheduledColumn';
import { useI18n } from '../i18n';
import { addDays } from '../utils/date';
import { isAccommodation, stayAssignmentStatus, type StayAssignmentStatus } from '../utils/stay';

import { useTrip } from '../context/TripContext';
import { TripActivityDrawer } from './TripActivityDrawer';

interface PlannerBoardProps {
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onEditPlace: (place: Place) => void;
  onDeletePlace: (place: Place) => void;
  onAddPlaceToDay: (dayId: string) => void;
  onReplacePlaceholder: (placeholderId: string) => void;
}

export function PlannerBoard({
  selectedId,
  onSelect,
  onEditPlace,
  onDeletePlace,
  onAddPlaceToDay,
  onReplacePlaceholder,
}: PlannerBoardProps) {
  const {
    state,
    placesById,
    isReadOnly: readOnly,
    addDay: onAddDay,
    addPlaceholderToDay: onAddPlaceholderToDay,
    fillPlaceholder: onFillPlaceholder,
    updatePlace,
    removePlannerVisit,
    move: onMove,
    updateDayLabel: onLabelChange,
    removeDay: onRemoveDay,
    reorderDays: onReorderDays,
    toggleVisited: onVisitedChange,
    updateDaySchedule: onDayScheduleChange,
    updateStopSchedule: onStopScheduleChange,
    updateLegMode: onLegModeChange,
    activityEvents,
  } = useTrip();
  const { t } = useI18n();
  const visitedPlaceIds = state.visitedPlaceIds;
  const onRenamePlaceholder = (place: Place, label: string) => updatePlace({ ...place, name: label });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activityOpened, setActivityOpened] = useState(false);
  const [pendingAccommodationAssignment, setPendingAccommodationAssignment] = useState<{
    place: Place;
    destination: { containerId: ContainerId; index: number };
    dayNumber: number;
    status: StayAssignmentStatus;
  } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activePlace = activeId?.startsWith('day:') ? undefined : activeId ? placesById.get(activeId) : undefined;
  const unscheduled = state.unscheduledIds.flatMap((id) => {
    const place = placesById.get(id);
    return place ? [place] : [];
  });
  const hotelPlaces = state.places.filter((place) => isAccommodation(place) && !place.assignmentOf);

  function dayDate(dayIndex: number) {
    const date = addDays(state.startDate, dayIndex);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function getDestination(overId: string): { containerId: ContainerId; index: number } | null {
    const dayId = overId.startsWith('day:') ? overId.slice(4) : overId;
    if (dayId === 'unscheduled' || state.days.some((day) => day.id === dayId)) {
      const containerId = dayId as ContainerId;
      return { containerId, index: getContainerItems(state, containerId).length };
    }

    const containerId = findContainer(state, overId);
    if (!containerId) return null;
    const index = getContainerItems(state, containerId).indexOf(overId);
    return { containerId, index: Math.max(0, index) };
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!event.over) return;

    const activeId = String(event.active.id);
    if (activeId.startsWith('day:')) {
      const activeDayId = activeId.slice(4);
      const overId = String(event.over.id);
      const overDayId = overId.startsWith('day:') ? overId.slice(4) : overId;
      const fromIndex = state.days.findIndex((day) => day.id === activeDayId);
      const toIndex = state.days.findIndex((day) => day.id === overDayId);
      if (fromIndex >= 0 && toIndex >= 0) onReorderDays(fromIndex, toIndex);
      return;
    }

    const overId = String(event.over.id);
    if (
      placesById.get(overId)?.type === 'placeholder'
      && placesById.get(activeId)?.type !== 'placeholder'
      && !isAccommodation(placesById.get(activeId)!)
    ) {
      onFillPlaceholder(overId, activeId);
      return;
    }

    const destination = getDestination(overId);
    if (!destination) return;
    const place = placesById.get(activeId);
    const dayIndex = state.days.findIndex((day) => day.id === destination.containerId);
    const isNewAccommodationAssignment = Boolean(
      place
      && isAccommodation(place)
      && !place.assignmentOf
      && state.unscheduledIds.includes(activeId)
      && !state.days.some((day) => day.placeIds.includes(activeId)),
    );
    if (place && isNewAccommodationAssignment && dayIndex >= 0) {
      const status = stayAssignmentStatus(place, dayDate(dayIndex));
      if (status !== 'valid') {
        setPendingAccommodationAssignment({ place, destination, dayNumber: dayIndex + 1, status });
        return;
      }
    }
    onMove(activeId, destination.containerId, destination.index);
  }

  return (
    <DndContext
      sensors={readOnly ? [] : sensors}
      collisionDetection={closestCorners}
      onDragStart={readOnly ? undefined : handleDragStart}
      onDragCancel={readOnly ? undefined : () => setActiveId(null)}
      onDragEnd={readOnly ? undefined : handleDragEnd}
    >
      <Stack gap="md" className="planner-board">
        <Group justify="space-between" align="flex-end">
          <div>
            <Text fw={800} size="lg">
              {t('itinerary')}
            </Text>
            <Text c="dimmed" size="sm">
              {t('itineraryHint')}
            </Text>
          </div>
          {!readOnly ? <Group gap="xs">
            <Button variant="default" leftSection={<IconHistory size={17} />} onClick={() => setActivityOpened(true)}>Activity</Button>
            <Button variant="light" color="teal" leftSection={<IconPlus size={17} />} onClick={onAddDay}>{t('addDay')}</Button>
          </Group> : null}
        </Group>

        <ScrollArea type="auto" offsetScrollbars className="board-scroll">
          <Group align="stretch" gap="md" wrap="nowrap" pb="sm">
            <UnscheduledColumn
              places={unscheduled}
              selectedId={selectedId}
              onSelect={onSelect}
              onEditPlace={onEditPlace}
              onDeletePlace={onDeletePlace}
              readOnly={readOnly}
            />
            <SortableContext items={state.days.map((day) => `day:${day.id}`)} strategy={horizontalListSortingStrategy}>
              {state.days.map((day, index) => (
                <DayColumn
                  key={day.id}
                  day={day}
                  index={index}
                  startDate={state.startDate}
                  places={day.placeIds.flatMap((id) => {
                    const place = placesById.get(id);
                    return place ? [place] : [];
                  })}
                  selectedId={selectedId}
                  visitedPlaceIds={visitedPlaceIds}
                  onSelect={onSelect}
                  onAddPlace={() => onAddPlaceToDay(day.id)}
                  onAddPlaceholder={(kind) => onAddPlaceholderToDay(day.id, kind)}
                  onReplacePlaceholder={onReplacePlaceholder}
                  onRenamePlaceholder={onRenamePlaceholder}
                  onLabelChange={onLabelChange}
                  onRemove={onRemoveDay}
                  onEditPlace={onEditPlace}
                  onDeletePlace={(place) => removePlannerVisit(place.id, day.id)}
                  onVisitedChange={onVisitedChange}
                  onDayScheduleChange={onDayScheduleChange}
                  onStopScheduleChange={onStopScheduleChange}
                  hotelPlaces={hotelPlaces}
                  tripHotelId={state.hotelPlaceId}
                  onLegModeChange={onLegModeChange}
                  readOnly={readOnly}
                />
              ))}
            </SortableContext>
          </Group>
        </ScrollArea>
      </Stack>

      <DragOverlay>{activePlace ? <PlaceCardPreview place={activePlace} /> : null}</DragOverlay>
      <TripActivityDrawer opened={activityOpened} onClose={() => setActivityOpened(false)} events={activityEvents} />
      <Modal
        opened={Boolean(pendingAccommodationAssignment)}
        onClose={() => setPendingAccommodationAssignment(null)}
        title="Assign accommodation outside stay dates?"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            {pendingAccommodationAssignment?.status === 'checked-out'
              ? `${pendingAccommodationAssignment.place.name} is checked out before Day ${pendingAccommodationAssignment.dayNumber}. Assign it anyway?`
              : pendingAccommodationAssignment?.status === 'before-check-in'
                ? `${pendingAccommodationAssignment.place.name} is not checked in yet for Day ${pendingAccommodationAssignment.dayNumber}. Assign it anyway?`
                : `${pendingAccommodationAssignment?.place.name ?? 'This accommodation'} has no check-in and check-out dates. Assign it to Day ${pendingAccommodationAssignment?.dayNumber ?? ''} anyway?`}
          </Text>
          <Text size="xs" c="dimmed">It remains in Unscheduled so you can reuse it on other days.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPendingAccommodationAssignment(null)}>Cancel</Button>
            <Button color="orange" onClick={() => {
              if (pendingAccommodationAssignment) {
                onMove(
                  pendingAccommodationAssignment.place.id,
                  pendingAccommodationAssignment.destination.containerId,
                  pendingAccommodationAssignment.destination.index,
                );
              }
              setPendingAccommodationAssignment(null);
            }}>
              Assign anyway
            </Button>
          </Group>
        </Stack>
      </Modal>
    </DndContext>
  );
}
