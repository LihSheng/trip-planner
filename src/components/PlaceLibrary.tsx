import { useDeferredValue, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Collapse,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconBuildingCommunity, IconChevronDown, IconChevronRight, IconPlus, IconSearch } from '@tabler/icons-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { LocationCluster, Place, PlaceCategory } from '../types';
import { PlaceCard } from './PlaceCard';
import { categoryLabel, useI18n } from '../i18n';
import { isPlaceholder, PLACE_CATEGORIES } from '../domain/place';

interface PlaceLibraryProps {
  places: Place[];
  clusters?: LocationCluster[];
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onAdd: () => void;
  onEdit: (place: Place) => void;
  onDelete: (place: Place) => void;
  readOnly?: boolean;
  onUngroupCluster?: (clusterId: string) => void;
  onRenameCluster?: (clusterId: string, name: string) => void;
}

export function PlaceLibrary({
  places,
  clusters = [],
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  readOnly = false,
  onUngroupCluster,
  onRenameCluster,
}: PlaceLibraryProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [ungroupTarget, setUngroupTarget] = useState<LocationCluster | null>(null);
  const [renameTarget, setRenameTarget] = useState<LocationCluster | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const filterOptions = [
    { label: t('all'), value: 'All' },
    ...PLACE_CATEGORIES.map((value) => ({ value, label: categoryLabel(t, value) })),
  ];
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const filtered = useMemo(
    () =>
      places.filter((place) => {
        if (isPlaceholder(place) || place.assignmentOf) return false;
        const matchesQuery =
          !deferredQuery ||
          place.name.toLowerCase().includes(deferredQuery) ||
          place.region.toLowerCase().includes(deferredQuery);
        const matchesCategory = category === 'All' || place.category === (category as PlaceCategory);
        return matchesQuery && matchesCategory;
      }),
    [category, deferredQuery, places],
  );
  const filteredIds = new Set(filtered.map((place) => place.id));
  const placeById = new Map(places.map((place) => [place.id, place]));
  const visibleClusters = clusters.flatMap((cluster) => {
    const clusterPlaces = [cluster.anchorPlaceId, ...cluster.members.map((member) => member.placeId)]
      .flatMap((id) => {
        const place = placeById.get(id);
        return place && filteredIds.has(id) ? [place] : [];
      });
    return clusterPlaces.length ? [{ cluster, clusterPlaces }] : [];
  });
  const clusteredIds = new Set(visibleClusters.flatMap(({ clusterPlaces }) => clusterPlaces.map((place) => place.id)));
  const independentPlaces = filtered.filter((place) => !clusteredIds.has(place.id));

  return (
    <Stack gap="sm" className="place-library">
      <Group justify="space-between" align="center">
        <div>
          <Text fw={750}>{t('placesOfInterest')}</Text>
          <Text size="xs" c="dimmed">
            {t('placesCount', { shown: filtered.length, total: places.filter((place) => !place.assignmentOf && !isPlaceholder(place)).length })}
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

      <Select
        aria-label={t('category')}
        value={category}
        onChange={(value) => setCategory(value ?? 'All')}
        data={filterOptions}
        size="xs"
        allowDeselect={false}
      />

      <ScrollArea.Autosize mah={380} type="auto" offsetScrollbars className="place-library__list">
        <SortableContext items={filtered.map((place) => place.id)} strategy={verticalListSortingStrategy}>
          <Stack gap="xs" pr={4} pb="sm">
            {filtered.length ? (
              <>
              {visibleClusters.map(({ cluster, clusterPlaces }) => {
                const expanded = expandedClusters.has(cluster.id);
                return (
                  <Paper key={cluster.id} withBorder radius="md" p="xs" className="location-cluster">
                    <Group justify="space-between" wrap="nowrap">
                      <UnstyledButton
                        className="location-cluster__toggle"
                        onClick={() => setExpandedClusters((current) => {
                          const next = new Set(current);
                          if (next.has(cluster.id)) next.delete(cluster.id); else next.add(cluster.id);
                          return next;
                        })}
                      >
                        <Group gap="xs" wrap="nowrap">
                          <IconBuildingCommunity size={18} />
                          <div>
                            <Text size="sm" fw={750}>{cluster.name}</Text>
                            <Text size="xs" c="dimmed">{clusterPlaceIdsLabel(clusterPlaces.length)}</Text>
                          </div>
                        </Group>
                      </UnstyledButton>
                      <Group gap={4} wrap="nowrap">
                        <Badge size="xs" color="teal" variant="light">{clusterPlaces.length}</Badge>
                        {!readOnly && onUngroupCluster ? (
                          <>
                            {onRenameCluster ? <Button size="compact-xs" variant="subtle" color="teal" onClick={() => { setRenameTarget(cluster); setRenameValue(cluster.name); }}>Rename</Button> : null}
                            <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setUngroupTarget(cluster)}>Ungroup</Button>
                          </>
                        ) : null}
                        {expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                      </Group>
                    </Group>
                    <Collapse expanded={expanded}>
                      <Stack gap="xs" mt="xs" className="location-cluster__places">
                        {clusterPlaces.map((place) => {
                          const member = cluster.members.find((item) => item.placeId === place.id);
                          return (
                            <PlaceCard
                              key={place.id}
                              place={place}
                              selected={place.id === selectedId}
                              dragDisabled
                              clusterLabel={cluster.name}
                              clusterRelationship={member?.relationship ?? 'anchor'}
                              onSelect={onSelect}
                              onEdit={readOnly ? undefined : onEdit}
                              onDelete={readOnly ? undefined : onDelete}
                            />
                          );
                        })}
                      </Stack>
                    </Collapse>
                  </Paper>
                );
              })}
              {independentPlaces.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  selected={place.id === selectedId}
                  dragDisabled
                  onSelect={onSelect}
                  onEdit={readOnly ? undefined : onEdit}
                  onDelete={readOnly ? undefined : onDelete}
                />
              ))}
              </>
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                {t('noPlacesFilter')}
              </Text>
            )}
          </Stack>
        </SortableContext>
      </ScrollArea.Autosize>
      <Modal opened={Boolean(ungroupTarget)} onClose={() => setUngroupTarget(null)} title="Ungroup location cluster?" centered>
        <Stack>
          <Text size="sm">Places in {ungroupTarget?.name} will become independent. Planner visits remain unchanged.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setUngroupTarget(null)}>Cancel</Button>
            <Button color="orange" onClick={() => {
              if (ungroupTarget) onUngroupCluster?.(ungroupTarget.id);
              setUngroupTarget(null);
            }}>Ungroup</Button>
          </Group>
        </Stack>
      </Modal>
      <Modal opened={Boolean(renameTarget)} onClose={() => setRenameTarget(null)} title="Rename location cluster" centered>
        <Stack>
          <TextInput label="Cluster name" value={renameValue} onChange={(event) => setRenameValue(event.currentTarget.value)} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button color="teal" disabled={!renameValue.trim()} onClick={() => {
              if (renameTarget) onRenameCluster?.(renameTarget.id, renameValue);
              setRenameTarget(null);
            }}>Save</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function clusterPlaceIdsLabel(count: number) {
  return `${count} ${count === 1 ? 'place' : 'places'} · move together by anchor`;
}
