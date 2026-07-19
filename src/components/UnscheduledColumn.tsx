import { useEffect, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ActionIcon, Badge, Box, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp, IconInbox } from '@tabler/icons-react';
import type { Place } from '../types';
import { PlaceCard } from './PlaceCard';
import { useI18n } from '../i18n';

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
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 75em)');
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled' });

  useEffect(() => {
    if (isDesktop) setCollapsed(false);
  }, [isDesktop]);

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
        data-collapsible={!isDesktop || undefined}
        onClick={isDesktop ? undefined : () => setCollapsed((value) => !value)}
      >
        <Group justify="space-between">
          <Group gap="xs">
            <IconInbox size={17} />
            <Text fw={750} size="sm">
              {t('unscheduled')}
            </Text>
          </Group>
          <Group gap={2} wrap="nowrap">
            <Badge variant="light" color="gray">
              {collapsed ? t('spots', { count: places.length }) : places.length}
            </Badge>
            {!isDesktop ? (
              <Tooltip label={collapsed ? t('expandUnscheduled') : t('collapseUnscheduled')}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label={collapsed ? t('expandUnscheduled') : t('collapseUnscheduled')}
                  onClick={(event) => {
                    event.stopPropagation();
                    setCollapsed((value) => !value);
                  }}
                >
                  {collapsed ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
                </ActionIcon>
              </Tooltip>
            ) : null}
          </Group>
        </Group>
        {!collapsed ? (
          <Text size="xs" c="dimmed" mt={4}>
            {t('unscheduledHint')}
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
                  {t('dropPlacesLater')}
                </Text>
              </Box>
            )}
          </Stack>
        </SortableContext>
      ) : null}
    </Paper>
  );
}
