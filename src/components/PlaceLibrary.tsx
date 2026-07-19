import { useDeferredValue, useMemo, useState } from 'react';
import {
  ActionIcon,
  Group,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Place, PlaceCategory } from '../types';
import { PlaceCard } from './PlaceCard';
import { useI18n } from '../i18n';

interface PlaceLibraryProps {
  places: Place[];
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onAdd: () => void;
  onEdit: (place: Place) => void;
  onDelete: (place: Place) => void;
  readOnly?: boolean;
}

export function PlaceLibrary({
  places,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  readOnly = false,
}: PlaceLibraryProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const filterOptions = [
    { label: t('all'), value: 'All' }, { label: t('nature'), value: 'Nature' },
    { label: t('culture'), value: 'Culture' }, { label: t('food'), value: 'Food' },
  ];
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const filtered = useMemo(
    () =>
      places.filter((place) => {
        if (place.type === 'placeholder') return false;
        const matchesQuery =
          !deferredQuery ||
          place.name.toLowerCase().includes(deferredQuery) ||
          place.region.toLowerCase().includes(deferredQuery);
        const matchesCategory = category === 'All' || place.category === (category as PlaceCategory);
        return matchesQuery && matchesCategory;
      }),
    [category, deferredQuery, places],
  );

  return (
    <Stack gap="sm" className="place-library">
      <Group justify="space-between" align="center">
        <div>
          <Text fw={750}>{t('placesOfInterest')}</Text>
          <Text size="xs" c="dimmed">
            {t('placesCount', { shown: filtered.length, total: places.length })}
          </Text>
        </div>
        {!readOnly ? <Tooltip label={t('addPlace')}>
          <ActionIcon color="teal" variant="light" radius="xl" onClick={onAdd} aria-label={t('addPlace')}>
            <IconPlus size={18} />
          </ActionIcon>
        </Tooltip> : null}
      </Group>

      <TextInput
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder={t('searchPlaceRegion')}
        leftSection={<IconSearch size={16} />}
        aria-label={t('searchPlaces')}
      />

      <SegmentedControl
        value={category}
        onChange={setCategory}
        data={filterOptions}
        size="xs"
        fullWidth
      />

      <ScrollArea.Autosize mah={380} type="auto" offsetScrollbars className="place-library__list">
        <SortableContext items={filtered.map((place) => place.id)} strategy={verticalListSortingStrategy}>
          <Stack gap="xs" pr={4}>
            {filtered.length ? (
              filtered.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  selected={place.id === selectedId}
                  dragDisabled
                  onSelect={onSelect}
                  onEdit={readOnly ? undefined : onEdit}
                  onDelete={readOnly ? undefined : onDelete}
                />
              ))
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                {t('noPlacesFilter')}
              </Text>
            )}
          </Stack>
        </SortableContext>
      </ScrollArea.Autosize>
    </Stack>
  );
}
