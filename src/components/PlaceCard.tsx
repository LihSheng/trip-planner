import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ActionIcon,
  Badge,
  Box,
  Checkbox,
  Group,
  Menu,
  NumberInput,
  Paper,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconAlertTriangle, IconClock, IconCoffee, IconDotsVertical, IconEdit, IconGripVertical, IconMapPin, IconPencil, IconRoute, IconSun, IconToolsKitchen, IconTrash } from '@tabler/icons-react';
import type { Place, PlaceCategory, StopSchedule } from '../types';
import { categoryLabel, useI18n } from '../i18n';

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
  schedule?: StopSchedule;
  travelMinutes?: number;
  warnings?: string[];
  onScheduleChange?: (updates: StopSchedule) => void;
  onEnableSchedule?: () => void;
  onReplace?: (placeId: string) => void;
  onRename?: (place: Place) => void;
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
  schedule,
  travelMinutes,
  warnings = [],
  onScheduleChange,
  onEnableSchedule,
  onReplace,
  onRename,
}: PlaceCardProps) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: place.id,
    disabled: dragDisabled,
  });
  const isPlaceholder = place.type === 'placeholder';
  const presetPlaceholderLabel = place.placeholderKind === 'meal' ? t('lunchDinner') : place.placeholderKind === 'coffee' ? t('coffeeBreak') : place.placeholderKind === 'free-time' ? t('freeTime') : t('customStop');
  const placeholderLabel = place.name === place.placeholderKind ? presetPlaceholderLabel : place.name;
  const PlaceholderIcon = place.placeholderKind === 'meal' ? IconToolsKitchen : place.placeholderKind === 'coffee' ? IconCoffee : IconSun;

  return (
    <Paper
      ref={setNodeRef}
      withBorder
      radius="md"
      p="sm"
      className={`place-card${dragDisabled ? '' : ' place-card--draggable'}${isPlaceholder ? ' place-card--placeholder' : ''}`}
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
        {onVisitedChange && !isPlaceholder ? (
          <Checkbox
            checked={visited}
            onChange={() => onVisitedChange(place.id)}
            aria-label={t('markVisited', { name: place.name })}
            className="place-card__visited"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          />
        ) : null}
        {isPlaceholder ? <PlaceholderIcon size={18} color="var(--mantine-color-orange-6)" /> : <Box className={`place-card__accent place-card__accent--${place.category.toLowerCase()}`} />}

        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
            <Text fw={650} size="sm" lineClamp={1} className={visited ? 'place-card__name--visited' : undefined}>
              {isPlaceholder ? placeholderLabel : place.name}
            </Text>
            {(onEdit || onDelete || onEnableSchedule || onReplace || onRename) && (
              <Menu position="bottom-end" withinPortal shadow="md">
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={t('actionsFor', { name: place.name })}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <IconDotsVertical size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
                  {onRename ? <Menu.Item leftSection={<IconPencil size={15} />} onClick={() => onRename(place)}>{t('renamePlannedStop')}</Menu.Item> : null}
                  {onReplace ? (
                    <Menu.Item leftSection={<IconMapPin size={15} />} onClick={() => onReplace(place.id)}>
                      {t('choosePlace')}
                    </Menu.Item>
                  ) : onEdit ? (
                    <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => onEdit(place)}>
                      {t('editPlace')}
                    </Menu.Item>
                  ) : null}
                  {onEnableSchedule && !schedule ? (
                    <Menu.Item leftSection={<IconClock size={15} />} onClick={onEnableSchedule}>
                      Add time
                    </Menu.Item>
                  ) : null}
                  {onDelete && (
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={15} />}
                      onClick={() => onDelete(place)}
                    >
                      {t('deletePlace')}
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
          {!isPlaceholder ? <Group gap={5} wrap="nowrap">
            <IconMapPin size={13} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed" lineClamp={1}>
              {place.region}
            </Text>
          </Group> : null}
          {!isPlaceholder ? <Badge color={categoryColors[place.category]} variant="light" size="xs">
            {categoryLabel(t, place.category)}
          </Badge> : null}
          {schedule && onScheduleChange ? (
            <Box
              mt={2}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              {travelMinutes ? (
                <Group gap={4} mb={4}>
                  <IconRoute size={13} color="var(--mantine-color-dimmed)" />
                  <Text size="xs" c="dimmed">~{travelMinutes} min travel</Text>
                </Group>
              ) : null}
              <Group gap={6} wrap="nowrap">
                <TextInput
                  type="time"
                  size="xs"
                  value={schedule.startTime ?? ''}
                  placeholder="09:00"
                  aria-label={`Start time for ${place.name}`}
                  onChange={(event) => onScheduleChange({ startTime: event.currentTarget.value || undefined })}
                  styles={{ input: { minWidth: 96 } }}
                />
                <NumberInput
                  size="xs"
                  min={5}
                  max={720}
                  suffix=" min"
                  value={schedule.durationMinutes ?? ''}
                  aria-label={`Duration for ${place.name}`}
                  onChange={(value) => onScheduleChange({ durationMinutes: typeof value === 'number' ? value : undefined })}
                  styles={{ input: { minWidth: 92 } }}
                />
              </Group>
              {warnings.length ? (
                <Group gap={4} mt={4}>
                  <IconAlertTriangle size={14} color="var(--mantine-color-orange-6)" />
                  <Text size="xs" c="orange" lineClamp={1}>{warnings.join(' · ')}</Text>
                </Group>
              ) : null}
            </Box>
          ) : null}
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
