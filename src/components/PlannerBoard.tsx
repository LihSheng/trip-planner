import { useEffect, useRef, useState } from 'react';
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  pointerWithin,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Box, Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { ContainerId, PlaceholderKind, Place, StopSchedule, TravelMode, TripState } from '../types';
import { findContainer, getContainerItems } from '../utils/itinerary';
import { DayColumn } from './DayColumn';
import { DayRail, type DaySummary } from './DayRail';
import { TripOverview } from './TripOverview';
import { PlaceCardPreview } from './PlaceCard';
import { UnscheduledColumn } from './UnscheduledColumn';
import { useI18n } from '../i18n';
import { addDays } from '../utils/date';
import { isAccommodation, stayAssignmentStatus, type StayAssignmentStatus } from '../utils/stay';

import { useTrip } from '../context/TripContext';
import { showUndoableNotification } from '../lib/undoNotification';
import { TripActivityDrawer } from './TripActivityDrawer';
import { isPlaceholder } from '../domain/place';
import { DayTasksModal } from './DayTasksModal';
import { FlightBookingModal, StayBookingModal } from './BookingModals';
import type { FlightBooking, StayBooking } from '../types';
import type { PlannerBookingCard } from './BookingCard';

// Days are dragged from the rail (`day:<id>`) or the whole-trip cards (`overview:<id>`).
function isDayDragId(id: string) {
  return id.startsWith('day:') || id.startsWith('overview:');
}

function dayIdFromDragId(id: string) {
  return id.replace(/^(day|overview):/, '');
}

interface PlannerBoardProps {
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onEditActivity: (place: Place) => void;
  onDeletePlace: (place: Place) => void;
  onRequestRemoveDay?: (dayId: string) => void;
  onAddPlaceToDay: (dayId: string) => void;
  onReplacePlaceholder: (placeholderId: string) => void;
}

export function PlannerBoard({
  selectedId,
  onSelect,
  onEditActivity,
  onDeletePlace,
  onRequestRemoveDay,
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
    removeDay: removeDayDirect,
    reorderDays: onReorderDays,
    updateDaySchedule: onDayScheduleChange,
    updateStopSchedule: onStopScheduleChange,
    updateLegMode: onLegModeChange,
    activityEvents,
    addDayTask,
    updateDayTask,
    toggleDayTask,
    deleteDayTask,
    reorderDayTasks,
    saveFlightBooking,
    saveStayBooking,
    deleteFlightBooking,
    deleteStayBooking,
    markUndoPoint,
    undo,
  } = useTrip();
  const { t, locale } = useI18n();
  const zh = locale === 'zh-TW';
  const visitedPlaceIds = state.visitedPlaceIds;
  const onRenamePlaceholder = (place: Place, label: string) => updatePlace({ ...place, name: label });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activityOpened, setActivityOpened] = useState(false);
  // null shows the whole-trip overview; a day id shows that day for editing.
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [taskDayId, setTaskDayId] = useState<string | null>(null);
  const [flightDate, setFlightDate] = useState('');
  const [editingFlight, setEditingFlight] = useState<FlightBooking>();
  const [editingStay, setEditingStay] = useState<StayBooking>();
  const focusNewDayRef = useRef(false);
  const previousDayCountRef = useRef(state.days.length);
  const [pendingAccommodationAssignment, setPendingAccommodationAssignment] = useState<{
    place: Place;
    destination: { containerId: ContainerId; index: number };
    dayNumber: number;
    status: StayAssignmentStatus;
  } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Handle-less overview cards start touch drags on press-and-hold so a swipe still scrolls the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activePlace = activeId && !isDayDragId(activeId) ? placesById.get(activeId) : undefined;
  const unscheduled = state.unscheduledIds.flatMap((id) => {
    const place = placesById.get(id);
    return place ? [place] : [];
  });
  const hotelPlaces = state.places.filter((place) => isAccommodation(place) && !place.assignmentOf);

  useEffect(() => {
    if (focusNewDayRef.current && state.days.length > previousDayCountRef.current) {
      const newDay = state.days[state.days.length - 1];
      setSelectedDayId(newDay.id);
      focusNewDayRef.current = false;
    }
    previousDayCountRef.current = state.days.length;
  }, [state.days.length]);

  useEffect(() => {
    if (selectedDayId && !state.days.some((day) => day.id === selectedDayId)) setSelectedDayId(null);
  }, [selectedDayId, state.days]);

  function dayDate(dayIndex: number) {
    const date = addDays(state.startDate, dayIndex);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  const moveTargets = [
    ...state.days.map((day, index) => ({ id: day.id, label: day.label.trim() || t('day', { number: index + 1 }) })),
    { id: 'unscheduled', label: t('unscheduled') },
  ];
  const onMoveToPlace = (placeId: string, containerId: string) => {
    const place = placesById.get(placeId);
    if (!place) return;
    requestStayCheckOrMove(place, { containerId: containerId as ContainerId, index: getContainerItems(state, containerId as ContainerId).length });
  };

  function bookingCardsFor(date: string): PlannerBookingCard[] {
    const stayCards = (state.stayBookings ?? []).flatMap((booking: StayBooking) => {
      const hotel = placesById.get(booking.placeId);
      if (!hotel) return [];
      if (booking.checkInDate === date) return [{ id: `stay-in:${booking.id}`, kind: 'stay' as const, sourceId: booking.id, title: hotel.name, label: zh ? '入住' : 'Check in', detail: `${booking.checkInDate} → ${booking.checkOutDate}`, cost: booking.cost }];
      if (booking.checkOutDate === date) return [{ id: `stay-out:${booking.id}`, kind: 'stay' as const, sourceId: booking.id, title: hotel.name, label: zh ? '退房' : 'Check out', detail: zh ? '費用已包含於住宿訂單' : 'Cost included in stay booking' }];
      return [];
    });
    const flightCards = (state.flightBookings ?? []).flatMap((booking) => {
      const legs = [{ leg: booking.outbound, outbound: true }, ...(booking.return ? [{ leg: booking.return, outbound: false }] : [])];
      return legs.flatMap(({ leg, outbound }) => leg.departureDate === date ? [{
        id: `flight:${booking.id}:${outbound ? 'out' : 'return'}`,
        kind: 'flight' as const,
        sourceId: booking.id,
        title: `${leg.departureAirport} → ${leg.arrivalAirport}`,
        label: outbound ? (booking.tripType === 'round-trip' ? (zh ? '去程' : 'Outbound') : (zh ? '航班' : 'Flight')) : (zh ? '回程' : 'Return'),
        detail: `${leg.airline}${leg.flightNumber ? ` ${leg.flightNumber}` : ''} · ${leg.departureTime} → ${leg.arrivalTime}${leg.arrivalDate > leg.departureDate ? (zh ? ' · 隔日抵達' : ' · +1 day') : ''}${!outbound ? (zh ? ' · 已包含於來回訂單' : ' · Included in round-trip booking') : ''}`,
        cost: outbound ? booking.totalCost : undefined,
      }] : []);
    });
    return [...stayCards, ...flightCards];
  }

  function getDestination(overId: string): { containerId: ContainerId; index: number } | null {
    const dayId = overId.startsWith('day:') ? overId.slice(4) : overId.startsWith('overview:') ? overId.slice(9) : overId;
    if (dayId === 'unscheduled' || state.days.some((day) => day.id === dayId)) {
      const containerId = dayId as ContainerId;
      return { containerId, index: getContainerItems(state, containerId).length };
    }

    const containerId = findContainer(state, overId);
    if (!containerId) return null;
    const index = getContainerItems(state, containerId).indexOf(overId);
    return { containerId, index: Math.max(0, index) };
  }

  function requestStayCheckOrMove(place: Place, destination: { containerId: ContainerId; index: number }) {
    const dayIndex = state.days.findIndex((day) => day.id === destination.containerId);
    const isNewAccommodationAssignment = Boolean(
      isAccommodation(place)
      && !place.assignmentOf
      && state.unscheduledIds.includes(place.id)
      && !state.days.some((day) => day.placeIds.includes(place.id)),
    );
    if (isNewAccommodationAssignment && dayIndex >= 0) {
      const status = stayAssignmentStatus(place, dayDate(dayIndex));
      if (status !== 'valid') {
        setPendingAccommodationAssignment({ place, destination, dayNumber: dayIndex + 1, status });
        return;
      }
    }
    moveWithUndo(place.id, destination.containerId, destination.index);
  }

  function moveWithUndo(placeId: string, containerId: ContainerId, index: number) {
    if (findContainer(state, placeId) === containerId && getContainerItems(state, containerId).indexOf(placeId) === index) return;
    markUndoPoint(t('movedStop'));
    onMove(placeId, containerId, index);
    showUndoableNotification({ title: t('movedStop'), message: t('movedStopMessage', { name: placesById.get(placeId)?.name ?? '' }), onUndo: undo, t });
  }

  // Days can only land on other days in the rail. Places use whatever is under the pointer, so the
  // rail, overview cards and the open day all work as drop targets; closest corners covers the gaps.
  const collisionDetection: CollisionDetection = (args) => {
    if (String(args.active.id).startsWith('day:')) {
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((container) => String(container.id).startsWith('day:')) });
    }
    if (String(args.active.id).startsWith('overview:')) {
      // Cards land on other cards or rail rows: whatever is under the pointer, else the nearest one.
      const dayTargets = args.droppableContainers.filter((container) => /^(overview|day):/.test(String(container.id)));
      const underPointer = pointerWithin({ ...args, droppableContainers: dayTargets });
      return underPointer.length ? underPointer : closestCenter({ ...args, droppableContainers: dayTargets });
    }
    const underPointer = pointerWithin(args);
    return underPointer.length ? underPointer : closestCorners(args);
  };

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!event.over) return;

    const activeId = String(event.active.id);
    if (isDayDragId(activeId)) {
      const activeDayId = dayIdFromDragId(activeId);
      const overDayId = dayIdFromDragId(String(event.over.id));
      const fromIndex = state.days.findIndex((day) => day.id === activeDayId);
      const toIndex = state.days.findIndex((day) => day.id === overDayId);
      if (fromIndex >= 0 && toIndex >= 0) onReorderDays(fromIndex, toIndex);
      return;
    }

    const overId = String(event.over.id);
    const overPlace = placesById.get(overId);
    const activePlace = placesById.get(activeId);
    if (
      overPlace && isPlaceholder(overPlace)
      && activePlace && !isPlaceholder(activePlace)
      && !isAccommodation(activePlace)
    ) {
      onFillPlaceholder(overId, activeId);
      return;
    }

    const destination = getDestination(overId);
    if (!destination) return;
    const place = placesById.get(activeId);
    if (place) {
      requestStayCheckOrMove(place, destination);
      return;
    }
    moveWithUndo(activeId, destination.containerId, destination.index);
  }

  const summaries: Record<string, DaySummary> = Object.fromEntries(state.days.map((day) => [day.id, {
    stopCount: day.placeIds.length,
    visitedCount: day.placeIds.filter((id) => visitedPlaceIds.includes(id)).length,
    openTaskCount: (state.dayTasks ?? []).filter((task) => task.dayId === day.id && !task.completed).length,
  }]));
  const lodgingLabels: Record<string, string | undefined> = Object.fromEntries(state.days.map((day, index) => [day.id, lodgingLabelFor(index)]));
  const selectedDayIndex = state.days.findIndex((day) => day.id === selectedDayId);
  const selectedDay = selectedDayIndex >= 0 ? state.days[selectedDayIndex] : undefined;

  function lodgingLabelFor(dayIndex: number) {
    const booking = (state.stayBookings ?? []).find((item) => item.checkInDate <= dayDate(dayIndex) && item.checkOutDate > dayDate(dayIndex));
    return booking ? placesById.get(booking.placeId)?.name : undefined;
  }

  return (
    <DndContext
      sensors={readOnly ? [] : sensors}
      collisionDetection={collisionDetection}
      onDragStart={readOnly ? undefined : handleDragStart}
      onDragCancel={readOnly ? undefined : () => setActiveId(null)}
      onDragEnd={readOnly ? undefined : handleDragEnd}
    >
      <Box className="planner-board planner-focus">
        <SortableContext items={state.days.map((day) => `day:${day.id}`)} strategy={verticalListSortingStrategy}>
          <DayRail
            days={state.days}
            startDate={state.startDate}
            summaries={summaries}
            selectedDayId={selectedDay ? selectedDay.id : null}
            readOnly={readOnly}
            onSelect={setSelectedDayId}
            onAddDay={() => { focusNewDayRef.current = true; onAddDay(); }}
            onOpenActivity={() => setActivityOpened(true)}
          />
        </SortableContext>

        <Box className="planner-focus__main">
          {selectedDay ? (
            <DayColumn
              key={selectedDay.id}
              day={selectedDay}
              index={selectedDayIndex}
              startDate={state.startDate}
              places={selectedDay.placeIds.flatMap((id) => {
                const place = placesById.get(id);
                return place ? [place] : [];
              })}
              selectedId={selectedId}
              visitedPlaceIds={visitedPlaceIds}
              onSelect={onSelect}
              onAddPlace={() => onAddPlaceToDay(selectedDay.id)}
              onAddPlaceholder={(kind) => onAddPlaceholderToDay(selectedDay.id, kind)}
              onReplacePlaceholder={onReplacePlaceholder}
              onRenamePlaceholder={onRenamePlaceholder}
              onLabelChange={onLabelChange}
              onRemove={onRequestRemoveDay ?? removeDayDirect}
              onEditActivity={onEditActivity}
              onDeletePlace={(place) => removePlannerVisit(place.id, selectedDay.id)}
              onDayScheduleChange={onDayScheduleChange}
              onStopScheduleChange={onStopScheduleChange}
              hotelPlaces={hotelPlaces}
              tripHotelId={state.hotelPlaceId}
              onLegModeChange={onLegModeChange}
              clusters={state.locationClusters}
              tasks={(state.dayTasks ?? []).filter((task) => task.dayId === selectedDay.id)}
              onOpenTasks={setTaskDayId}
              bookingCards={bookingCardsFor(dayDate(selectedDayIndex))}
              lodgingLabel={lodgingLabels[selectedDay.id]}
              onEditBooking={(card) => {
                if (card.kind === 'flight') {
                  setEditingFlight(state.flightBookings?.find((booking) => booking.id === card.sourceId));
                  setFlightDate(dayDate(selectedDayIndex));
                } else {
                  setEditingStay(state.stayBookings?.find((booking) => booking.id === card.sourceId));
                }
              }}
              onAddFlight={() => { setEditingFlight(undefined); setFlightDate(dayDate(selectedDayIndex)); }}
              readOnly={readOnly}
              moveTargets={moveTargets}
              onMoveToPlace={readOnly ? undefined : onMoveToPlace}
            />
          ) : (
            <Stack gap="md">
              <div>
                <Text fw={800} size="xl">{state.tripName}</Text>
                <Text c="dimmed" size="sm">{t('wholeTripSummary', { days: state.days.length, stops: state.days.reduce((total, day) => total + day.placeIds.length, 0) })}</Text>
              </div>
              <SortableContext items={state.days.map((day) => `overview:${day.id}`)} strategy={rectSortingStrategy}>
                <TripOverview
                  days={state.days}
                  startDate={state.startDate}
                  placesById={placesById}
                  lodgingLabels={lodgingLabels}
                  readOnly={readOnly}
                  onOpenDay={setSelectedDayId}
                />
              </SortableContext>
            </Stack>
          )}
        </Box>

        <UnscheduledColumn
          places={unscheduled}
          selectedId={selectedId}
          onSelect={onSelect}
          onEditActivity={onEditActivity}
          onDeletePlace={onDeletePlace}
          clusters={state.locationClusters}
          readOnly={readOnly}
          moveTargets={moveTargets}
          onMoveToPlace={readOnly ? undefined : onMoveToPlace}
        />
      </Box>

      <DragOverlay>{activePlace ? <PlaceCardPreview place={activePlace} /> : null}</DragOverlay>
      <TripActivityDrawer opened={activityOpened} onClose={() => setActivityOpened(false)} events={activityEvents} />
      <DayTasksModal
        opened={Boolean(taskDayId)}
        dayLabel={(() => {
          const index = state.days.findIndex((day) => day.id === taskDayId);
          if (index < 0) return 'Day';
          return state.days[index].label.trim() || `Day ${index + 1}`;
        })()}
        tasks={(state.dayTasks ?? []).filter((task) => task.dayId === taskDayId)}
        readOnly={readOnly}
        onClose={() => setTaskDayId(null)}
        onAdd={(text) => taskDayId && addDayTask(taskDayId, text)}
        onUpdate={updateDayTask}
        onToggle={toggleDayTask}
        onDelete={deleteDayTask}
        onReorder={(activeId, overId) => taskDayId && reorderDayTasks(taskDayId, activeId, overId)}
      />
      <FlightBookingModal
        opened={Boolean(flightDate)}
        booking={editingFlight}
        defaultDate={flightDate}
        defaultCurrency={state.displayCurrency ?? 'MYR'}
        onClose={() => { setFlightDate(''); setEditingFlight(undefined); }}
        onSave={saveFlightBooking}
        onDelete={deleteFlightBooking}
      />
      <StayBookingModal
        opened={Boolean(editingStay)}
        booking={editingStay}
        hotels={hotelPlaces}
        defaultCurrency={state.displayCurrency ?? 'MYR'}
        onClose={() => setEditingStay(undefined)}
        onSave={saveStayBooking}
        onDelete={deleteStayBooking}
      />
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
                moveWithUndo(
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
