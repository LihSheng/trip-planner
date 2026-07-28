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
import { isPlaceholder } from '../domain/place';
import { DayTasksModal } from './DayTasksModal';
import { FlightBookingModal, StayBookingModal } from './BookingModals';
import type { FlightBooking, StayBooking } from '../types';
import type { PlannerBookingCard } from './BookingCard';

interface PlannerBoardProps {
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onEditActivity: (place: Place) => void;
  onDeletePlace: (place: Place) => void;
  onAddPlaceToDay: (dayId: string) => void;
  onReplacePlaceholder: (placeholderId: string) => void;
}

export function PlannerBoard({
  selectedId,
  onSelect,
  onEditActivity,
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
    addDayTask,
    updateDayTask,
    toggleDayTask,
    deleteDayTask,
    reorderDayTasks,
    saveFlightBooking,
    saveStayBooking,
    deleteFlightBooking,
    deleteStayBooking,
  } = useTrip();
  const { t, locale } = useI18n();
  const zh = locale === 'zh-TW';
  const visitedPlaceIds = state.visitedPlaceIds;
  const onRenamePlaceholder = (place: Place, label: string) => updatePlace({ ...place, name: label });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activityOpened, setActivityOpened] = useState(false);
  const [taskDayId, setTaskDayId] = useState<string | null>(null);
  const [flightDate, setFlightDate] = useState('');
  const [editingFlight, setEditingFlight] = useState<FlightBooking>();
  const [editingStay, setEditingStay] = useState<StayBooking>();
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
              onEditActivity={onEditActivity}
              onDeletePlace={onDeletePlace}
              clusters={state.locationClusters}
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
                  onEditActivity={onEditActivity}
                  onDeletePlace={(place) => removePlannerVisit(place.id, day.id)}
                  onVisitedChange={onVisitedChange}
                  onDayScheduleChange={onDayScheduleChange}
                  onStopScheduleChange={onStopScheduleChange}
                  hotelPlaces={hotelPlaces}
                  tripHotelId={state.hotelPlaceId}
                  onLegModeChange={onLegModeChange}
                  clusters={state.locationClusters}
                  tasks={(state.dayTasks ?? []).filter((task) => task.dayId === day.id)}
                  onOpenTasks={setTaskDayId}
                  bookingCards={bookingCardsFor(dayDate(index))}
                  lodgingLabel={(() => {
                    const booking = (state.stayBookings ?? []).find((item) => item.checkInDate <= dayDate(index) && item.checkOutDate > dayDate(index));
                    return booking ? placesById.get(booking.placeId)?.name : undefined;
                  })()}
                  onEditBooking={(card) => {
                    if (card.kind === 'flight') {
                      setEditingFlight(state.flightBookings?.find((booking) => booking.id === card.sourceId));
                      setFlightDate(dayDate(index));
                    } else {
                      setEditingStay(state.stayBookings?.find((booking) => booking.id === card.sourceId));
                    }
                  }}
                  onAddFlight={() => { setEditingFlight(undefined); setFlightDate(dayDate(index)); }}
                  readOnly={readOnly}
                />
              ))}
            </SortableContext>
          </Group>
        </ScrollArea>
      </Stack>

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
