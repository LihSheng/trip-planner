import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Menu,
  NumberInput,
  Paper,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAlertTriangle, IconBed, IconBuildingCommunity, IconBuildingMonument, IconBus, IconClock, IconCoffee, IconDotsVertical, IconEdit, IconGripVertical, IconLeaf, IconMapPin, IconPalette, IconPencil, IconPlane, IconRobot, IconRoute, IconShoppingBag, IconSun, IconToolsKitchen, IconTrain, IconTrash, IconTree } from '@tabler/icons-react';
import type { ClusterRelationship, Place, PlaceCategory, StopSchedule } from '../types';
import { categoryLabel, useI18n } from '../i18n';
import { isStayExpired } from '../utils/stay';
import { isPlaceholder } from '../domain/place';

const categoryColors: Record<PlaceCategory, string> = {
  Landmark: 'orange',
  Food: 'red',
  Nature: 'green',
  Culture: 'violet',
  Shopping: 'blue',
  Relaxation: 'cyan',
  Accommodation: 'indigo',
  Airport: 'gray',
  Station: 'lime',
  Transit: 'yellow',
};

const categoryIcons: Record<PlaceCategory, typeof IconTree> = {
  Landmark: IconBuildingMonument,
  Food: IconToolsKitchen,
  Nature: IconTree,
  Culture: IconPalette,
  Shopping: IconShoppingBag,
  Relaxation: IconLeaf,
  Accommodation: IconBed,
  Airport: IconPlane,
  Station: IconTrain,
  Transit: IconBus,
};

interface PlaceCardProps {
  place: Place;
  selected?: boolean;
  dragDisabled?: boolean;
  unscheduled?: boolean;
  currentContainerId?: string;
  moveTargets?: { id: string; label: string }[];
  onMoveTo?: (containerId: string) => void;
  onSelect?: (placeId: string) => void;
  onEdit?: (place: Place) => void;
  editLabel?: string;
  onDelete?: (place: Place) => void;
  visited?: boolean;
  schedule?: StopSchedule;
  travelMinutes?: number;
  warnings?: string[];
  onScheduleChange?: (updates: StopSchedule) => void;
  onEnableSchedule?: () => void;
  onReplace?: (placeId: string) => void;
  onRename?: (place: Place) => void;
  clusterLabel?: string;
  clusterRelationship?: ClusterRelationship | 'anchor';
}

export function PlaceCard({
  place,
  selected = false,
  dragDisabled = false,
  unscheduled = false,
  currentContainerId,
  moveTargets,
  onMoveTo,
  onSelect,
  onEdit,
  editLabel = 'Edit place details',
  onDelete,
  visited = false,
  schedule,
  travelMinutes,
  warnings = [],
  onScheduleChange,
  onEnableSchedule,
  onReplace,
  onRename,
  clusterLabel,
  clusterRelationship,
}: PlaceCardProps) {
  const { t } = useI18n();
  const isMobile = useMediaQuery('(max-width: 47.99em)');
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: place.id,
    disabled: dragDisabled,
  });
  const placeholder = isPlaceholder(place);
  const stayExpired = isStayExpired(place);
  const presetPlaceholderLabel = place.placeholderKind === 'meal' ? t('lunchDinner') : place.placeholderKind === 'coffee' ? t('coffeeBreak') : place.placeholderKind === 'free-time' ? t('freeTime') : t('customStop');
  const placeholderLabel = place.name === place.placeholderKind ? presetPlaceholderLabel : place.name;
  const PlaceholderIcon = place.placeholderKind === 'meal' ? IconToolsKitchen : place.placeholderKind === 'coffee' ? IconCoffee : IconSun;
  const CategoryIcon = categoryIcons[place.category];
  const displayName = placeholder ? placeholderLabel : place.name;

  return (
    <Paper
      ref={setNodeRef}
      withBorder
      radius="md"
      p="sm"
      className={`place-card place-card--tint-${place.category.toLowerCase()}${dragDisabled ? '' : ' place-card--draggable'}${placeholder ? ' place-card--placeholder' : ''}${unscheduled ? ' place-card--unscheduled' : ''}`}
      data-selected={selected || undefined}
      data-dragging={isDragging || undefined}
      data-visited={visited || undefined}
      data-expired={stayExpired || undefined}
      {...(isMobile ? {} : attributes)}
      {...(isMobile ? {} : listeners)}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        touchAction: dragDisabled ? undefined : isMobile ? 'pan-y' : 'none',
      }}
      onClick={() => onSelect?.(place.id)}
    >
      <Group align="flex-start" gap="xs" wrap="nowrap">
        <Box className="place-card__lead">
          {placeholder ? (
            <PlaceholderIcon size={18} className="place-card__icon place-card__icon--placeholder" />
          ) : (
            <CategoryIcon size={18} className={`place-card__icon place-card__icon--${place.category.toLowerCase()}`} />
          )}
          {!dragDisabled ? (
            <Tooltip label={`Move ${place.name}`}>
              <ActionIcon
                ref={isMobile ? setActivatorNodeRef : undefined}
                {...(isMobile ? attributes : {})}
                {...(isMobile ? listeners : {})}
                variant="subtle"
                color="gray"
                className="place-card__drag-handle"
                aria-label={`Move ${place.name}`}
                onClick={(event) => event.stopPropagation()}
              >
                <IconGripVertical size={18} />
              </ActionIcon>
            </Tooltip>
          ) : null}
        </Box>

        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
            <Tooltip label={displayName} withinPortal openDelay={400} disabled={displayName.length < 14}>
              <Text fw={650} size="sm" lineClamp={1} className={visited ? 'place-card__name--visited' : undefined}>
                {displayName}
              </Text>
            </Tooltip>
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
                      {editLabel}
                    </Menu.Item>
                  ) : null}
                  {onEnableSchedule && !schedule ? (
                    <Menu.Item leftSection={<IconClock size={15} />} onClick={onEnableSchedule}>
                      Add time
                    </Menu.Item>
                  ) : null}
                  {onMoveTo && moveTargets && currentContainerId ? (
                    <>
                      <Menu.Divider />
                      <Menu.Label>{t('moveToDay')}</Menu.Label>
                      {moveTargets.filter((target) => target.id !== currentContainerId).map((target) => (
                        <Menu.Item key={target.id} onClick={() => onMoveTo(target.id)}>
                          {target.label}
                        </Menu.Item>
                      ))}
                    </>
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
          {!placeholder ? <Group gap={5} wrap="nowrap">
            <IconMapPin size={13} color="var(--mantine-color-dimmed)" />
            <Tooltip label={place.region} withinPortal openDelay={400} disabled={place.region.length < 14}>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {place.region}
              </Text>
            </Tooltip>
          </Group> : null}
          {!placeholder ? <Badge color={categoryColors[place.category]} variant="light" size="xs" autoContrast>
            {categoryLabel(t, place.category)}
          </Badge> : null}
          {!placeholder && clusterLabel ? (
            <Badge
              color="teal"
              variant="outline"
              size="xs"
              leftSection={<IconBuildingCommunity size={11} />}
              className="place-card__cluster-badge"
            >
              {clusterRelationship === 'anchor'
                ? clusterLabel
                : clusterRelationship === 'inside'
                  ? `Inside ${clusterLabel}`
                  : clusterRelationship === 'same-area'
                    ? `In ${clusterLabel}`
                    : `Walkable from ${clusterLabel}`}
            </Badge>
          ) : null}
          {!placeholder ? <Group gap={5} wrap="nowrap" mt={1}>
            {place.importedWithAi ? <Tooltip label="Imported with AI"><IconRobot size={13} color="var(--mantine-color-violet-6)" /></Tooltip> : null}
          </Group> : null}
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
    <Paper withBorder radius="md" p="sm" shadow="lg" className="place-card place-card--preview" style={{ boxShadow: '0 20px 44px rgba(23, 48, 44, 0.25)' }}>
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
