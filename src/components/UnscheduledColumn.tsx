import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ActionIcon, Badge, Box, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconInbox } from '@tabler/icons-react';
import type { Place } from '../types';
import { PlaceCard } from './PlaceCard';

interface UnscheduledColumnProps {
  places: Place[];
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onEditPlace: (place: Place) => void;
  onDeletePlace: (place: Place) => void;
}

export function UnscheduledColumn({
  places,
  selectedId,
  onSelect,
  onEditPlace,
  onDeletePlace,
}: UnscheduledColumnProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled' });

  return (
    <Paper
      ref={setNodeRef}
      withBorder
      radius="lg"
      className="day-column day-column--unscheduled"
      data-over={isOver || undefined}
    >
      <Box
        className="day-column__header day-column__header--unscheduled"
        onClick={() => setCollapsed((value) => !value)}
      >
        <Group justify="space-between">
          <Group gap="xs">
            <IconInbox size={17} />
            <Text fw={750} size="sm">
              Unscheduled
            </Text>
          </Group>
          <Group gap={2} wrap="nowrap">
            <Badge variant="light" color="gray">
              {collapsed ? `${places.length} spots` : places.length}
            </Badge>
            <Tooltip label={collapsed ? 'Expand unscheduled places' : 'Collapse unscheduled places'}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={collapsed ? 'Expand unscheduled places' : 'Collapse unscheduled places'}
                onClick={(event) => {
                  event.stopPropagation();
                  setCollapsed((value) => !value);
                }}
              >
                {collapsed ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        {!collapsed ? (
          <Text size="xs" c="dimmed" mt={4}>
            Ideas ready to be placed into a day
          </Text>
        ) : null}
      </Box>

      {!collapsed ? (
        <SortableContext items={places.map((place) => place.id)} strategy={verticalListSortingStrategy}>
          <Stack gap="xs" p="sm" className="day-column__body">
            {places.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                selected={selectedId === place.id}
                onSelect={onSelect}
                onEdit={onEditPlace}
                onDelete={onDeletePlace}
              />
            ))}
            {places.length === 0 && (
              <Box className="drop-placeholder">
                <Text size="xs" c="dimmed" ta="center">
                  Drop places here to plan them later
                </Text>
              </Box>
            )}
          </Stack>
        </SortableContext>
      ) : null}
    </Paper>
  );
}
