import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconCalendar,
  IconFocus2,
  IconListDetails,
  IconMap,
  IconPlus,
  IconRoute,
  IconStack2,
  IconTrash,
} from '@tabler/icons-react';
import { divIcon, latLngBounds } from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LocationCluster, Place, PlaceCategory, RouteLegMode, TravelMode, TripDay } from '../types';
import type { CurrentLocation } from '../hooks/useCurrentLocation';
import { formatTripDate } from '../utils/date';
import { categoryLabel, useI18n } from '../i18n';
import { ghostPathOptions, googleMapsRouteUrl, legModeColor, legPathOptions, markerColors, timeRange } from '../utils/mapPresentation';
import { dayLegs } from '../utils/routing';
import { MapLegChips } from './MapLegChips';
import { MapPlaceCard } from './MapPlaceCard';
import { MapStopTimeline } from './MapStopTimeline';
import { transportIcon } from './transportIcons';


const geoapifyMapsApiKey = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined;

interface TaiwanMapProps {
  places: Place[];
  days: TripDay[];
  unscheduledIds: string[];
  startDate: string;
  selectedId: string | null;
  visitedPlaceIds: string[];
  activeView: string;
  clusters: LocationCluster[];
  onSelect: (placeId: string | null) => void;
  onToggleVisited?: (placeId: string) => void;
  onEditPlace: (place: Place) => void;
  onLegModeChange?: (dayId: string, fromPlaceId: string, toPlaceId: string, mode: RouteLegMode) => void;
  onActiveViewChange: (viewId: string) => void;
  onAddDay: () => void;
  onRemoveDay: (dayId: string) => void;
  currentLocation: CurrentLocation | null;
  readOnly?: boolean;
}

interface MapSurfaceProps extends TaiwanMapProps {
  expanded: boolean;
  onToggleExpanded: () => void;
}

function MapSizeController({ expanded }: { expanded: boolean }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 120);
    return () => window.clearTimeout(timer);
  }, [expanded, map]);

  return null;
}

function MapViewportController({
  activeView,
  visiblePlaces,
  selectedPlace,
  cardOpen,
  fitRequest,
}: {
  activeView: string;
  visiblePlaces: Place[];
  selectedPlace?: Place;
  cardOpen: boolean;
  fitRequest: number;
}) {
  const map = useMap();
  const previousView = useRef(activeView);
  const viewChanged = previousView.current !== activeView;

  useEffect(() => {
    if (!visiblePlaces.length) return;

    if (visiblePlaces.length === 1) {
      map.flyTo([visiblePlaces[0].latitude, visiblePlaces[0].longitude], 12, { duration: 0.65 });
    } else {
      map.fitBounds(
        latLngBounds(visiblePlaces.map((place) => [place.latitude, place.longitude] as [number, number])),
        { padding: [64, 64], maxZoom: 12, animate: true, duration: 0.65 },
      );
    }
    previousView.current = activeView;
  }, [activeView, map, visiblePlaces, fitRequest]);

  useEffect(() => {
    if (!selectedPlace || viewChanged) return;
    const zoom = Math.max(map.getZoom(), 11);
    const selectedPoint = map.project([selectedPlace.latitude, selectedPlace.longitude], zoom);
    const mobileOffset = cardOpen && window.matchMedia('(max-width: 47.99em)').matches
      ? map.getSize().y * 0.26
      : window.matchMedia('(max-width: 74.99em)').matches ? map.getSize().y * 0.18 : 0;
    map.flyTo(
      map.unproject(selectedPoint.subtract([0, mobileOffset]), zoom),
      zoom,
      { duration: 0.55 },
    );
  }, [map, selectedPlace, viewChanged, cardOpen]);

  return null;
}

const tickHtml = '<span class="map-pin__tick"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg></span>';

function createMarkerIcon({
  color,
  label,
  selected,
  category,
  visited,
  ghost,
}: {
  color: string;
  label: string;
  selected: boolean;
  category: PlaceCategory;
  visited: boolean;
  ghost: boolean;
}) {
  if (ghost) {
    return divIcon({
      className: 'map-pin-wrapper',
      html: `<div class="map-pin map-pin--ghost" style="--pin-color:${color}"><span>${label}</span></div>`,
      iconSize: [22, 26],
      iconAnchor: [11, 26],
    });
  }
  const accommodation = category === 'Accommodation';
  return divIcon({
    className: 'map-pin-wrapper',
    html: `<div class="map-pin${selected ? ' map-pin--selected' : ''}${accommodation ? ' map-pin--accommodation' : ''}${visited ? ' map-pin--visited' : ''}" style="--pin-color:${color}"><span>${accommodation ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>' : label}</span>${visited ? tickHtml : ''}</div>`,
    iconSize: selected ? [42, 48] : [34, 40],
    iconAnchor: selected ? [21, 48] : [17, 40],
  });
}

const PlaceMarker = memo(function PlaceMarker({
  place,
  index,
  activeDay,
  activeView,
  dayByPlaceId,
  selected,
  visited,
  onSelect,
}: {
  place: Place;
  index: number;
  activeDay?: TripDay;
  activeView: string;
  dayByPlaceId: Map<string, number>;
  selected: boolean;
  visited: boolean;
  onSelect: (placeId: string | null) => void;
}) {
  const dayIndex = dayByPlaceId.get(place.id);
  const label = activeDay ? String(index + 1) : activeView === 'unscheduled' ? 'U' : dayIndex === undefined ? 'U' : String(dayIndex + 1);

  return <Marker
    position={[place.latitude, place.longitude]}
    icon={createMarkerIcon({ color: markerColors[place.category], label, selected, category: place.category, visited, ghost: false })}
    eventHandlers={{ click: () => onSelect(place.id) }}
    zIndexOffset={selected ? 1000 : 0}
  />;
}, (previous, next) => previous.place === next.place
  && previous.index === next.index
  && previous.activeDay === next.activeDay
  && previous.activeView === next.activeView
  && previous.selected === next.selected
  && previous.visited === next.visited);

function MapSurface({
  places,
  days,
  unscheduledIds,
  startDate,
  selectedId,
  visitedPlaceIds = [],
  activeView,
  clusters,
  onSelect,
  onToggleVisited,
  onEditPlace,
  onLegModeChange,
  onActiveViewChange,
  onAddDay,
  onRemoveDay,
  currentLocation,
  readOnly = false,
  expanded,
  onToggleExpanded,
}: MapSurfaceProps) {
  const { t } = useI18n();
  const [useOpenStreetMapFallback, setUseOpenStreetMapFallback] = useState(!geoapifyMapsApiKey);
  const [draggedDayId, setDraggedDayId] = useState<string | null>(null);
  const [daySwitcherCollapsed, setDaySwitcherCollapsed] = useState(false);
  const [showOtherDays, setShowOtherDays] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [fitRequest, setFitRequest] = useState(0);
  // App always keeps a place selected, so closing the card is a local dismissal that a new selection clears.
  const [dismissedCardId, setDismissedCardId] = useState<string | null>(null);
  const selectPlace = (placeId: string | null) => { setDismissedCardId(null); onSelect(placeId); };
  const placesById = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);
  const dayByPlaceId = useMemo(() => {
    const result = new Map<string, number>();
    days.forEach((day, dayIndex) => day.placeIds.forEach((placeId) => result.set(placeId, dayIndex)));
    return result;
  }, [days]);
  const activeDay = days.find((day) => day.id === activeView);
  const activeDayIndex = activeDay ? days.findIndex((day) => day.id === activeDay.id) : -1;

  const visiblePlaces = useMemo(() => {
    if (activeView === 'all') return places;
    const visibleIds = activeView === 'unscheduled' ? unscheduledIds : activeDay?.placeIds ?? [];
    return visibleIds.flatMap((id) => {
      const place = placesById.get(id);
      return place ? [place] : [];
    });
  }, [activeDay?.placeIds, activeView, places, placesById, unscheduledIds]);

  const routePlaces = useMemo(
    () =>
      activeDay
        ? activeDay.placeIds.flatMap((id) => {
            const place = placesById.get(id);
            return place ? [place] : [];
          })
        : [],
    [activeDay, placesById],
  );
  const selectedPlace = visiblePlaces.find((place) => place.id === selectedId);
  const cardPlace = selectedPlace && selectedPlace.id !== dismissedCardId ? selectedPlace : undefined;
  const legs = useMemo(() => (activeDay ? dayLegs(activeDay, placesById, clusters) : []), [activeDay, placesById, clusters]);
  const totalMinutes = useMemo(() => legs.reduce((sum, leg) => sum + (leg.minutes ?? 0), 0), [legs]);
  const dayMinutes = useMemo(
    () => new Map(days.map((day) => [day.id, dayLegs(day, placesById, clusters).reduce((sum, leg) => sum + (leg.minutes ?? 0), 0)])),
    [days, placesById, clusters],
  );
  const ghostDays = useMemo(() => {
    if (!activeDay || !showOtherDays) return [];
    return days.flatMap((day, dayIndex) => day.id === activeDay.id ? [] : [{
      day,
      dayIndex,
      places: day.placeIds.flatMap((id) => { const place = placesById.get(id); return place ? [place] : []; }),
    }]);
  }, [activeDay, days, placesById, showOtherDays]);
  const visibleIdSet = useMemo(() => new Set(visiblePlaces.map((place) => place.id)), [visiblePlaces]);
  const legModes = useMemo(() => [...new Set(legs.map((leg) => leg.mode))], [legs]);
  const categories = useMemo(() => [...new Set(visiblePlaces.map((place) => place.category))], [visiblePlaces]);
  const selectedStopIndex = activeDay && selectedPlace ? activeDay.placeIds.indexOf(selectedPlace.id) : -1;
  const selectedDayIndex = selectedPlace ? dayByPlaceId.get(selectedPlace.id) : undefined;
  const showTimeline = Boolean(activeDay && routePlaces.length > 0);
  const modeLabels: Record<TravelMode, string> = {
    public: t('publicTransport'), walk: t('walk'), bike: t('bike'), car: t('car'), taxi: t('taxi'), other: t('otherTransport'),
  };
  const routeUrl = googleMapsRouteUrl(routePlaces);

  function selectMapView(viewId: string) {
    if (viewId === activeView) {
      setDaySwitcherCollapsed((collapsed) => !collapsed);
      return;
    }

    setDaySwitcherCollapsed(false);
    onActiveViewChange(viewId);
  }

  return (
    <Paper withBorder radius={expanded ? 0 : 'lg'} className={`map-shell${expanded ? ' map-shell--expanded' : ''}${showTimeline ? ' map-shell--with-timeline' : ''}${cardPlace ? ' map-shell--card-open' : ''}`}>
      <MapContainer center={[23.8, 120.95]} zoom={7} minZoom={6} scrollWheelZoom className="taiwan-map">
        <MapSizeController expanded={expanded} />
        <MapViewportController activeView={activeView} visiblePlaces={visiblePlaces} selectedPlace={selectedPlace} cardOpen={Boolean(cardPlace)} fitRequest={fitRequest} />
        <TileLayer
          key={useOpenStreetMapFallback ? 'osm-fallback' : 'geoapify-primary'}
          attribution={
            useOpenStreetMapFallback
              ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              : 'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | <a href="https://openmaptiles.org/">© OpenMapTiles</a> | <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> contributors'
          }
          url={
            useOpenStreetMapFallback
              ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
              : `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${geoapifyMapsApiKey}`
          }
          maxZoom={useOpenStreetMapFallback ? 19 : 20}
          eventHandlers={{ tileerror: () => setUseOpenStreetMapFallback(true) }}
        />

        {ghostDays.map(({ day, dayIndex, places: dayPlaces }) => (
          <Fragment key={`ghost-${day.id}`}>
            {dayPlaces.length > 1 ? (
              <Polyline
                positions={dayPlaces.map((place) => [place.latitude, place.longitude] as [number, number])}
                pathOptions={ghostPathOptions}
              />
            ) : null}
            {dayPlaces.filter((place) => !visibleIdSet.has(place.id)).map((place) => (
              <Marker
                key={place.id}
                position={[place.latitude, place.longitude]}
                icon={createMarkerIcon({ color: markerColors[place.category], label: String(dayIndex + 1), selected: false, category: place.category, visited: false, ghost: true })}
                zIndexOffset={-500}
                interactive
                eventHandlers={{ click: () => { onActiveViewChange(day.id); selectPlace(place.id); } }}
              />
            ))}
          </Fragment>
        ))}

        {legs.map((leg) => {
          const dimmed = selectedId !== null && leg.from.id !== selectedId && leg.to.id !== selectedId;
          return (
            <Polyline
              key={`${leg.from.id}->${leg.to.id}`}
              positions={[[leg.from.latitude, leg.from.longitude], [leg.to.latitude, leg.to.longitude]]}
              pathOptions={dimmed ? { ...legPathOptions[leg.mode], opacity: 0.3 } : legPathOptions[leg.mode]}
            />
          );
        })}

        {activeDay ? (
          <MapLegChips
            legs={legs}
            dayDefaultMode={activeDay.travelMode ?? 'public'}
            readOnly={readOnly || !onLegModeChange}
            selectedPlaceId={selectedId}
            onLegModeChange={(from, to, mode) => onLegModeChange?.(activeDay.id, from, to, mode)}
          />
        ) : null}

        {currentLocation ? (
          <>
            <Circle
              center={[currentLocation.latitude, currentLocation.longitude]}
              radius={currentLocation.accuracy}
              pathOptions={{ color: '#228be6', fillColor: '#228be6', fillOpacity: 0.12, weight: 1 }}
              interactive={false}
            />
            <CircleMarker
              center={[currentLocation.latitude, currentLocation.longitude]}
              radius={9}
              pathOptions={{ color: '#ffffff', fillColor: '#228be6', fillOpacity: 1, weight: 3 }}
            >
              <Popup>
                <Text size="sm" fw={700}>{t('liveLocation')}</Text>
              </Popup>
            </CircleMarker>
          </>
        ) : null}

        {visiblePlaces.map((place, index) => <PlaceMarker
          key={place.id}
          place={place}
          index={index}
          activeDay={activeDay}
          activeView={activeView}
          dayByPlaceId={dayByPlaceId}
          selected={place.id === selectedId}
          visited={visitedPlaceIds.includes(place.id)}
          onSelect={selectPlace}
        />)}
      </MapContainer>

      <Box className={`map-day-switcher${daySwitcherCollapsed ? ' map-day-switcher--collapsed' : ''}`}>
        <Box className="map-day-switcher__scroll" aria-label={t('itineraryDaySelector')}>
          <Group gap="xs" wrap="nowrap">
            {!daySwitcherCollapsed || activeView === 'all' ? <Button
              size="xs"
              radius="xl"
              variant={activeView === 'all' ? 'filled' : 'white'}
              color="teal"
              leftSection={<IconMap size={14} />}
              rightSection={
                <Badge circle size="sm" variant={activeView === 'all' ? 'white' : 'light'} color="teal">
                  {places.length}
                </Badge>
              }
              onClick={() => selectMapView('all')}
            >
              {t('all')}
            </Button> : null}
            {!daySwitcherCollapsed || activeView === 'unscheduled' ? <Button
              size="xs"
              radius="xl"
              variant={activeView === 'unscheduled' ? 'filled' : 'white'}
              color="gray"
              rightSection={
                <Badge circle size="sm" variant={activeView === 'unscheduled' ? 'white' : 'light'} color="gray">
                  {unscheduledIds.length}
                </Badge>
              }
              onClick={() => selectMapView('unscheduled')}
            >
              {t('unscheduled')}
            </Button> : null}
            {days.map((day, index) => (!daySwitcherCollapsed || activeView === day.id ? (
              <Button
                key={day.id}
                draggable={!readOnly}
                size="xs"
                radius="xl"
                variant={activeView === day.id ? 'filled' : 'white'}
                color={activeView === day.id ? 'teal' : 'dark'}
                leftSection={<IconCalendar size={14} />}
                rightSection={
                  <Badge circle size="sm" variant={activeView === day.id ? 'white' : 'light'} color="teal">
                    {day.placeIds.length}
                  </Badge>
                }
                onClick={() => selectMapView(day.id)}
                onDragStart={readOnly ? undefined : (event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', day.id);
                  setDraggedDayId(day.id);
                }}
                onDragEnd={() => setDraggedDayId(null)}
              >
                <span>{t('day', { number: index + 1 })}</span>
                {day.placeIds.length >= 2 ? <span className="map-day-switcher__sub">{transportIcon(day.travelMode ?? 'public')} {dayMinutes.get(day.id) ?? 0}m</span> : null}
              </Button>
            ) : null))}
            {!readOnly && !daySwitcherCollapsed ? <Tooltip label={t('addItineraryDay')}>
              <ActionIcon
                size="lg"
                radius="xl"
                variant="white"
                color="teal"
                aria-label={t('addItineraryDay')}
                onClick={onAddDay}
              >
                <IconPlus size={17} />
              </ActionIcon>
            </Tooltip> : null}
            {!readOnly && !daySwitcherCollapsed && draggedDayId ? (
              <Tooltip label={t('removeDay')}>
                <ActionIcon
                  size="lg"
                  radius="xl"
                  variant="filled"
                  color="red"
                  className="map-day-delete-target"
                  aria-label={t('removeDay')}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    onRemoveDay(draggedDayId);
                    setDraggedDayId(null);
                  }}
                >
                  <IconTrash size={17} />
                </ActionIcon>
              </Tooltip>
            ) : null}
          </Group>
        </Box>
      </Box>

      <Box className="map-route-summary">
        <Stack gap={2}>
          <Text fw={750} size="sm">
            {activeDay
                ? `${t('day', { number: activeDayIndex + 1 })}: ${activeDay.label || t('untitledDay')}`
              : activeView === 'unscheduled'
                ? t('unscheduledPlaces')
                : t('completeOverview')}
          </Text>
          <Text size="xs" c="dimmed">
            {activeDay
              ? `${formatTripDate(startDate, activeDayIndex)} · ${t('stopsCount', { count: routePlaces.length })}`
              : t('visiblePlaces', { count: visiblePlaces.length })}
          </Text>
          {activeDay ? (
            <div className="map-route-summary__stats">
              <div><span>{routePlaces.length}</span><small>{t('stopsLabel')}</small></div>
              <div><span>{totalMinutes}</span><small>{t('minTravelLabel')}</small></div>
            </div>
          ) : null}
          {activeDay?.routeStale ? <div className="map-route-summary__stale"><IconAlertTriangle size={14} />{t('routeStaleShort')}</div> : null}
        </Stack>
        {routeUrl ? (
          <Button
            size="xs"
            variant="light"
            color="teal"
            leftSection={<IconRoute size={15} />}
            onClick={() => window.open(routeUrl, '_blank', 'noopener,noreferrer')}
          >
            {t('openRoute')}
          </Button>
        ) : null}
      </Box>

      <Box className="map-control-rail" role="group" aria-label={t('mapControls')}>
        <Tooltip label={expanded ? t('exitFullScreen') : t('fullScreenMap')}>
          <ActionIcon size="lg" radius="xl" variant="white" color="teal" aria-label={expanded ? t('exitFullScreen') : t('openFullScreenMap')} onClick={onToggleExpanded}>
            {expanded ? <IconArrowsMinimize size={18} /> : <IconArrowsMaximize size={18} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t('fitStops')}>
          <ActionIcon size="lg" radius="xl" variant="white" color="teal" aria-label={t('fitStops')} onClick={() => setFitRequest((value) => value + 1)}>
            <IconFocus2 size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t(showOtherDays ? 'hideOtherDays' : 'showOtherDays')}>
          <ActionIcon size="lg" radius="xl" variant="white" color="teal" aria-label={t(showOtherDays ? 'hideOtherDays' : 'showOtherDays')} aria-pressed={showOtherDays} onClick={() => setShowOtherDays((value) => !value)}>
            <IconStack2 size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t('toggleLegend')}>
          <ActionIcon size="lg" radius="xl" variant="white" color="teal" aria-label={t('toggleLegend')} aria-pressed={showLegend} onClick={() => setShowLegend((value) => !value)}>
            <IconListDetails size={18} />
          </ActionIcon>
        </Tooltip>
      </Box>

      {showLegend && (categories.length > 0 || legModes.length > 0) ? (
        <Box className="map-legend">
          {categories.map((category) => (
            <div key={category}><span className="map-legend__swatch" style={{ background: markerColors[category] }} />{categoryLabel(t, category)}</div>
          ))}
          {activeDay ? legModes.map((mode) => (
            <div key={mode}><span className="map-legend__swatch" style={{ background: legModeColor[mode] }} />{modeLabels[mode]}</div>
          )) : null}
        </Box>
      ) : null}

      {showTimeline && activeDay ? (
        <MapStopTimeline
          day={activeDay}
          places={routePlaces}
          legs={legs}
          selectedId={selectedId}
          visitedPlaceIds={visitedPlaceIds}
          onSelect={selectPlace}
        />
      ) : null}

      {cardPlace ? (
        <MapPlaceCard
          place={cardPlace}
          stopNumber={selectedStopIndex >= 0 ? selectedStopIndex + 1 : undefined}
          dayNumber={selectedStopIndex < 0 && selectedDayIndex !== undefined ? selectedDayIndex + 1 : undefined}
          isUnscheduled={unscheduledIds.includes(cardPlace.id)}
          timeLabel={activeDay && activeDay.stopSchedules?.[cardPlace.id]?.startTime ? timeRange(activeDay, cardPlace.id) : undefined}
          visited={visitedPlaceIds.includes(cardPlace.id)}
          nextLeg={legs.find((leg) => leg.from.id === cardPlace.id)}
          currentLocation={currentLocation}
          readOnly={readOnly}
          onClose={() => setDismissedCardId(cardPlace.id)}
          onToggleVisited={onToggleVisited ? () => onToggleVisited(cardPlace.id) : undefined}
          onEditPlace={() => onEditPlace(cardPlace)}
        />
      ) : null}

      {!visiblePlaces.length ? (
        <Box className="map-empty-state">
          <Text fw={700}>{t('noPlacesView')}</Text>
          <Text size="sm" c="dimmed">
            {t('addOrMovePlace')}
          </Text>
        </Box>
      ) : null}
    </Paper>
  );
}

export function TaiwanMap(props: TaiwanMapProps) {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => setExpanded((value) => !value);

  if (expanded) {
    return (
      <Modal
        opened
        onClose={() => setExpanded(false)}
        fullScreen
        withCloseButton={false}
        styles={{
          header: { display: 'none' },
          body: { height: '100%', padding: 0 },
          content: { height: '100%' },
        }}
      >
        <MapSurface {...props} expanded onToggleExpanded={toggleExpanded} />
      </Modal>
    );
  }

  return <MapSurface {...props} expanded={false} onToggleExpanded={toggleExpanded} />;
}
