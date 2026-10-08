import { useEffect, useReducer, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DomEvent } from 'leaflet';
import { useMap } from 'react-leaflet';
import type { Place, RouteLegMode, TravelMode } from '../types';
import { useI18n } from '../i18n';
import { legGoogleMapsUrl } from '../utils/mapPresentation';
import type { ResolvedLeg } from '../utils/routing';
import { TransportLegChip } from './TransportLegChip';

/** Legs shorter than this many pixels would cover their own pins, so no chip is drawn. */
export function shouldRenderLegChip(pixelLength: number): boolean {
  return pixelLength >= 56;
}

interface MapLegChipsProps {
  legs: ResolvedLeg[];
  dayDefaultMode: TravelMode;
  readOnly: boolean;
  selectedPlaceId: string | null;
  onLegModeChange: (fromPlaceId: string, toPlaceId: string, mode: RouteLegMode) => void;
}

const touches = (leg: { from: Place; to: Place }, id: string) => leg.from.id === id || leg.to.id === id;

/** Transport chips at the midpoint of each leg, overlaid on the Leaflet map. Render inside <MapContainer>. */
export function MapLegChips({ legs, dayDefaultMode, readOnly, selectedPlaceId, onLegModeChange }: MapLegChipsProps) {
  const map = useMap();
  const { t } = useI18n();
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    map.on('move zoom resize viewreset', tick);
    return () => { map.off('move zoom resize viewreset', tick); };
  }, [map]);

  useEffect(() => {
    if (!overlayRef.current) return;
    DomEvent.disableClickPropagation(overlayRef.current);
    DomEvent.disableScrollPropagation(overlayRef.current);
  }, []);

  const chips = legs.flatMap((leg) => {
    const a = map.latLngToContainerPoint([leg.from.latitude, leg.from.longitude]);
    const b = map.latLngToContainerPoint([leg.to.latitude, leg.to.longitude]);
    if (!shouldRenderLegChip(a.distanceTo(b))) return [];
    const dimmed = selectedPlaceId !== null && !touches(leg, selectedPlaceId);
    return [(
      <div
        key={`${leg.from.id}->${leg.to.id}`}
        className="map-leg-chip"
        style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2, ...(dimmed ? { opacity: 0.55 } : {}) }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <TransportLegChip
          mode={leg.mode}
          dayDefaultMode={dayDefaultMode}
          isOverride={leg.legMode !== 'default'}
          minutes={leg.minutes}
          context={leg.inside ? t('insideVenue') : leg.relationship === 'same-area' ? t('inArea') : leg.relationship === 'walkable' ? t('nearby') : undefined}
          readOnly={readOnly}
          routeUrl={legGoogleMapsUrl(leg.from, leg.to, leg.mode)}
          onChange={(mode) => onLegModeChange(leg.from.id, leg.to.id, mode)}
        />
      </div>
    )];
  });

  return createPortal(<div className="map-leg-overlay" ref={overlayRef}>{chips}</div>, map.getContainer());
}
