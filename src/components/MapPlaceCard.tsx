import { ActionIcon, Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconCircleCheck, IconCircleCheckFilled, IconEdit, IconExternalLink, IconRoute, IconX } from '@tabler/icons-react';
import type { Place } from '../types';
import type { CurrentLocation } from '../hooks/useCurrentLocation';
import { categoryLabel, useI18n } from '../i18n';
import { googleDirectionsUrl, googleSearchUrl, markerColors } from '../utils/mapPresentation';
import type { ResolvedLeg } from '../utils/routing';
import { transportIcon } from './transportIcons';

interface MapPlaceCardProps {
  place: Place;
  stopNumber?: number;
  dayNumber?: number;
  isUnscheduled: boolean;
  timeLabel?: string;
  visited: boolean;
  nextLeg?: ResolvedLeg;
  currentLocation: CurrentLocation | null;
  readOnly: boolean;
  onClose: () => void;
  onToggleVisited?: () => void;
  onEditPlace: () => void;
}

/** Compact detail card for the selected map place (replaces the Leaflet popup). */
export function MapPlaceCard({ place, stopNumber, dayNumber, isUnscheduled, timeLabel, visited, nextLeg, currentLocation, readOnly, onClose, onToggleVisited, onEditPlace }: MapPlaceCardProps) {
  const { t } = useI18n();
  return (
    <Paper className="map-place-card" role="dialog" aria-label={place.name} withBorder shadow="md" p="sm" radius="md">
      <Stack gap={6}>
        <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
          <Text fw={700} size="sm" lineClamp={1}>{place.name}</Text>
          <ActionIcon variant="subtle" color="gray" size={36} aria-label={t('closeCard')} onClick={onClose}><IconX size={16} /></ActionIcon>
        </Group>
        <Group gap={6} wrap="wrap">
          <Text size="xs" c="dimmed" lineClamp={1}>{place.region}</Text>
          <Badge color={markerColors[place.category]} variant="light" size="sm">{categoryLabel(t, place.category)}</Badge>
          {stopNumber !== undefined ? <Badge size="sm">{t('stop', { number: stopNumber })}</Badge>
            : dayNumber !== undefined ? <Badge size="sm">{t('day', { number: dayNumber })}</Badge>
            : isUnscheduled ? <Badge size="sm" color="gray" variant="light">{t('unscheduled')}</Badge> : null}
        </Group>
        {timeLabel ? <Text size="xs" c="dimmed" ff="monospace">{timeLabel}</Text> : null}
        {place.notes ? <Text size="sm" lineClamp={3} className="map-place-card__notes">{place.notes}</Text> : null}
        {nextLeg ? (
          <Group gap={6} wrap="nowrap" className="map-place-card__next">
            {transportIcon(nextLeg.mode)}
            <Text size="xs" lineClamp={1}>{t('nextStop', { name: nextLeg.to.name })}{nextLeg.minutes !== undefined ? ` · ${nextLeg.minutes} min` : ''}</Text>
          </Group>
        ) : null}
        <Group gap={6} wrap="wrap" mt={2} className="map-place-card__actions">
          {onToggleVisited ? (
            <Button
              size="compact-sm"
              mih={36}
              variant={visited ? 'light' : 'default'}
              color={visited ? 'teal' : undefined}
              aria-pressed={visited}
              aria-label={t('markVisited', { name: place.name })}
              leftSection={visited ? <IconCircleCheckFilled size={16} /> : <IconCircleCheck size={16} />}
              onClick={onToggleVisited}
            >{t(visited ? 'visitedShort' : 'markVisitedShort')}</Button>
          ) : null}
          <Button component="a" href={googleDirectionsUrl(place, currentLocation)} target="_blank" rel="noopener noreferrer" size="compact-sm" mih={36} variant="light" color="teal" leftSection={<IconRoute size={16} />}>{t('getDirections')}</Button>
          <ActionIcon component="a" href={googleSearchUrl(place)} target="_blank" rel="noopener noreferrer" variant="subtle" color="gray" size={36} aria-label={t('googleSearch')}><IconExternalLink size={16} /></ActionIcon>
          {!readOnly ? <ActionIcon variant="subtle" color="gray" size={36} aria-label={t('editPlace')} onClick={onEditPlace}><IconEdit size={16} /></ActionIcon> : null}
        </Group>
      </Stack>
    </Paper>
  );
}
