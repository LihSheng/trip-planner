import { Fragment, useEffect, useRef, type CSSProperties } from 'react';
import { Text } from '@mantine/core';
import type { Place, TripDay } from '../types';
import { useI18n } from '../i18n';
import { legModeColor, markerColors, timeRange } from '../utils/mapPresentation';
import type { ResolvedLeg } from '../utils/routing';
import { transportIcon } from './transportIcons';

interface MapStopTimelineProps {
  day: TripDay;
  places: Place[];
  /** legs[i] is between places[i] and places[i + 1]. */
  legs: ResolvedLeg[];
  selectedId: string | null;
  visitedPlaceIds: string[];
  onSelect: (placeId: string) => void;
}

/** Horizontal strip of the active day's stops with the legs between them. */
export function MapStopTimeline({ day, places, legs, selectedId, visitedPlaceIds, onSelect }: MapStopTimelineProps) {
  const { t } = useI18n();
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    selectedRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [selectedId]);

  return (
    <div className="map-stop-timeline" role="list" aria-label={t('stopTimeline')}>
      {places.map((place, index) => {
        const selected = place.id === selectedId;
        const visited = visitedPlaceIds.includes(place.id);
        const range = timeRange(day, place.id);
        const leg = legs[index];
        return (
          <Fragment key={place.id}>
            <button
              type="button"
              role="listitem"
              ref={selected ? selectedRef : undefined}
              className={`map-stop-timeline__stop${selected ? ' map-stop-timeline__stop--selected' : ''}${visited ? ' map-stop-timeline__stop--visited' : ''}`}
              onClick={() => onSelect(place.id)}
            >
              <Text size="xs" c="dimmed" ff="monospace">{range === 'No fixed time' ? t('noFixedTime') : range}</Text>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ flex: '0 0 18px', width: 18, height: 18, borderRadius: '50%', background: markerColors[place.category], color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{index + 1}</span>
                <Text size="sm" fw={600} lineClamp={1} className="map-stop-timeline__name">{place.name}</Text>
              </span>
            </button>
            {index < places.length - 1 && leg ? (
              <div className="map-stop-timeline__leg" style={{ '--leg-color': legModeColor[leg.mode] } as CSSProperties}>
                {transportIcon(leg.mode)}
                {leg.minutes !== undefined ? <Text size="xs" c="dimmed">{`${leg.minutes} min`}</Text> : null}
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
