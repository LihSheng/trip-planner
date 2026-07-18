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
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Button, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { ContainerId, Place, TripState } from '../types';
import { findContainer, getContainerItems } from '../utils/itinerary';
import { DayColumn } from './DayColumn';
import { PlaceCardPreview } from './PlaceCard';
import { UnscheduledColumn } from './UnscheduledColumn';

interface PlannerBoardProps {
  state: TripState;
  placesById: Map<string, Place>;
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onAddDay: () => void;
  onMove: (placeId: string, destinationId: ContainerId, destinationIndex: number) => void;
  onLabelChange: (dayId: string, label: string) => void;
  onRemoveDay: (dayId: string) => void;
  onEditPlace: (place: Place) => void;
  onDeletePlace: (place: Place) => void;
}

export function PlannerBoard({
  state,
  placesById,
  selectedId,
  onSelect,
  onAddDay,
  onMove,
  onLabelChange,
  onRemoveDay,
  onEditPlace,
  onDeletePlace,
}: PlannerBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activePlace = activeId ? placesById.get(activeId) : undefined;
  const unscheduled = state.unscheduledIds.flatMap((id) => {
    const place = placesById.get(id);
    return place ? [place] : [];
  });

  function getDestination(overId: string): { containerId: ContainerId; index: number } | null {
    if (overId === 'unscheduled' || state.days.some((day) => day.id === overId)) {
      const containerId = overId as ContainerId;
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
    const destination = getDestination(String(event.over.id));
    if (!destination) return;
    onMove(String(event.active.id), destination.containerId, destination.index);
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
              Itinerary
            </Text>
            <Text c="dimmed" size="sm">
              Drag places between days to shape your route.
            </Text>
          </div>
          <Button variant="light" color="teal" leftSection={<IconPlus size={17} />} onClick={onAddDay}>
            Add day
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
                onSelect={onSelect}
                onLabelChange={onLabelChange}
                onRemove={onRemoveDay}
                onEditPlace={onEditPlace}
                onDeletePlace={onDeletePlace}
              />
            ))}
          </Group>
        </ScrollArea>
      </Stack>

      <DragOverlay>{activePlace ? <PlaceCardPreview place={activePlace} /> : null}</DragOverlay>
    </DndContext>
  );
}
