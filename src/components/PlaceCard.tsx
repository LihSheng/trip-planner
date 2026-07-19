import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ActionIcon,
  Badge,
  Box,
  Checkbox,
  Group,
  Menu,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import { IconDotsVertical, IconEdit, IconGripVertical, IconMapPin, IconTrash } from '@tabler/icons-react';
import type { Place, PlaceCategory } from '../types';

const categoryColors: Record<PlaceCategory, string> = {
  Landmark: 'orange',
  Food: 'red',
  Nature: 'green',
  Culture: 'violet',
  Shopping: 'blue',
  Relaxation: 'cyan',
};

interface PlaceCardProps {
  place: Place;
  selected?: boolean;
  dragDisabled?: boolean;
  onSelect?: (placeId: string) => void;
  onEdit?: (place: Place) => void;
  onDelete?: (place: Place) => void;
  visited?: boolean;
  onVisitedChange?: (placeId: string) => void;
}

export function PlaceCard({
  place,
  selected = false,
  dragDisabled = false,
  onSelect,
  onEdit,
  onDelete,
  visited = false,
  onVisitedChange,
}: PlaceCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: place.id,
    disabled: dragDisabled,
  });

  return (
    <Paper
      ref={setNodeRef}
      withBorder
      radius="md"
      p="sm"
      className={`place-card${dragDisabled ? '' : ' place-card--draggable'}`}
      data-selected={selected || undefined}
      data-dragging={isDragging || undefined}
      data-visited={visited || undefined}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        touchAction: dragDisabled ? undefined : 'none',
      }}
      onClick={() => onSelect?.(place.id)}
    >
      <Group align="flex-start" gap="xs" wrap="nowrap">
        {onVisitedChange ? (
          <Checkbox
            checked={visited}
            onChange={() => onVisitedChange(place.id)}
            aria-label={`Mark ${place.name} as visited`}
            className="place-card__visited"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          />
        ) : null}
        <Box className={`place-card__accent place-card__accent--${place.category.toLowerCase()}`} />

        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
            <Text fw={650} size="sm" lineClamp={1} className={visited ? 'place-card__name--visited' : undefined}>
              {place.name}
            </Text>
            {(onEdit || onDelete) && (
              <Menu position="bottom-end" withinPortal shadow="md">
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={`Actions for ${place.name}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <IconDotsVertical size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
                  {onEdit && (
                    <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => onEdit(place)}>
                      Edit place
                    </Menu.Item>
                  )}
                  {onDelete && (
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={15} />}
                      onClick={() => onDelete(place)}
                    >
                      Delete place
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
          <Group gap={5} wrap="nowrap">
            <IconMapPin size={13} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed" lineClamp={1}>
              {place.region}
            </Text>
          </Group>
          <Badge color={categoryColors[place.category]} variant="light" size="xs">
            {place.category}
          </Badge>
        </Stack>
      </Group>
    </Paper>
  );
}

export function PlaceCardPreview({ place }: { place: Place }) {
  return (
    <Paper withBorder radius="md" p="sm" shadow="lg" className="place-card place-card--preview">
      <Group gap="xs" wrap="nowrap">
        <IconGripVertical size={16} color="var(--mantine-color-dimmed)" />
        <Stack gap={2}>
          <Text fw={650} size="sm">
            {place.name}
          </Text>
          <Text size="xs" c="dimmed">
            {place.region}
          </Text>
        </Stack>
      </Group>
    </Paper>
  );
}
