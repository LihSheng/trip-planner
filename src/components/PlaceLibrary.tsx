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

const filterOptions = [
  { label: 'All', value: 'All' },
  { label: 'Nature', value: 'Nature' },
  { label: 'Culture', value: 'Culture' },
  { label: 'Food', value: 'Food' },
];

interface PlaceLibraryProps {
  places: Place[];
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onAdd: () => void;
  onEdit: (place: Place) => void;
  onDelete: (place: Place) => void;
}

export function PlaceLibrary({
  places,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
}: PlaceLibraryProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const filtered = useMemo(
    () =>
      places.filter((place) => {
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
          <Text fw={750}>Places of interest</Text>
          <Text size="xs" c="dimmed">
            {filtered.length} of {places.length} places
          </Text>
        </div>
        <Tooltip label="Add a place">
          <ActionIcon color="teal" variant="light" radius="xl" onClick={onAdd} aria-label="Add a place">
            <IconPlus size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <TextInput
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="Search a place or region"
        leftSection={<IconSearch size={16} />}
        aria-label="Search places"
      />

      <SegmentedControl
        value={category}
        onChange={setCategory}
        data={filterOptions}
        size="xs"
        fullWidth
      />

      <ScrollArea.Autosize mah={380} type="auto" offsetScrollbars>
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
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                No places match this filter.
              </Text>
            )}
          </Stack>
        </SortableContext>
      </ScrollArea.Autosize>
    </Stack>
  );
}
