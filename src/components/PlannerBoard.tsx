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
import { Button, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { ContainerId, Place, StopSchedule, TravelMode, TripState } from '../types';
import { findContainer, getContainerItems } from '../utils/itinerary';
import { DayColumn } from './DayColumn';
import { PlaceCardPreview } from './PlaceCard';
import { UnscheduledColumn } from './UnscheduledColumn';
import { useI18n } from '../i18n';

interface PlannerBoardProps {
  state: TripState;
  placesById: Map<string, Place>;
  selectedId: string | null;
  visitedPlaceIds: string[];
  onSelect: (placeId: string) => void;
  onAddDay: () => void;
  onAddPlaceToDay: (dayId: string) => void;
  onMove: (placeId: string, destinationId: ContainerId, destinationIndex: number) => void;
  onLabelChange: (dayId: string, label: string) => void;
  onRemoveDay: (dayId: string) => void;
  onReorderDays: (fromIndex: number, toIndex: number) => void;
  onVisitedChange: (placeId: string) => void;
  onDayScheduleChange: (dayId: string, updates: { travelMode?: TravelMode; startTime?: string; lodgingPlaceId?: string; timeManagementEnabled?: boolean }) => void;
  onStopScheduleChange: (dayId: string, placeId: string, updates: StopSchedule) => void;
  onEditPlace: (place: Place) => void;
  onDeletePlace: (place: Place) => void;
}

export function PlannerBoard({
  state,
  placesById,
  selectedId,
  visitedPlaceIds,
  onSelect,
  onAddDay,
  onAddPlaceToDay,
  onMove,
  onLabelChange,
  onRemoveDay,
  onReorderDays,
  onVisitedChange,
  onDayScheduleChange,
  onStopScheduleChange,
  onEditPlace,
  onDeletePlace,
}: PlannerBoardProps) {
  const { t } = useI18n();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activePlace = activeId?.startsWith('day:') ? undefined : activeId ? placesById.get(activeId) : undefined;
  const unscheduled = state.unscheduledIds.flatMap((id) => {
    const place = placesById.get(id);
    return place ? [place] : [];
  });
  const hotelPlaces = state.places.filter((place) => place.type === 'hotel');

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

    const destination = getDestination(String(event.over.id));
    if (!destination) return;
    onMove(activeId, destination.containerId, destination.index);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
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
          <Button variant="light" color="teal" leftSection={<IconPlus size={17} />} onClick={onAddDay}>
            {t('addDay')}
          </Button>
        </Group>

        <ScrollArea type="auto" offsetScrollbars className="board-scroll">
          <Group align="stretch" gap="md" wrap="nowrap" pb="sm">
            <UnscheduledColumn
              places={unscheduled}
              selectedId={selectedId}
              onSelect={onSelect}
              onEditPlace={onEditPlace}
              onDeletePlace={onDeletePlace}
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
                  onLabelChange={onLabelChange}
                  onRemove={onRemoveDay}
                  onEditPlace={onEditPlace}
                  onDeletePlace={onDeletePlace}
                  onVisitedChange={onVisitedChange}
                  onDayScheduleChange={onDayScheduleChange}
                  onStopScheduleChange={onStopScheduleChange}
                  hotelPlaces={hotelPlaces}
                  tripHotelId={state.hotelPlaceId}
                />
              ))}
            </SortableContext>
          </Group>
        </ScrollArea>
      </Stack>

      <DragOverlay>{activePlace ? <PlaceCardPreview place={activePlace} /> : null}</DragOverlay>
    </DndContext>
  );
}
